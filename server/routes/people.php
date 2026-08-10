<?php
// People routes (the pilot resource).

const CATEGORY_PREFIX = [
    'EMPLOYEE'         => '0',
    'CUSTOMER'         => '1',
    'SERVICE_PROVIDER' => '2',
];

// Scalar columns that map 1:1 between DB (snake_case) and wire (camelCase).
const PEOPLE_SCALARS = [
    'first_name'          => 'firstName',
    'last_name'           => 'lastName',
    'father_name'         => 'fatherName',
    'sex'                 => 'sex',
    'company_name'        => 'companyName',
    'county'              => 'county',
    'city'                => 'city',
    'postal_code'         => 'postalCode',
    'national_code'       => 'nationalCode',
    'iban'                => 'iban',
    'bank_account_number' => 'bankAccountNumber',
    'card_no'             => 'cardNo',
    'birth_date'          => 'birthDate',
    'description'         => 'description',
];

// DB row -> wire object (camelCase, decoded JSON arrays, ISO timestamps).
function people_to_wire($row)
{
    $out = [
        'id'       => $row['id'],
        'category' => $row['category'],
        'phones'   => $row['phones'] ? json_decode($row['phones'], true) : [],
        'addresses' => $row['addresses'] ? json_decode($row['addresses'], true) : [],
        'createdAt' => to_iso($row['created_at']),
        'updatedAt' => to_iso($row['updated_at']),
        'deletedAt' => to_iso($row['deleted_at']),
    ];
    foreach (PEOPLE_SCALARS as $col => $key) {
        $out[$key] = $row[$col] ?? '';
    }
    return $out;
}

// Build the column => value map for an insert/update from a wire body.
function people_from_wire($body)
{
    $cols = [];
    foreach (PEOPLE_SCALARS as $col => $key) {
        if (array_key_exists($key, $body)) {
            $cols[$col] = $body[$key] === null ? '' : (string) $body[$key];
        }
    }
    if (array_key_exists('phones', $body)) {
        $cols['phones'] = json_encode(array_values((array) $body['phones']), JSON_UNESCAPED_UNICODE);
    }
    if (array_key_exists('addresses', $body)) {
        $cols['addresses'] = json_encode(array_values((array) $body['addresses']), JSON_UNESCAPED_UNICODE);
    }
    return $cols;
}

// GET /people?updatedAfter=<iso>
// No param: all non-deleted. With param: everything changed since then, incl. soft-deletes.
function people_list($params, $body, $user)
{
    $after = $_GET['updatedAfter'] ?? null;
    if ($after) {
        $ts = from_iso($after);
        if ($ts === null) {
            json_error('Invalid updatedAfter timestamp', 422);
        }
        $stmt = db()->prepare('SELECT * FROM people WHERE updated_at > :ts ORDER BY updated_at ASC');
        $stmt->execute([':ts' => $ts]);
    } else {
        $stmt = db()->query('SELECT * FROM people WHERE deleted_at IS NULL ORDER BY id ASC');
    }
    $rows = array_map('people_to_wire', $stmt->fetchAll());
    json_response(['people' => $rows]);
}

// GET /people/{id}
function people_get($params, $body, $user)
{
    $stmt = db()->prepare('SELECT * FROM people WHERE id = :id LIMIT 1');
    $stmt->execute([':id' => $params['id']]);
    $row = $stmt->fetch();
    if (!$row || $row['deleted_at'] !== null) {
        json_error('Person not found', 404);
    }
    json_response(['person' => people_to_wire($row)]);
}

// POST /people  -> creates with a server-generated, category-prefixed id
function people_create($params, $body, $user)
{
    require_fields($body, ['category']);
    $category = $body['category'];
    if (!isset(CATEGORY_PREFIX[$category])) {
        json_error('Invalid category', 422);
    }

    $cols = people_from_wire($body);
    $now = now_utc();

    db()->beginTransaction();
    try {
        $n  = next_counter('people_' . CATEGORY_PREFIX[$category]);
        $id = CATEGORY_PREFIX[$category] . '-' . $n;

        $cols['id']         = $id;
        $cols['category']   = $category;
        $cols['created_by'] = $user['id'];
        $cols['updated_by'] = $user['id'];
        $cols['created_at'] = $now;
        $cols['updated_at'] = $now;

        $fields = array_keys($cols);
        $place  = array_map(fn ($f) => ':' . $f, $fields);
        $sql = 'INSERT INTO people (' . implode(',', $fields) . ') VALUES (' . implode(',', $place) . ')';
        $stmt = db()->prepare($sql);
        foreach ($cols as $k => $v) {
            $stmt->bindValue(':' . $k, $v);
        }
        $stmt->execute();
        db()->commit();
    } catch (Throwable $e) {
        db()->rollBack();
        json_error('Failed to create person', 500, $e->getMessage());
    }

    $stmt = db()->prepare('SELECT * FROM people WHERE id = :id');
    $stmt->execute([':id' => $id]);
    json_response(['person' => people_to_wire($stmt->fetch())], 201);
}

// PUT /people/{id}
function people_update($params, $body, $user)
{
    $id = $params['id'];
    $stmt = db()->prepare('SELECT id FROM people WHERE id = :id LIMIT 1');
    $stmt->execute([':id' => $id]);
    if (!$stmt->fetch()) {
        json_error('Person not found', 404);
    }

    $cols = people_from_wire($body);
    if (isset($body['category']) && isset(CATEGORY_PREFIX[$body['category']])) {
        $cols['category'] = $body['category'];
    }
    $cols['updated_by'] = $user['id'];
    $cols['updated_at'] = now_utc();

    $set = implode(', ', array_map(fn ($f) => "$f = :$f", array_keys($cols)));
    $stmt = db()->prepare("UPDATE people SET $set WHERE id = :id");
    foreach ($cols as $k => $v) {
        $stmt->bindValue(':' . $k, $v);
    }
    $stmt->bindValue(':id', $id);
    $stmt->execute();

    $stmt = db()->prepare('SELECT * FROM people WHERE id = :id');
    $stmt->execute([':id' => $id]);
    json_response(['person' => people_to_wire($stmt->fetch())]);
}

// DELETE /people/{id}  -> soft delete
function people_delete($params, $body, $user)
{
    $id = $params['id'];
    $now = now_utc();
    $stmt = db()->prepare(
        'UPDATE people SET deleted_at = :d, updated_at = :u, updated_by = :by WHERE id = :id AND deleted_at IS NULL'
    );
    $stmt->execute([':d' => $now, ':u' => $now, ':by' => $user['id'], ':id' => $id]);
    if ($stmt->rowCount() === 0) {
        json_error('Person not found', 404);
    }
    json_response(['ok' => true, 'id' => $id]);
}
