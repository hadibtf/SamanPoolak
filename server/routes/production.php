<?php
// Manager-entered production records and management statistics.

function production_employees($params, $body, $user)
{
    require_admin($user);
    $stmt = db()->query("SELECT employee_choices.* FROM (
        SELECT ea.user_id, p.id AS person_id, u.username,
            COALESCE(NULLIF(TRIM(CONCAT(p.first_name, ' ', p.last_name)), ''), u.display_name, u.username, CONCAT('کارمند ', p.id)) AS employee_name
        FROM people p LEFT JOIN employee_accounts ea ON ea.person_id = p.id
        LEFT JOIN users u ON u.id = ea.user_id
        WHERE p.category = 'EMPLOYEE' AND p.deleted_at IS NULL
        UNION ALL
        SELECT u.id AS user_id, NULL AS person_id, u.username,
            COALESCE(NULLIF(TRIM(u.display_name), ''), u.username) AS employee_name
        FROM users u LEFT JOIN employee_accounts ea ON ea.user_id = u.id
        WHERE u.role = 'employee' AND ea.person_id IS NULL
    ) employee_choices ORDER BY employee_name, user_id, person_id");
    $employees = array_map(fn ($r) => [
        'userId' => $r['user_id'] === null ? null : (int) $r['user_id'], 'personId' => $r['person_id'],
        'employeeKey' => $r['person_id'] !== null ? 'person:' . $r['person_id'] : 'user:' . $r['user_id'],
        'name' => $r['employee_name'] ?: '—',
        'username' => $r['username'],
    ], $stmt->fetchAll());
    json_response(['employees' => $employees]);
}
function production_normalize_digits($value)
{
    return strtr((string) $value, [
        '۰' => '0', '۱' => '1', '۲' => '2', '۳' => '3', '۴' => '4',
        '۵' => '5', '۶' => '6', '۷' => '7', '۸' => '8', '۹' => '9',
        '٠' => '0', '١' => '1', '٢' => '2', '٣' => '3', '٤' => '4',
        '٥' => '5', '٦' => '6', '٧' => '7', '٨' => '8', '٩' => '9',
    ]);
}

function production_valid_date($value)
{
    if (!preg_match('/^(\d{4})(\d{2})(\d{2})$/', (string) $value, $m)) return false;
    $year = (int) $m[1]; $month = (int) $m[2]; $day = (int) $m[3];
    if ($year < 1405 || $year > 1499 || $month < 1 || $month > 12 || $day < 1) return false;
    // Matches react-date-object's Persian calendar for the supported year range.
    $leapYears = [1408,1412,1416,1420,1424,1428,1432,1436,1441,1445,1449,1453,1457,1461,1465,1469,1473,1478,1482,1486,1490,1494,1498];
    return $day <= ($month <= 6 ? 31 : ($month <= 11 ? 30 : (in_array($year, $leapYears, true) ? 30 : 29)));
}

function production_valid_quantity($value)
{
    $normalized = production_normalize_digits($value);
    // MySQL stores DECIMAL(14,3); reject values that would round or overflow.
    return preg_match('/^(?:0|[1-9]\d{0,10})(?:\.\d{1,3})?$/', $normalized) === 1
        && (float) $normalized > 0;
}

function production_pieces_from_weight($weightKg, $weightOf10Grams)
{
    return (int) round($weightKg * 1000 * 10 / $weightOf10Grams);
}

function production_recalculate_manager_log_quantities($orderId, $items)
{
    try {
        $select = db()->prepare('SELECT id, total_weight_grams FROM manager_production_logs
            WHERE order_id = :orderId AND order_item_uid = :itemUid AND total_weight_grams > 0');
        $update = db()->prepare('UPDATE manager_production_logs SET quantity = :quantity WHERE id = :id');
        foreach ((array) $items as $item) {
            $itemUid = trim((string) ($item['uid'] ?? ''));
            $weightOf10 = (float) ($item['weightOf10'] ?? 0);
            if ($itemUid === '' || $weightOf10 <= 0) continue;
            $select->execute([':orderId' => $orderId, ':itemUid' => $itemUid]);
            foreach ($select->fetchAll() as $log) {
                $quantity = production_pieces_from_weight((float) $log['total_weight_grams'] / 1000, $weightOf10);
                $update->execute([':quantity' => $quantity <= 99999999999 ? $quantity : 0, ':id' => $log['id']]);
            }
        }
    } catch (PDOException $e) {
        $mysqlErrorCode = isset($e->errorInfo[1]) ? (string) $e->errorInfo[1] : '';
        if ((string) $e->getCode() === '42S02' || $mysqlErrorCode === '1146') return;
        throw $e;
    }
}

function manager_production_log_to_wire($row)
{
    return [
        'id' => 'manager-' . (int) $row['id'], 'isManagerEntry' => true,
        'employeeUserId' => $row['employee_user_id'] === null ? null : (int) $row['employee_user_id'],
        'employeePersonId' => $row['employee_person_id'] ?? null,
        'employeeName' => $row['employee_name'] ?? '', 'orderId' => (int) $row['order_id'],
        'orderItemUid' => $row['order_item_uid'], 'quantity' => (float) $row['quantity'],
        'totalWeightGrams' => (float) $row['total_weight_grams'], 'productionDate' => $row['production_date'],
        'createdAt' => to_iso($row['created_at']), 'updatedAt' => to_iso($row['updated_at']),
        'deletedAt' => to_iso($row['deleted_at']),
    ];
}

function production_manager_employee_identity($body)
{
    $personId = trim((string) ($body['employeePersonId'] ?? ''));
    if ($personId !== '') {
        $stmt = db()->prepare("SELECT p.id AS person_id, ea.user_id
            FROM people p LEFT JOIN employee_accounts ea ON ea.person_id = p.id
            WHERE p.id = :personId AND p.category = 'EMPLOYEE' AND p.deleted_at IS NULL LIMIT 1");
        $stmt->execute([':personId' => $personId]);
        $person = $stmt->fetch();
        return $person ? ['personId' => $person['person_id'], 'userId' => $person['user_id'] === null ? null : (int) $person['user_id']] : null;
    }

    // Continue accepting employee IDs from older browser clients during rollout.
    $userIdRaw = production_normalize_digits($body['employeeUserId'] ?? '');
    $userId = ctype_digit($userIdRaw) ? (int) $userIdRaw : 0;
    if ($userId <= 0) return null;
    $stmt = db()->prepare("SELECT p.id AS person_id, u.id AS user_id
        FROM users u LEFT JOIN employee_accounts ea ON ea.user_id = u.id
        LEFT JOIN people p ON p.id = ea.person_id
        WHERE u.id = :userId AND u.role = 'employee'
            AND (ea.person_id IS NULL OR (p.category = 'EMPLOYEE' AND p.deleted_at IS NULL)) LIMIT 1");
    $stmt->execute([':userId' => $userId]);
    $person = $stmt->fetch();
    return $person ? ['personId' => $person['person_id'], 'userId' => (int) $person['user_id']] : null;
}

function production_manager_log_create($params, $body, $user)
{
    require_admin($user);
    require_fields($body, ['weightKg', 'productionDate', 'submissionKey']);
    $orderId = (int) $params['orderId'];
    $itemUid = trim((string) $params['itemUid']);
    $employee = production_manager_employee_identity($body);
    $weightKg = (float) production_normalize_digits($body['weightKg']);
    $date = production_normalize_digits($body['productionDate']);
    $key = trim((string) $body['submissionKey']);
    if ($orderId <= 0 || $itemUid === '' || !$employee
        || !production_valid_quantity($body['weightKg']) || $weightKg * 1000 > 99999999999.999
        || !production_valid_date($date) || !preg_match('/^[a-f0-9-]{16,36}$/i', $key)) {
        json_error('Invalid manager production log', 422);
    }

    db()->beginTransaction();
    try {
        // Serialize manager entries for this order item and read its current
        // sample weight so quantity can be calculated when available.
        $orderStmt = db()->prepare('SELECT items FROM orders WHERE id = :id AND deleted_at IS NULL LIMIT 1 FOR UPDATE');
        $orderStmt->execute([':id' => $orderId]);
        $order = $orderStmt->fetch();
        if (!$order) { db()->rollBack(); json_error('Order not found', 404); }
        $item = null;
        foreach (($order['items'] ? json_decode($order['items'], true) : []) as $candidate) {
            if (($candidate['uid'] ?? '') === $itemUid) { $item = $candidate; break; }
        }
        if (!$item) { db()->rollBack(); json_error('Order item not found', 404); }
        $weightOf10 = (float) ($item['weightOf10'] ?? 0);
        $quantity = $weightOf10 > 0 ? production_pieces_from_weight($weightKg, $weightOf10) : 0;
        if ($weightOf10 > 0 && ($quantity <= 0 || $quantity > 99999999999)) { db()->rollBack(); json_error('Measured weight does not represent a valid piece count', 422); }
        $totalWeightGrams = $weightKg * 1000;
        $productionStopped = !empty($item['productionStopped']) || ($item['state'] ?? '') === 'PRODUCTION_COMPLETE';

        $existing = db()->prepare('SELECT id, employee_user_id, employee_person_id, order_id, order_item_uid, total_weight_grams, production_date, deleted_at
            FROM manager_production_logs WHERE submission_key = :key LIMIT 1');
        $existing->execute([':key' => $key]);
        $previous = $existing->fetch();
        if ($previous) {
            db()->commit();
            if ($previous['deleted_at'] !== null) json_error('This submission key belongs to a deleted log', 409);
            $sameEmployee = $previous['employee_person_id'] !== null
                ? $previous['employee_person_id'] === $employee['personId']
                : (int) $previous['employee_user_id'] === (int) $employee['userId'];
            if (!$sameEmployee || (int) $previous['order_id'] !== $orderId
                || $previous['order_item_uid'] !== $itemUid
                || abs((float) $previous['total_weight_grams'] - $totalWeightGrams) > 0.00001
                || $previous['production_date'] !== $date) {
                json_error('Submission key already used for different production', 409);
            }
            production_manager_log_response((int) $previous['id'], 200);
        }
        if ($productionStopped) {
            db()->rollBack(); json_error('Production is confirmed complete for this order item', 409);
        }

        $now = now_utc();
        $insert = db()->prepare('INSERT INTO manager_production_logs
            (employee_user_id, employee_person_id, entered_by, order_id, order_item_uid, quantity, total_weight_grams, production_date, submission_key, created_at)
            VALUES (:employeeId, :personId, :enteredBy, :orderId, :itemUid, :quantity, :weight, :date, :key, :createdAt)');
        $insert->execute([':employeeId' => $employee['userId'], ':personId' => $employee['personId'], ':enteredBy' => $user['id'], ':orderId' => $orderId,
            ':itemUid' => $itemUid, ':quantity' => $quantity, ':weight' => $totalWeightGrams,
            ':date' => $date, ':key' => $key, ':createdAt' => $now]);
        $id = (int) db()->lastInsertId();
        db()->commit();
    } catch (PDOException $e) {
        if (db()->inTransaction()) db()->rollBack();
        if ((string) $e->getCode() === '23000') json_error('This manager production submission was already recorded', 409);
        $mysqlErrorCode = isset($e->errorInfo[1]) ? (string) $e->errorInfo[1] : '';
        if ((string) $e->getCode() === '42S02' || $mysqlErrorCode === '1146') {
            json_error('ساختار ثبت تولید مدیر روی سرور آماده نیست. مهاجرت پایگاه داده را اجرا کنید.', 503);
        }
        json_error('Failed to save manager production log', 500, $e->getMessage());
    } catch (Throwable $e) {
        if (db()->inTransaction()) db()->rollBack();
        json_error('Failed to save manager production log', 500, $e->getMessage());
    }
    production_manager_log_response($id, 201);
}

function production_manager_log_id($value)
{
    if (!preg_match('/^(?:manager-)?([1-9]\d*)$/', (string) $value, $matches)) return 0;
    return (int) $matches[1];
}

function production_manager_log_update($params, $body, $user)
{
    require_admin($user);
    require_fields($body, ['weightKg', 'productionDate']);
    $orderId = (int) $params['orderId'];
    $itemUid = trim((string) $params['itemUid']);
    $logId = production_manager_log_id($params['logId'] ?? '');
    $employee = production_manager_employee_identity($body);
    $weightKg = (float) production_normalize_digits($body['weightKg']);
    $date = production_normalize_digits($body['productionDate']);
    if ($orderId <= 0 || $itemUid === '' || $logId <= 0 || !$employee
        || !production_valid_quantity($body['weightKg']) || $weightKg * 1000 > 99999999999.999
        || !production_valid_date($date)) {
        json_error('Invalid manager production log', 422);
    }

    db()->beginTransaction();
    try {
        $orderStmt = db()->prepare('SELECT items FROM orders WHERE id = :id AND deleted_at IS NULL LIMIT 1 FOR UPDATE');
        $orderStmt->execute([':id' => $orderId]);
        $order = $orderStmt->fetch();
        if (!$order) { db()->rollBack(); json_error('Order not found', 404); }
        $item = null;
        foreach (($order['items'] ? json_decode($order['items'], true) : []) as $candidate) {
            if (($candidate['uid'] ?? '') === $itemUid) { $item = $candidate; break; }
        }
        if (!$item) { db()->rollBack(); json_error('Order item not found', 404); }
        $weightOf10 = (float) ($item['weightOf10'] ?? 0);

        $existing = db()->prepare('SELECT id FROM manager_production_logs
            WHERE id = :id AND order_id = :orderId AND order_item_uid = :itemUid AND deleted_at IS NULL FOR UPDATE');
        $existing->execute([':id' => $logId, ':orderId' => $orderId, ':itemUid' => $itemUid]);
        $existingLog = $existing->fetch();
        if (!$existingLog) { db()->rollBack(); json_error('Manager production log not found', 404); }

        $quantity = $weightOf10 > 0 ? production_pieces_from_weight($weightKg, $weightOf10) : 0;
        if ($weightOf10 > 0 && ($quantity <= 0 || $quantity > 99999999999)) { db()->rollBack(); json_error('Measured weight does not represent a valid piece count', 422); }
        $totalWeightGrams = $weightKg * 1000;
        $update = db()->prepare('UPDATE manager_production_logs SET employee_user_id = :employeeId, employee_person_id = :personId, quantity = :quantity,
            total_weight_grams = :weight, production_date = :date, updated_at = :updated
            WHERE id = :id AND order_id = :orderId AND order_item_uid = :itemUid AND deleted_at IS NULL');
        $update->execute([':employeeId' => $employee['userId'], ':personId' => $employee['personId'], ':quantity' => $quantity, ':weight' => $totalWeightGrams,
            ':date' => $date, ':updated' => now_utc(), ':id' => $logId, ':orderId' => $orderId, ':itemUid' => $itemUid]);
        production_sync_order_item_completion($orderId, $itemUid, (int) $user['id']);
        db()->commit();
    } catch (Throwable $e) {
        if (db()->inTransaction()) db()->rollBack();
        json_error('Failed to edit manager production log', 500, $e->getMessage());
    }
    production_manager_log_response($logId, 200);
}

function production_manager_log_delete($params, $body, $user)
{
    require_admin($user);
    $orderId = (int) $params['orderId'];
    $itemUid = trim((string) $params['itemUid']);
    $logId = production_manager_log_id($params['logId'] ?? '');
    if ($orderId <= 0 || $itemUid === '' || $logId <= 0) json_error('Invalid manager production log', 422);

    db()->beginTransaction();
    try {
        $update = db()->prepare('UPDATE manager_production_logs SET deleted_at = :deleted, updated_at = :updated
            WHERE id = :id AND order_id = :orderId AND order_item_uid = :itemUid AND deleted_at IS NULL');
        $now = now_utc();
        $update->execute([':deleted' => $now, ':updated' => $now, ':id' => $logId, ':orderId' => $orderId, ':itemUid' => $itemUid]);
        if ($update->rowCount() !== 1) { db()->rollBack(); json_error('Manager production log not found', 404); }
        production_sync_order_item_completion($orderId, $itemUid, (int) $user['id']);
        db()->commit();
    } catch (Throwable $e) {
        if (db()->inTransaction()) db()->rollBack();
        json_error('Failed to delete manager production log', 500, $e->getMessage());
    }
    json_response(['ok' => true]);
}

function production_manager_log_response($id, $status)
{
    $log = db()->prepare("SELECT l.*, COALESCE(NULLIF(TRIM(CONCAT(p.first_name, ' ', p.last_name)), ''), u.display_name, u.username) AS employee_name, 'manager' AS source
        FROM manager_production_logs l
        LEFT JOIN users u ON u.id = l.employee_user_id
        LEFT JOIN employee_accounts ea ON ea.user_id = u.id
        LEFT JOIN people p ON p.id = COALESCE(l.employee_person_id, ea.person_id)
        WHERE l.id = :id AND l.deleted_at IS NULL");
    $log->execute([':id' => $id]);
    $row = $log->fetch();
    if (!$row) json_error('Manager production log not found', 404);
    json_response(['productionLog' => manager_production_log_to_wire($row)], $status);
}

function production_state_is_after_completion($state)
{
    return in_array($state, [
        'SENT_HARDENING', 'RETURN_HARDENING', 'SENT_PLATING', 'RETURN_PLATING', 'READY',
        'PACKAGED', 'SENT_FREIGHT', 'DELIVERED_WORKSHOP', 'DELIVERED_PLATING',
    ], true);
}

function production_sync_order_item_completion($orderId, $itemUid, $updatedBy)
{
    $orderStmt = db()->prepare('SELECT items FROM orders WHERE id = :id AND deleted_at IS NULL LIMIT 1 FOR UPDATE');
    $orderStmt->execute([':id' => $orderId]);
    $order = $orderStmt->fetch();
    if (!$order) return;

    $items = $order['items'] ? json_decode($order['items'], true) : [];
    if (!is_array($items)) return;
    $itemIndex = null;
    foreach ($items as $index => $item) {
        if (($item['uid'] ?? '') === $itemUid) { $itemIndex = $index; break; }
    }
    if ($itemIndex === null) return;

    $sum = db()->prepare('SELECT COALESCE(SUM(quantity), 0) FROM manager_production_logs
        WHERE order_id = :orderId AND order_item_uid = :itemUid AND deleted_at IS NULL');
    $sum->execute([':orderId' => $orderId, ':itemUid' => $itemUid]);
    $produced = (float) $sum->fetchColumn();
    $item = $items[$itemIndex];
    $ordered = (float) ($item['quantity'] ?? 0);
    if ($produced + 0.00001 >= $ordered) return;

    $history = is_array($item['stateHistory'] ?? null) ? $item['stateHistory'] : [];
    $hasCompletion = !empty($item['productionStopped']) || ($item['state'] ?? '') === 'PRODUCTION_COMPLETE';
    $hasCompletion = $hasCompletion || array_reduce($history, static function ($found, $entry) {
        return $found || (($entry['state'] ?? '') === 'PRODUCTION_COMPLETE');
    }, false);
    if (!$hasCompletion) return;

    $previousState = null;
    if (($item['state'] ?? '') === 'PRODUCTION_COMPLETE') {
        for ($index = count($history) - 1; $index >= 0; $index--) {
            $state = $history[$index]['state'] ?? '';
            if ($state !== '' && $state !== 'PRODUCTION_COMPLETE') { $previousState = $state; break; }
        }
    }
    $item['stateHistory'] = array_values(array_filter($history, static function ($entry) {
        return ($entry['state'] ?? '') !== 'PRODUCTION_COMPLETE';
    }));
    if ($previousState !== null) $item['state'] = $previousState;
    elseif (($item['state'] ?? '') === 'PRODUCTION_COMPLETE') $item['state'] = 'REGISTERED';
    $item['productionStopped'] = production_state_is_after_completion($item['state'] ?? '');
    $items[$itemIndex] = $item;

    $encoded = json_encode($items, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($encoded === false) throw new RuntimeException('Could not encode corrected order state');
    $updateOrder = db()->prepare('UPDATE orders SET items = :items, updated_at = :updated, updated_by = :updatedBy WHERE id = :id');
    $updateOrder->execute([':items' => $encoded, ':updated' => now_utc(), ':updatedBy' => $updatedBy, ':id' => $orderId]);
}

function production_statistics_month_params()
{
    $rawYear = production_normalize_digits($_GET['year'] ?? '');
    $rawMonth = production_normalize_digits($_GET['month'] ?? '');
    if (!preg_match('/^\d{4}$/', $rawYear) || !preg_match('/^\d{1,2}$/', $rawMonth)) json_error('Invalid production statistics month', 422);
    $year = (int) $rawYear;
    $month = (int) $rawMonth;
    if ($year < 1405 || $year > 1499 || $month < 1 || $month > 12) {
        json_error('Invalid production statistics month', 422);
    }
    return [$year, $month, sprintf('%04d%02d', $year, $month)];
}

function production_management_statistics_employee_filter()
{
    $raw = $_GET['employeeUserId'] ?? '';
    if ($raw === '') return null;
    if (!ctype_digit((string) $raw) || (int) $raw <= 0) json_error('Invalid employee', 422);
    $id = (int) $raw;
    $stmt = db()->prepare("SELECT id FROM users WHERE id = :id AND role = 'employee' LIMIT 1");
    $stmt->execute([':id' => $id]);
    if (!$stmt->fetch()) json_error('Employee not found', 404);
    return $id;
}

function production_management_employee_totals($start, $end, $employeeUserId = null)
{
    $filter = $employeeUserId === null ? '' : ' AND (l.employee_user_id = :employeeUser OR l.employee_person_id = (SELECT person_id FROM employee_accounts WHERE user_id = :employeeAccount))';
    $stmt = db()->prepare("SELECT COALESCE(l.employee_person_id, ea.person_id) AS employee_person_id, l.employee_user_id,
        COALESCE(NULLIF(TRIM(CONCAT(p.first_name, ' ', p.last_name)), ''), u.display_name, u.username, '—') AS employee_name,
        SUM(l.quantity) AS total_quantity, SUM(CASE WHEN l.quantity <= 0 THEN 1 ELSE 0 END) AS pending_count
        FROM manager_production_logs l JOIN orders o ON o.id = l.order_id AND o.deleted_at IS NULL
        LEFT JOIN users u ON u.id = l.employee_user_id
        LEFT JOIN employee_accounts ea ON ea.user_id = u.id
        LEFT JOIN people p ON p.id = COALESCE(l.employee_person_id, ea.person_id)
        WHERE l.deleted_at IS NULL AND l.production_date >= :startDate AND l.production_date <= :endDate" . $filter . "
        GROUP BY COALESCE(l.employee_person_id, ea.person_id), l.employee_user_id, employee_name
        ORDER BY total_quantity DESC, employee_name ASC");
    $bind = [':startDate' => $start, ':endDate' => $end];
    if ($employeeUserId !== null) {
        $bind[':employeeUser'] = $employeeUserId;
        $bind[':employeeAccount'] = $employeeUserId;
    }
    $stmt->execute($bind);
    return array_map(fn ($row) => [
        'employeePersonId' => $row['employee_person_id'],
        'employeeUserId' => $row['employee_user_id'] === null ? null : (int) $row['employee_user_id'],
        'employeeName' => $row['employee_name'] ?: '—',
        'quantity' => (float) $row['total_quantity'],
        'pendingCount' => (int) $row['pending_count'],
    ], $stmt->fetchAll());
}

function production_management_month_statistics($params, $body, $user)
{
    require_admin($user);
    [$year, $month, $prefix] = production_statistics_month_params();
    $employeeId = production_management_statistics_employee_filter();
    $filter = $employeeId === null ? '' : ' AND l.employee_user_id = :employee';

    $dailyBind = [':startDate' => $prefix . '01', ':endDate' => $prefix . '31'];
    if ($employeeId !== null) $dailyBind[':employee'] = $employeeId;
    $dailyStmt = db()->prepare('SELECT l.production_date, SUM(l.quantity) AS total_quantity,
        SUM(CASE WHEN l.quantity <= 0 THEN 1 ELSE 0 END) AS pending_count
        FROM manager_production_logs l JOIN orders o ON o.id = l.order_id AND o.deleted_at IS NULL
        WHERE l.deleted_at IS NULL AND l.production_date >= :startDate AND l.production_date <= :endDate' . $filter . '
        GROUP BY l.production_date ORDER BY l.production_date ASC');
    $dailyStmt->execute($dailyBind);
    $daily = array_map(fn ($row) => [
        'date' => $row['production_date'], 'quantity' => (float) $row['total_quantity'], 'pendingCount' => (int) $row['pending_count'],
    ], $dailyStmt->fetchAll());

    $yearStart = sprintf('%04d0101', $year);
    $yearEnd = sprintf('%04d1231', $year);
    $monthlyBind = [':startDate' => $yearStart, ':endDate' => $yearEnd];
    if ($employeeId !== null) $monthlyBind[':employee'] = $employeeId;
    $monthlyStmt = db()->prepare('SELECT SUBSTRING(l.production_date, 5, 2) AS month_number, SUM(l.quantity) AS total_quantity
        FROM manager_production_logs l JOIN orders o ON o.id = l.order_id AND o.deleted_at IS NULL
        WHERE l.deleted_at IS NULL AND l.production_date >= :startDate AND l.production_date <= :endDate' . $filter . '
        GROUP BY SUBSTRING(l.production_date, 5, 2) ORDER BY month_number ASC');
    $monthlyStmt->execute($monthlyBind);
    $monthly = array_map(fn ($row) => ['month' => (int) $row['month_number'], 'quantity' => (float) $row['total_quantity']], $monthlyStmt->fetchAll());

    $yearChartBind = [':startDate' => '14050101', ':endDate' => '14251231'];
    if ($employeeId !== null) $yearChartBind[':employee'] = $employeeId;
    $yearlyStmt = db()->prepare('SELECT SUBSTRING(l.production_date, 1, 4) AS year_number, SUM(l.quantity) AS total_quantity
        FROM manager_production_logs l JOIN orders o ON o.id = l.order_id AND o.deleted_at IS NULL
        WHERE l.deleted_at IS NULL AND l.production_date >= :startDate AND l.production_date <= :endDate' . $filter . '
        GROUP BY SUBSTRING(l.production_date, 1, 4) ORDER BY year_number ASC');
    $yearlyStmt->execute($yearChartBind);
    $yearly = array_map(fn ($row) => ['year' => (int) $row['year_number'], 'quantity' => (float) $row['total_quantity']], $yearlyStmt->fetchAll());

    $byEmployee = production_management_employee_totals($prefix . '01', $prefix . '31', $employeeId);
    $yearByEmployee = production_management_employee_totals($yearStart, $yearEnd, $employeeId);
    $recordsBind = [':startDate' => $prefix . '01', ':endDate' => $prefix . '31'];
    $recordsFilter = '';
    if ($employeeId !== null) { $recordsBind[':employee'] = $employeeId; $recordsFilter = ' AND l.employee_user_id = :employee'; }
    $recordsStmt = db()->prepare("SELECT l.*, COALESCE(l.employee_person_id, ea.person_id) AS employee_person_id,
        o.order_number, o.customer_name, o.items,
        COALESCE(NULLIF(TRIM(CONCAT(p.first_name, ' ', p.last_name)), ''), u.display_name, u.username, '—') AS employee_name
        FROM manager_production_logs l JOIN orders o ON o.id = l.order_id
        LEFT JOIN users u ON u.id = l.employee_user_id
        LEFT JOIN employee_accounts ea ON ea.user_id = u.id
        LEFT JOIN people p ON p.id = COALESCE(l.employee_person_id, ea.person_id)
        WHERE o.deleted_at IS NULL AND l.deleted_at IS NULL AND l.production_date >= :startDate AND l.production_date <= :endDate" . $recordsFilter . "
        ORDER BY l.production_date ASC, l.created_at ASC, l.id ASC");
    $recordsStmt->execute($recordsBind);
    $records = [];
    foreach ($recordsStmt->fetchAll() as $row) {
        $item = null;
        foreach (($row['items'] ? json_decode($row['items'], true) : []) as $candidate) {
            if (($candidate['uid'] ?? '') === $row['order_item_uid']) { $item = $candidate; break; }
        }
        $itemState = $item['state'] ?? '';
        $records[] = [
            'id' => 'manager-' . (int) $row['id'], 'isManagerEntry' => true,
            'employeeUserId' => $row['employee_user_id'] === null ? null : (int) $row['employee_user_id'],
            'employeePersonId' => $row['employee_person_id'], 'employeeName' => $row['employee_name'],
            'orderId' => (int) $row['order_id'], 'orderItemUid' => $row['order_item_uid'],
            'orderNumber' => $row['order_number'],
            'productionComplete' => !empty($item['productionStopped']) || $itemState === 'PRODUCTION_COMPLETE' || production_state_is_after_completion($itemState),
            'customerName' => $row['customer_name'], 'productName' => $item['productName'] ?? '—',
            'quantity' => (float) $row['quantity'],
            'quantityPending' => (float) $row['quantity'] <= 0 && (float) ($item['weightOf10'] ?? 0) <= 0,
            'totalWeightGrams' => (float) $row['total_weight_grams'], 'productionDate' => $row['production_date'],
            'createdAt' => to_iso($row['created_at']),
            'material' => $item['material'] ?? '', 'thickness' => $item['thickness'] ?? null,
            'diameter' => $item['diameter'] ?? null, 'platingColor' => $item['platingColor'] ?? 'NONE',
        ];
    }
    json_response([
        'year' => $year, 'month' => $month, 'employeeUserId' => $employeeId,
        'total' => array_sum(array_column($daily, 'quantity')),
        'daily' => $daily, 'monthly' => $monthly, 'yearly' => $yearly,
        'byEmployee' => $byEmployee, 'yearByEmployee' => $yearByEmployee, 'records' => $records,
    ]);
}

function production_management_day_statistics($params, $body, $user)
{
    require_admin($user);
    $date = production_normalize_digits($_GET['date'] ?? '');
    if (!production_valid_date($date) || (int) substr($date, 0, 4) < 1405 || (int) substr($date, 0, 4) > 1499) {
        json_error('Invalid production statistics date', 422);
    }
    $employeeId = production_management_statistics_employee_filter();
    $filter = $employeeId === null ? '' : ' AND l.employee_user_id = :employee';
    $bind = [':productionDate' => $date];
    if ($employeeId !== null) $bind[':employee'] = $employeeId;
    $stmt = db()->prepare("SELECT l.*, COALESCE(l.employee_person_id, ea.person_id) AS employee_person_id,
        o.order_number, o.customer_name, o.items,
        COALESCE(NULLIF(TRIM(CONCAT(p.first_name, ' ', p.last_name)), ''), u.display_name, u.username, '—') AS employee_name
        FROM manager_production_logs l JOIN orders o ON o.id = l.order_id
        LEFT JOIN users u ON u.id = l.employee_user_id
        LEFT JOIN employee_accounts ea ON ea.user_id = u.id
        LEFT JOIN people p ON p.id = COALESCE(l.employee_person_id, ea.person_id)
        WHERE o.deleted_at IS NULL AND l.deleted_at IS NULL AND l.production_date = :productionDate" . $filter . "
        ORDER BY l.created_at ASC, l.id ASC");
    $stmt->execute($bind);
    $records = [];
    foreach ($stmt->fetchAll() as $row) {
        $item = null;
        foreach (($row['items'] ? json_decode($row['items'], true) : []) as $candidate) {
            if (($candidate['uid'] ?? '') === $row['order_item_uid']) { $item = $candidate; break; }
        }
        $itemState = $item['state'] ?? '';
        $records[] = [
            'id' => 'manager-' . (int) $row['id'], 'isManagerEntry' => true,
            'employeeUserId' => $row['employee_user_id'] === null ? null : (int) $row['employee_user_id'],
            'employeePersonId' => $row['employee_person_id'], 'employeeName' => $row['employee_name'],
            'orderId' => (int) $row['order_id'], 'orderItemUid' => $row['order_item_uid'],
            'orderNumber' => $row['order_number'],
            'productionComplete' => !empty($item['productionStopped']) || $itemState === 'PRODUCTION_COMPLETE' || production_state_is_after_completion($itemState),
            'customerName' => $row['customer_name'], 'productName' => $item['productName'] ?? '—',
            'quantity' => (float) $row['quantity'],
            'quantityPending' => (float) $row['quantity'] <= 0 && (float) ($item['weightOf10'] ?? 0) <= 0,
            'totalWeightGrams' => (float) $row['total_weight_grams'], 'productionDate' => $row['production_date'],
            'createdAt' => to_iso($row['created_at']),
            'material' => $item['material'] ?? '', 'thickness' => $item['thickness'] ?? null,
            'diameter' => $item['diameter'] ?? null, 'platingColor' => $item['platingColor'] ?? 'NONE',
        ];
    }
    json_response(['date' => $date, 'employeeUserId' => $employeeId,
        'total' => array_sum(array_column($records, 'quantity')), 'records' => $records]);
}

function production_item_summary($params, $body, $user)
{
    require_management($user);
    $orderId = (int) $params['orderId'];
    $uid = (string) $params['itemUid'];
    $orderStmt = db()->prepare('SELECT items FROM orders WHERE id = :id AND deleted_at IS NULL LIMIT 1');
    $orderStmt->execute([':id' => $orderId]);
    $order = $orderStmt->fetch();
    if (!$order) json_error('Order not found', 404);
    $orderItem = null;
    foreach (($order['items'] ? json_decode($order['items'], true) : []) as $candidate) {
        if (($candidate['uid'] ?? '') === $uid) { $orderItem = $candidate; break; }
    }
    if (!$orderItem) json_error('Order item not found', 404);

    $logs = db()->prepare("SELECT ml.id, ml.employee_user_id, ml.employee_person_id, ml.order_id, ml.order_item_uid,
        ml.quantity, ml.total_weight_grams, ml.production_date, ml.created_at, ml.updated_at, ml.deleted_at,
        COALESCE(NULLIF(TRIM(CONCAT(mp.first_name, ' ', mp.last_name)), ''), mu.display_name, mu.username, '—') AS employee_name
        FROM manager_production_logs ml LEFT JOIN users mu ON mu.id = ml.employee_user_id
        LEFT JOIN employee_accounts mea ON mea.user_id = mu.id
        LEFT JOIN people mp ON mp.id = COALESCE(ml.employee_person_id, mea.person_id)
        WHERE ml.order_id = :orderId AND ml.order_item_uid = :itemUid AND ml.deleted_at IS NULL
        ORDER BY ml.created_at DESC, ml.id DESC");
    $logs->execute([':orderId' => $orderId, ':itemUid' => $uid]);
    $logRows = $logs->fetchAll();
    $byEmployee = [];
    foreach ($logRows as $log) {
        $personId = $log['employee_person_id'] ?? null;
        $userId = $log['employee_user_id'] === null ? null : (int) $log['employee_user_id'];
        $key = $personId !== null ? 'person:' . $personId : 'user:' . ($userId ?? 'unknown');
        if (!isset($byEmployee[$key])) $byEmployee[$key] = [
            'employeePersonId' => $personId, 'employeeUserId' => $userId,
            'employeeName' => $log['employee_name'], 'quantity' => 0,
        ];
        $byEmployee[$key]['quantity'] += (float) $log['quantity'];
    }
    json_response([
        'totalProduced' => array_sum(array_column($logRows, 'quantity')),
        'byEmployee' => array_values($byEmployee), 'logs' => array_map('manager_production_log_to_wire', $logRows),
        'orderItem' => $orderItem,
    ]);
}
