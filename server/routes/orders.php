<?php
// Orders routes. An order is a header (customer + date) plus an items[] array
// stored as JSON. Order numbers are server-assigned (YYMMN, monthly reset).

// SELECT prefix that joins the creator's display name for the "entered by" stamp.
const ORDERS_SELECT = 'SELECT o.*, u.display_name AS created_by_name
    FROM orders o LEFT JOIN users u ON u.id = o.created_by';

// DB row -> wire object (camelCase, decoded items, ISO timestamps).
function orders_to_wire($row)
{
    return [
        'id'            => (int) $row['id'],
        'orderNumber'   => $row['order_number'],
        'date'          => $row['date'],
        'dateText'      => $row['date_text'],
        'customerId'    => $row['customer_id'],
        'customerName'  => $row['customer_name'],
        'items'         => $row['items'] ? json_decode($row['items'], true) : [],
        'createdBy'     => isset($row['created_by']) && $row['created_by'] !== null ? (int) $row['created_by'] : null,
        'createdByName' => $row['created_by_name'] ?? '',
        'createdAt'     => to_iso($row['created_at']),
        'updatedAt'     => to_iso($row['updated_at']),
        'deletedAt'     => to_iso($row['deleted_at']),
    ];
}

// Column => value map for insert/update from a wire body (header fields only).
function orders_from_wire($body)
{
    $cols = [];
    if (array_key_exists('date', $body))         $cols['date'] = (string) $body['date'];
    if (array_key_exists('dateText', $body))     $cols['date_text'] = (string) $body['dateText'];
    if (array_key_exists('customerId', $body))   $cols['customer_id'] = (string) $body['customerId'];
    if (array_key_exists('customerName', $body)) $cols['customer_name'] = (string) $body['customerName'];
    if (array_key_exists('items', $body)) {
        $cols['items'] = json_encode(array_values((array) $body['items']), JSON_UNESCAPED_UNICODE);
    }
    return $cols;
}

// GET /orders?updatedAfter=<iso>
function orders_list($params, $body, $user)
{
    $after = $_GET['updatedAfter'] ?? null;
    if ($after) {
        $ts = from_iso($after);
        if ($ts === null) {
            json_error('Invalid updatedAfter timestamp', 422);
        }
        $stmt = db()->prepare(ORDERS_SELECT . ' WHERE o.updated_at > :ts ORDER BY o.updated_at ASC');
        $stmt->execute([':ts' => $ts]);
    } else {
        $stmt = db()->query(ORDERS_SELECT . ' WHERE o.deleted_at IS NULL ORDER BY o.id ASC');
    }
    json_response(['orders' => array_map('orders_to_wire', $stmt->fetchAll())]);
}

// GET /orders/{id}
function orders_get($params, $body, $user)
{
    $stmt = db()->prepare(ORDERS_SELECT . ' WHERE o.id = :id LIMIT 1');
    $stmt->execute([':id' => $params['id']]);
    $row = $stmt->fetch();
    if (!$row || $row['deleted_at'] !== null) {
        json_error('Order not found', 404);
    }
    json_response(['order' => orders_to_wire($row)]);
}

// POST /orders  -> creates with a server-generated YYMMN order number
function orders_create($params, $body, $user)
{
    require_fields($body, ['date']);
    $date = (string) $body['date'];
    $prefix = strlen($date) >= 6 ? substr($date, 2, 4) : '';   // YYMM
    if ($prefix === '') {
        json_error('Invalid order date', 422);
    }

    $cols = orders_from_wire($body);
    $now = now_utc();

    db()->beginTransaction();
    try {
        $n = next_counter('order_' . $prefix);
        $orderNumber = $prefix . $n;

        $cols['order_number'] = $orderNumber;
        $cols['created_by']   = $user['id'];
        $cols['updated_by']   = $user['id'];
        $cols['created_at']   = $now;
        $cols['updated_at']   = $now;

        $fields = array_keys($cols);
        $place  = array_map(fn ($f) => ':' . $f, $fields);
        $stmt = db()->prepare('INSERT INTO orders (' . implode(',', $fields) . ') VALUES (' . implode(',', $place) . ')');
        foreach ($cols as $k => $v) {
            $stmt->bindValue(':' . $k, $v);
        }
        $stmt->execute();
        $id = (int) db()->lastInsertId();
        db()->commit();
    } catch (Throwable $e) {
        db()->rollBack();
        json_error('Failed to create order', 500, $e->getMessage());
    }

    $stmt = db()->prepare(ORDERS_SELECT . ' WHERE o.id = :id');
    $stmt->execute([':id' => $id]);
    json_response(['order' => orders_to_wire($stmt->fetch())], 201);
}

// PUT /orders/{id}  -> order number is preserved
function orders_update($params, $body, $user)
{
    $id = $params['id'];
    $stmt = db()->prepare('SELECT id FROM orders WHERE id = :id LIMIT 1');
    $stmt->execute([':id' => $id]);
    if (!$stmt->fetch()) {
        json_error('Order not found', 404);
    }

    $cols = orders_from_wire($body);
    $cols['updated_by'] = $user['id'];
    $cols['updated_at'] = now_utc();

    $set = implode(', ', array_map(fn ($f) => "$f = :$f", array_keys($cols)));
    $stmt = db()->prepare("UPDATE orders SET $set WHERE id = :id");
    foreach ($cols as $k => $v) {
        $stmt->bindValue(':' . $k, $v);
    }
    $stmt->bindValue(':id', $id);
    $stmt->execute();

    $stmt = db()->prepare(ORDERS_SELECT . ' WHERE o.id = :id');
    $stmt->execute([':id' => $id]);
    json_response(['order' => orders_to_wire($stmt->fetch())]);
}

// DELETE /orders/{id}  -> soft delete
function orders_delete($params, $body, $user)
{
    $id = $params['id'];
    $now = now_utc();
    $stmt = db()->prepare(
        'UPDATE orders SET deleted_at = :d, updated_at = :u, updated_by = :by WHERE id = :id AND deleted_at IS NULL'
    );
    $stmt->execute([':d' => $now, ':u' => $now, ':by' => $user['id'], ':id' => $id]);
    if ($stmt->rowCount() === 0) {
        json_error('Order not found', 404);
    }
    json_response(['ok' => true, 'id' => (int) $id]);
}
