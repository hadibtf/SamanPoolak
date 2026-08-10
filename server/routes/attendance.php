<?php
// Attendance routes — clock scans (حضور و غیاب). One row per device/manual scan.
// Mirrors the expenses CRUD template + a bulk import endpoint for the converter.

const ATTENDANCE_SELECT = 'SELECT a.* FROM attendance a';

function attendance_to_wire($row)
{
    return [
        'id'         => (int) $row['id'],
        'cardNo'     => $row['card_no'],
        'dateKey'    => $row['date_key'],
        'time'       => $row['time'],
        'status'     => isset($row['status']) && $row['status'] !== null ? (int) $row['status'] : null,
        'insertType' => isset($row['insert_type']) && $row['insert_type'] !== null ? (int) $row['insert_type'] : null,
        'source'     => $row['source'],
        'createdBy'  => isset($row['created_by']) && $row['created_by'] !== null ? (int) $row['created_by'] : null,
        'createdAt'  => to_iso($row['created_at']),
        'updatedAt'  => to_iso($row['updated_at']),
        'deletedAt'  => to_iso($row['deleted_at']),
    ];
}

function attendance_from_wire($body)
{
    $cols = [];
    if (array_key_exists('cardNo', $body))     $cols['card_no'] = (string) $body['cardNo'];
    if (array_key_exists('dateKey', $body))    $cols['date_key'] = (string) $body['dateKey'];
    if (array_key_exists('time', $body))       $cols['time'] = (string) $body['time'];
    if (array_key_exists('status', $body))     $cols['status'] = $body['status'] === null ? null : (int) $body['status'];
    if (array_key_exists('insertType', $body)) $cols['insert_type'] = $body['insertType'] === null ? null : (int) $body['insertType'];
    if (array_key_exists('source', $body))     $cols['source'] = (string) $body['source'];
    return $cols;
}

// GET /attendance?updatedAfter=<iso>
function attendance_list($params, $body, $user)
{
    $after = $_GET['updatedAfter'] ?? null;
    if ($after) {
        $ts = from_iso($after);
        if ($ts === null) {
            json_error('Invalid updatedAfter timestamp', 422);
        }
        $stmt = db()->prepare(ATTENDANCE_SELECT . ' WHERE a.updated_at > :ts ORDER BY a.updated_at ASC');
        $stmt->execute([':ts' => $ts]);
    } else {
        $stmt = db()->query(ATTENDANCE_SELECT . ' WHERE a.deleted_at IS NULL ORDER BY a.id ASC');
    }
    json_response(['attendance' => array_map('attendance_to_wire', $stmt->fetchAll())]);
}

// POST /attendance  -> single manual scan
function attendance_create($params, $body, $user)
{
    require_fields($body, ['cardNo', 'dateKey', 'time']);
    $cols = attendance_from_wire($body);
    if (empty($cols['source'])) {
        $cols['source'] = 'manual';
    }
    $now = now_utc();
    $cols['created_by'] = $user['id'];
    $cols['updated_by'] = $user['id'];
    $cols['created_at'] = $now;
    $cols['updated_at'] = $now;

    $id = attendance_upsert_row($cols);

    $stmt = db()->prepare(ATTENDANCE_SELECT . ' WHERE a.id = :id');
    $stmt->execute([':id' => $id]);
    json_response(['attendance' => attendance_to_wire($stmt->fetch())], 201);
}

// PUT /attendance/{id}
function attendance_update($params, $body, $user)
{
    $id = $params['id'];
    $stmt = db()->prepare('SELECT id FROM attendance WHERE id = :id LIMIT 1');
    $stmt->execute([':id' => $id]);
    if (!$stmt->fetch()) {
        json_error('Attendance record not found', 404);
    }

    $cols = attendance_from_wire($body);
    $cols['updated_by'] = $user['id'];
    $cols['updated_at'] = now_utc();

    $set = implode(', ', array_map(fn ($f) => "$f = :$f", array_keys($cols)));
    $stmt = db()->prepare("UPDATE attendance SET $set WHERE id = :id");
    foreach ($cols as $k => $v) {
        $stmt->bindValue(':' . $k, $v);
    }
    $stmt->bindValue(':id', $id);
    $stmt->execute();

    $stmt = db()->prepare(ATTENDANCE_SELECT . ' WHERE a.id = :id');
    $stmt->execute([':id' => $id]);
    json_response(['attendance' => attendance_to_wire($stmt->fetch())]);
}

// DELETE /attendance/{id}  -> soft delete
function attendance_delete($params, $body, $user)
{
    $id = $params['id'];
    $now = now_utc();
    $stmt = db()->prepare(
        'UPDATE attendance SET deleted_at = :d, updated_at = :u, updated_by = :by WHERE id = :id AND deleted_at IS NULL'
    );
    $stmt->execute([':d' => $now, ':u' => $now, ':by' => $user['id'], ':id' => $id]);
    if ($stmt->rowCount() === 0) {
        json_error('Attendance record not found', 404);
    }
    json_response(['ok' => true, 'id' => (int) $id]);
}

// Insert or revive a scan row, deduped on (card_no, date_key, time, source).
// Returns the row id. $cols must already include audit/timestamp columns.
function attendance_upsert_row($cols)
{
    // ON DUPLICATE KEY: revive a soft-deleted match and refresh its audit cols.
    $fields = array_keys($cols);
    $place  = array_map(fn ($f) => ':' . $f, $fields);
    $sql = 'INSERT INTO attendance (' . implode(',', $fields) . ') VALUES (' . implode(',', $place) . ') '
        . 'ON DUPLICATE KEY UPDATE deleted_at = NULL, status = VALUES(status), '
        . 'insert_type = VALUES(insert_type), updated_at = VALUES(updated_at), updated_by = VALUES(updated_by)';
    $stmt = db()->prepare($sql);
    foreach ($cols as $k => $v) {
        $stmt->bindValue(':' . $k, $v);
    }
    $stmt->execute();
    $id = (int) db()->lastInsertId();
    if ($id === 0) {
        // Existing row updated — look it up by the unique key.
        $stmt = db()->prepare(
            'SELECT id FROM attendance WHERE card_no = :c AND date_key = :d AND time = :t AND source = :s LIMIT 1'
        );
        $stmt->execute([
            ':c' => $cols['card_no'], ':d' => $cols['date_key'],
            ':t' => $cols['time'], ':s' => $cols['source'],
        ]);
        $id = (int) ($stmt->fetchColumn() ?: 0);
    }
    return $id;
}

// POST /attendance/import  -> bulk device import.
// Body: { records:[{cardNo,dateKey,time,status,insertType}], employees?:[…] }
// Device scans (source='device') for the imported date range replace prior
// device scans; manual rows are never touched. employees[] is accepted for
// shape-compatibility with the file export but not stored (names come from
// people.card_no on the client).
function attendance_import($params, $body, $user)
{
    $records = isset($body['records']) && is_array($body['records']) ? $body['records'] : [];
    if (!$records) {
        json_error('No records to import', 422);
    }
    $now = now_utc();

    db()->beginTransaction();
    try {
        // Replace device scans only for the date range present in this import,
        // so re-importing a month doesn't wipe other months. Manual rows kept.
        $keys = [];
        foreach ($records as $r) {
            $k = (string) ($r['dateKey'] ?? '');
            if ($k !== '') {
                $keys[$k] = true;
            }
        }
        if ($keys) {
            $minK = min(array_keys($keys));
            $maxK = max(array_keys($keys));
            $del = db()->prepare(
                "UPDATE attendance SET deleted_at = :d, updated_at = :u, updated_by = :by
                 WHERE source = 'device' AND deleted_at IS NULL AND date_key >= :min AND date_key <= :max"
            );
            $del->execute([':d' => $now, ':u' => $now, ':by' => $user['id'], ':min' => $minK, ':max' => $maxK]);
        }

        $count = 0;
        foreach ($records as $r) {
            $cols = attendance_from_wire($r);
            if (empty($cols['card_no']) || empty($cols['date_key'])) {
                continue;
            }
            $cols['source']     = 'device';
            $cols['created_by'] = $user['id'];
            $cols['updated_by'] = $user['id'];
            $cols['created_at'] = $now;
            $cols['updated_at'] = $now;
            attendance_upsert_row($cols);
            $count += 1;
        }
        db()->commit();
    } catch (Throwable $e) {
        db()->rollBack();
        json_error('Attendance import failed', 500, $e->getMessage());
    }

    json_response(['ok' => true, 'count' => $count]);
}
