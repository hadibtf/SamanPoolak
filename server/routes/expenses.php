<?php
// Expense routes — shared workshop expense tracker. Amounts are stored in Rial.

// SELECT prefix that joins the creator's display name for the "entered by" stamp.
const EXPENSES_SELECT = 'SELECT e.*, u.display_name AS created_by_name
    FROM expenses e LEFT JOIN users u ON u.id = e.created_by';

function expenses_to_wire($row)
{
    return [
        'id'            => (int) $row['id'],
        'date'          => $row['date'],
        'dateText'      => $row['date_text'],
        'title'         => $row['title'],
        'category'      => $row['category'],
        'amount'        => (float) $row['amount'],
        'paidTo'        => $row['paid_to'],
        'description'   => $row['description'] ?? '',
        'createdBy'     => isset($row['created_by']) && $row['created_by'] !== null ? (int) $row['created_by'] : null,
        'createdByName' => $row['created_by_name'] ?? '',
        'createdAt'     => to_iso($row['created_at']),
        'updatedAt'     => to_iso($row['updated_at']),
        'deletedAt'     => to_iso($row['deleted_at']),
    ];
}

function expenses_from_wire($body)
{
    $cols = [];
    if (array_key_exists('date', $body))        $cols['date'] = (string) $body['date'];
    if (array_key_exists('dateText', $body))    $cols['date_text'] = (string) $body['dateText'];
    if (array_key_exists('title', $body))       $cols['title'] = (string) $body['title'];
    if (array_key_exists('category', $body))    $cols['category'] = (string) $body['category'];
    if (array_key_exists('amount', $body))      $cols['amount'] = (int) round((float) $body['amount']);
    if (array_key_exists('paidTo', $body))      $cols['paid_to'] = (string) $body['paidTo'];
    if (array_key_exists('description', $body)) $cols['description'] = (string) $body['description'];
    return $cols;
}

// GET /expenses?updatedAfter=<iso>
function expenses_list($params, $body, $user)
{
    require_management($user);
    $after = $_GET['updatedAfter'] ?? null;
    if ($after) {
        $ts = from_iso($after);
        if ($ts === null) {
            json_error('Invalid updatedAfter timestamp', 422);
        }
        $stmt = db()->prepare(EXPENSES_SELECT . ' WHERE e.updated_at > :ts ORDER BY e.updated_at ASC');
        $stmt->execute([':ts' => $ts]);
    } else {
        $stmt = db()->query(EXPENSES_SELECT . ' WHERE e.deleted_at IS NULL ORDER BY e.id ASC');
    }
    json_response(['expenses' => array_map('expenses_to_wire', $stmt->fetchAll())]);
}

// POST /expenses
function expenses_create($params, $body, $user)
{
    require_management($user);
    require_fields($body, ['title']);
    $cols = expenses_from_wire($body);
    $now = now_utc();
    $cols['created_by'] = $user['id'];
    $cols['updated_by'] = $user['id'];
    $cols['created_at'] = $now;
    $cols['updated_at'] = $now;

    $fields = array_keys($cols);
    $place  = array_map(fn ($f) => ':' . $f, $fields);
    $stmt = db()->prepare('INSERT INTO expenses (' . implode(',', $fields) . ') VALUES (' . implode(',', $place) . ')');
    foreach ($cols as $k => $v) {
        $stmt->bindValue(':' . $k, $v);
    }
    $stmt->execute();
    $id = (int) db()->lastInsertId();

    $stmt = db()->prepare(EXPENSES_SELECT . ' WHERE e.id = :id');
    $stmt->execute([':id' => $id]);
    json_response(['expense' => expenses_to_wire($stmt->fetch())], 201);
}

// PUT /expenses/{id}
function expenses_update($params, $body, $user)
{
    require_management($user);
    $id = $params['id'];
    $stmt = db()->prepare('SELECT id FROM expenses WHERE id = :id LIMIT 1');
    $stmt->execute([':id' => $id]);
    if (!$stmt->fetch()) {
        json_error('Expense not found', 404);
    }

    $cols = expenses_from_wire($body);
    $cols['updated_by'] = $user['id'];
    $cols['updated_at'] = now_utc();

    $set = implode(', ', array_map(fn ($f) => "$f = :$f", array_keys($cols)));
    $stmt = db()->prepare("UPDATE expenses SET $set WHERE id = :id");
    foreach ($cols as $k => $v) {
        $stmt->bindValue(':' . $k, $v);
    }
    $stmt->bindValue(':id', $id);
    $stmt->execute();

    $stmt = db()->prepare(EXPENSES_SELECT . ' WHERE e.id = :id');
    $stmt->execute([':id' => $id]);
    json_response(['expense' => expenses_to_wire($stmt->fetch())]);
}

// DELETE /expenses/{id}  -> soft delete
function expenses_delete($params, $body, $user)
{
    require_management($user);
    $id = $params['id'];
    $now = now_utc();
    $stmt = db()->prepare(
        'UPDATE expenses SET deleted_at = :d, updated_at = :u, updated_by = :by WHERE id = :id AND deleted_at IS NULL'
    );
    $stmt->execute([':d' => $now, ':u' => $now, ':by' => $user['id'], ':id' => $id]);
    if ($stmt->rowCount() === 0) {
        json_error('Expense not found', 404);
    }
    json_response(['ok' => true, 'id' => (int) $id]);
}
