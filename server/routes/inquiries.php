<?php
// Public landing-page inquiries plus authenticated back-office listing.

const INQUIRIES_SELECT = 'SELECT * FROM inquiries';

function inquiries_to_wire($row)
{
    return [
        'id'        => (int) $row['id'],
        'name'      => $row['name'],
        'phone'     => $row['phone'],
        'product'   => $row['product'],
        'quantity'  => $row['quantity'],
        'note'      => $row['note'] ?? '',
        'source'    => $row['source'],
        'ip'        => $row['ip'] ?? '',
        'userAgent' => $row['user_agent'] ?? '',
        'createdAt' => to_iso($row['created_at']),
        'handledAt' => to_iso($row['handled_at']),
    ];
}

function inquiries_from_wire($body)
{
    return [
        'name'       => trim((string) ($body['name'] ?? '')),
        'phone'      => trim((string) ($body['phone'] ?? '')),
        'product'    => trim((string) ($body['product'] ?? '')),
        'quantity'   => trim((string) ($body['quantity'] ?? '')),
        'note'       => trim((string) ($body['note'] ?? '')),
        'source'     => trim((string) ($body['source'] ?? 'direct')),
        'ip'         => substr((string) ($_SERVER['REMOTE_ADDR'] ?? ''), 0, 64),
        'user_agent' => substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255),
    ];
}

// POST /inquiries  public landing form
function inquiries_create($params, $body, $user)
{
    require_fields($body, ['name', 'phone', 'product']);
    $cols = inquiries_from_wire($body);
    $allowedSources = ['direct', 'whatsapp', 'telegram'];
    if (!in_array($cols['source'], $allowedSources, true)) {
        $cols['source'] = 'direct';
    }
    $cols['created_at'] = now_utc();

    $fields = array_keys($cols);
    $place  = array_map(fn ($f) => ':' . $f, $fields);
    $stmt = db()->prepare('INSERT INTO inquiries (' . implode(',', $fields) . ') VALUES (' . implode(',', $place) . ')');
    foreach ($cols as $k => $v) {
        $stmt->bindValue(':' . $k, $v);
    }
    $stmt->execute();
    $id = (int) db()->lastInsertId();

    $stmt = db()->prepare(INQUIRIES_SELECT . ' WHERE id = :id');
    $stmt->execute([':id' => $id]);
    json_response(['inquiry' => inquiries_to_wire($stmt->fetch())], 201);
}

// GET /inquiries
function inquiries_list($params, $body, $user)
{
    $stmt = db()->query(INQUIRIES_SELECT . ' ORDER BY id DESC');
    json_response(['inquiries' => array_map('inquiries_to_wire', $stmt->fetchAll())]);
}

// PUT /inquiries/{id}  { handled: true|false }
function inquiries_update($params, $body, $user)
{
    $id = $params['id'];
    $handled = !empty($body['handled']);
    $stmt = db()->prepare('UPDATE inquiries SET handled_at = :handled_at WHERE id = :id');
    $stmt->execute([
        ':handled_at' => $handled ? now_utc() : null,
        ':id' => $id,
    ]);
    if ($stmt->rowCount() === 0) {
        json_error('Inquiry not found', 404);
    }

    $stmt = db()->prepare(INQUIRIES_SELECT . ' WHERE id = :id');
    $stmt->execute([':id' => $id]);
    json_response(['inquiry' => inquiries_to_wire($stmt->fetch())]);
}
