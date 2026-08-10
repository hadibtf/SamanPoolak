<?php
// Holiday routes — official Jalali holiday days. Uploaded one YEAR.json per year
// from Settings; Fridays are derived on the client, not stored here.

const HOLIDAYS_SELECT = 'SELECT h.* FROM holidays h';

function holidays_to_wire($row)
{
    return [
        'id'          => (int) $row['id'],
        'dateKey'     => $row['date_key'],
        'year'        => $row['year'],
        'description' => $row['description'] ?? '',
        'createdAt'   => to_iso($row['created_at']),
        'updatedAt'   => to_iso($row['updated_at']),
        'deletedAt'   => to_iso($row['deleted_at']),
    ];
}

// GET /holidays?updatedAfter=<iso>
function holidays_list($params, $body, $user)
{
    $after = $_GET['updatedAfter'] ?? null;
    if ($after) {
        $ts = from_iso($after);
        if ($ts === null) {
            json_error('Invalid updatedAfter timestamp', 422);
        }
        $stmt = db()->prepare(HOLIDAYS_SELECT . ' WHERE h.updated_at > :ts ORDER BY h.updated_at ASC');
        $stmt->execute([':ts' => $ts]);
    } else {
        $stmt = db()->query(HOLIDAYS_SELECT . ' WHERE h.deleted_at IS NULL ORDER BY h.date_key ASC');
    }
    json_response(['holidays' => array_map('holidays_to_wire', $stmt->fetchAll())]);
}

// POST /holidays/import
// Body: { data:[{ shamsiDate:"1405/01/01", isHoliday, holidayDesription }] }
// (the YEAR.json shape). Replaces all stored holidays for the years present.
function holidays_import($params, $body, $user)
{
    $data = isset($body['data']) && is_array($body['data']) ? $body['data'] : [];
    if (!$data) {
        json_error('No calendar data to import', 422);
    }
    $now = now_utc();

    // Build {date_key => description} for holiday days, grouped by year.
    $byKey = [];
    $years = [];
    foreach ($data as $row) {
        if (empty($row['isHoliday'])) {
            continue;
        }
        $key = preg_replace('/[^0-9]/', '', (string) ($row['shamsiDate'] ?? ''));
        if (strlen($key) !== 8) {
            continue;
        }
        $byKey[$key] = (string) ($row['holidayDesription'] ?? ($row['description'] ?? ''));
        $years[substr($key, 0, 4)] = true;
    }
    if (!$byKey) {
        json_error('No holiday days found in file', 422);
    }

    db()->beginTransaction();
    try {
        // Soft-delete the existing rows for each year being replaced.
        $del = db()->prepare(
            'UPDATE holidays SET deleted_at = :d, updated_at = :u, updated_by = :by
             WHERE year = :y AND deleted_at IS NULL'
        );
        foreach (array_keys($years) as $y) {
            $del->execute([':d' => $now, ':u' => $now, ':by' => $user['id'], ':y' => $y]);
        }

        $sql = 'INSERT INTO holidays (date_key, year, description, created_by, updated_by, created_at, updated_at)
                VALUES (:k, :y, :desc, :cb, :ub, :ca, :ua)
                ON DUPLICATE KEY UPDATE deleted_at = NULL, description = VALUES(description),
                  year = VALUES(year), updated_at = VALUES(updated_at), updated_by = VALUES(updated_by)';
        $ins = db()->prepare($sql);
        foreach ($byKey as $key => $desc) {
            $ins->execute([
                ':k' => $key, ':y' => substr($key, 0, 4), ':desc' => $desc,
                ':cb' => $user['id'], ':ub' => $user['id'], ':ca' => $now, ':ua' => $now,
            ]);
        }
        db()->commit();
    } catch (Throwable $e) {
        db()->rollBack();
        json_error('Holiday import failed', 500, $e->getMessage());
    }

    json_response(['ok' => true, 'count' => count($byKey), 'years' => array_keys($years)]);
}
