<?php
// Production task assignment. Logging is intentionally implemented in TODO 3.

function require_employee($user)
{
    if (($user['role'] ?? '') !== 'employee') {
        json_error('Employee access required', 403);
    }
    return $user;
}

function production_task_to_wire($row)
{
    return [
        'id' => (int) $row['id'], 'orderId' => (int) $row['order_id'],
        'orderItemUid' => $row['order_item_uid'], 'employeeUserId' => (int) $row['employee_user_id'],
        'employeeName' => $row['employee_name'] ?? '', 'requiredQuantity' => (float) $row['required_quantity'],
        'assignedDate' => $row['assigned_date'], 'assignedBy' => (int) $row['assigned_by'],
        'status' => $row['status'], 'createdAt' => to_iso($row['created_at']),
        'updatedAt' => to_iso($row['updated_at']), 'completedAt' => to_iso($row['completed_at']),
        'deletedAt' => to_iso($row['deleted_at']),
    ];
}

function production_task_projection($task)
{
    $stmt = db()->prepare('SELECT order_number, items FROM orders WHERE id = :id AND deleted_at IS NULL LIMIT 1');
    $stmt->execute([':id' => $task['orderId']]);
    $order = $stmt->fetch();
    if (!$order) return null;
    $items = $order['items'] ? json_decode($order['items'], true) : [];
    $item = null;
    foreach ($items as $candidate) {
        if (($candidate['uid'] ?? '') === $task['orderItemUid']) { $item = $candidate; break; }
    }
    if (!$item) return null;
    $marking = null;
    if (!empty($item['markingId'])) {
        $m = db()->prepare('SELECT name, src FROM markings WHERE id = :id AND deleted_at IS NULL LIMIT 1');
        $m->execute([':id' => $item['markingId']]);
        $marking = $m->fetch();
    }
    return [
        ...$task,
        'orderNumber' => $order['order_number'],
        'productName' => $item['productName'] ?? '', 'requiredQuantity' => $task['requiredQuantity'],
        'material' => $item['material'] ?? '', 'thickness' => $item['thickness'] ?? null,
        'diameter' => $item['diameter'] ?? null, 'isHardened' => !empty($item['isHardened']),
        'hardeningIntensity' => $item['hardeningIntensity'] ?? '', 'description' => $item['description'] ?? '',
        'weightOf10' => $item['weightOf10'] ?? null,
        'markingName' => $marking['name'] ?? ($item['markingName'] ?? ''),
        'markingSrc' => $marking['src'] ?? null,
    ];
}

function production_employees($params, $body, $user)
{
    require_admin($user);
    $stmt = db()->query("SELECT ea.user_id, p.id AS person_id, p.first_name, p.last_name, u.username
        FROM employee_accounts ea JOIN users u ON u.id = ea.user_id
        JOIN people p ON p.id = ea.person_id
        WHERE p.deleted_at IS NULL AND u.disabled = 0 AND u.role = 'employee'
        ORDER BY p.first_name, p.last_name, u.id");
    $employees = array_map(fn ($r) => [
        'userId' => (int) $r['user_id'], 'personId' => $r['person_id'],
        'name' => trim($r['first_name'] . ' ' . $r['last_name']) ?: $r['username'], 'username' => $r['username'],
    ], $stmt->fetchAll());
    json_response(['employees' => $employees]);
}

function production_tasks_list($params, $body, $user)
{
    $after = $_GET['updatedAfter'] ?? null;
    $where = []; $bind = [];
    if (($user['role'] ?? '') === 'admin') {
        // management can inspect all assignments
    } elseif (($user['role'] ?? '') === 'employee') {
        $where[] = 't.employee_user_id = :employee'; $bind[':employee'] = $user['id'];
    } else {
        json_error('Production access required', 403);
    }
    if ($after) {
        $ts = from_iso($after);
        if ($ts === null) json_error('Invalid updatedAfter timestamp', 422);
        $where[] = 't.updated_at > :updated'; $bind[':updated'] = $ts;
    } else {
        $where[] = 't.deleted_at IS NULL';
    }
    $sql = "SELECT t.*, COALESCE(CONCAT(p.first_name, ' ', p.last_name), u.display_name, u.username) AS employee_name
        FROM production_tasks t JOIN users u ON u.id = t.employee_user_id
        LEFT JOIN employee_accounts ea ON ea.user_id = u.id LEFT JOIN people p ON p.id = ea.person_id
        WHERE " . implode(' AND ', $where) . ' ORDER BY t.updated_at ASC';
    $stmt = db()->prepare($sql); $stmt->execute($bind);
    $tasks = array_map('production_task_to_wire', $stmt->fetchAll());
    if (($user['role'] ?? '') === 'employee') {
        $tasks = array_values(array_filter(array_map('production_task_projection', $tasks)));
    }
    json_response(['productionTasks' => $tasks]);
}

function production_tasks_create($params, $body, $user)
{
    require_admin($user);
    require_fields($body, ['orderId', 'orderItemUid', 'employeeUserId', 'requiredQuantity', 'assignedDate']);
    $orderId = (int) $body['orderId']; $itemUid = trim((string) $body['orderItemUid']);
    $employeeId = (int) $body['employeeUserId']; $quantity = (float) $body['requiredQuantity'];
    $assignedDate = (string) $body['assignedDate'];
    if ($orderId <= 0 || $itemUid === '' || !is_finite($quantity) || $quantity <= 0 || !preg_match('/^\d{8}$/', $assignedDate)) {
        json_error('Invalid production task', 422);
    }
    db()->beginTransaction();
    try {
        $employee = db()->prepare("SELECT ea.user_id FROM employee_accounts ea JOIN users u ON u.id = ea.user_id
            WHERE ea.user_id = :id AND u.role = 'employee' AND u.disabled = 0 LIMIT 1");
        $employee->execute([':id' => $employeeId]);
        if (!$employee->fetch()) json_error('Employee not found or disabled', 422);
        $orderStmt = db()->prepare('SELECT items FROM orders WHERE id = :id AND deleted_at IS NULL LIMIT 1');
        $orderStmt->execute([':id' => $orderId]); $order = $orderStmt->fetch();
        if (!$order) json_error('Order not found', 404);
        $item = null;
        foreach (($order['items'] ? json_decode($order['items'], true) : []) as $candidate) {
            if (($candidate['uid'] ?? '') === $itemUid) { $item = $candidate; break; }
        }
        $orderQuantity = (float) ($item['quantity'] ?? 0);
        if (!$item || $orderQuantity <= 0) json_error('Order item not found or has no quantity', 422);
        $usedStmt = db()->prepare('SELECT COALESCE(SUM(required_quantity), 0) FROM production_tasks
            WHERE order_id = :orderId AND order_item_uid = :itemUid AND deleted_at IS NULL');
        $usedStmt->execute([':orderId' => $orderId, ':itemUid' => $itemUid]);
        if ((float) $usedStmt->fetchColumn() + $quantity > $orderQuantity + 0.00001) json_error('Assigned quantity exceeds the remaining order-item quantity', 422);
        $now = now_utc();
        $insert = db()->prepare('INSERT INTO production_tasks (order_id, order_item_uid, employee_user_id, required_quantity, assigned_date, assigned_by, status, created_at, updated_at)
            VALUES (:orderId, :itemUid, :employeeId, :quantity, :assignedDate, :assignedBy, :status, :createdAt, :updatedAt)');
        $insert->execute([':orderId' => $orderId, ':itemUid' => $itemUid, ':employeeId' => $employeeId, ':quantity' => $quantity,
            ':assignedDate' => $assignedDate, ':assignedBy' => $user['id'], ':status' => 'ASSIGNED', ':createdAt' => $now, ':updatedAt' => $now]);
        $id = (int) db()->lastInsertId(); db()->commit();
    } catch (Throwable $e) {
        if (db()->inTransaction()) db()->rollBack();
        json_error('Failed to assign production task', 500, $e->getMessage());
    }
    $stmt = db()->prepare("SELECT t.*, u.display_name AS employee_name FROM production_tasks t JOIN users u ON u.id = t.employee_user_id WHERE t.id = :id");
    $stmt->execute([':id' => $id]); json_response(['productionTask' => production_task_to_wire($stmt->fetch())], 201);
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
    return (int) $m[2] >= 1 && (int) $m[2] <= 12 && (int) $m[3] >= 1 && (int) $m[3] <= 31;
}

function production_task_for_employee($taskId, $user)
{
    $stmt = db()->prepare('SELECT * FROM production_tasks WHERE id = :id AND employee_user_id = :employee AND deleted_at IS NULL LIMIT 1');
    $stmt->execute([':id' => $taskId, ':employee' => $user['id']]);
    $task = $stmt->fetch();
    if (!$task) json_error('Production task not found', 404);
    return $task;
}

function production_logs_to_wire($row)
{
    return ['id' => (int) $row['id'], 'taskId' => (int) $row['task_id'], 'employeeUserId' => (int) $row['employee_user_id'],
        'employeeName' => $row['employee_name'] ?? '', 'orderId' => (int) $row['order_id'], 'orderItemUid' => $row['order_item_uid'],
        'quantity' => (float) $row['quantity'], 'productionDate' => $row['production_date'], 'createdAt' => to_iso($row['created_at'])];
}

function production_task_logs_list($params, $body, $user)
{
    require_employee($user); $task = production_task_for_employee((int) $params['id'], $user);
    $stmt = db()->prepare('SELECT l.*, u.display_name AS employee_name FROM production_logs l JOIN users u ON u.id = l.employee_user_id WHERE l.task_id = :taskId ORDER BY l.created_at DESC');
    $stmt->execute([':taskId' => $task['id']]); json_response(['productionLogs' => array_map('production_logs_to_wire', $stmt->fetchAll())]);
}

function production_task_log_create($params, $body, $user)
{
    require_employee($user); require_fields($body, ['quantity', 'productionDate', 'submissionKey']);
    $quantity = (float) $body['quantity'];
    // react-multi-date-picker can format a Jalali date with Persian digits.
    // Persist dates in the server's canonical ASCII YYYYMMDD format.
    $date = production_normalize_digits($body['productionDate']);
    $key = trim((string) $body['submissionKey']);
    if (!is_finite($quantity) || $quantity <= 0 || !production_valid_date($date) || !preg_match('/^[a-f0-9-]{16,36}$/i', $key)) json_error('Invalid production log', 422);
    db()->beginTransaction();
    try {
        $task = production_task_for_employee((int) $params['id'], $user);
        if ($task['status'] === 'COMPLETED') json_error('Production task is already completed', 422);
        $total = db()->prepare('SELECT COALESCE(SUM(quantity), 0) FROM production_logs WHERE task_id = :taskId');
        $total->execute([':taskId' => $task['id']]);
        if ((float) $total->fetchColumn() + $quantity > (float) $task['required_quantity'] + 0.00001) json_error('Produced quantity exceeds the task quantity', 422);
        $now = now_utc();
        $insert = db()->prepare('INSERT INTO production_logs (task_id, employee_user_id, order_id, order_item_uid, quantity, production_date, submission_key, created_at) VALUES (:taskId,:employeeId,:orderId,:itemUid,:quantity,:date,:key,:createdAt)');
        $insert->execute([':taskId' => $task['id'], ':employeeId' => $user['id'], ':orderId' => $task['order_id'], ':itemUid' => $task['order_item_uid'], ':quantity' => $quantity, ':date' => $date, ':key' => $key, ':createdAt' => $now]);
        // Capture the generated ID before later UPDATE statements, which do
        // not have an insert ID on MySQL.
        $id = (int) db()->lastInsertId();
        $sum = db()->prepare('SELECT COALESCE(SUM(quantity), 0) FROM production_logs WHERE task_id = :taskId'); $sum->execute([':taskId' => $task['id']]); $newTotal = (float) $sum->fetchColumn();
        $status = $newTotal + 0.00001 >= (float) $task['required_quantity'] ? 'COMPLETED' : 'IN_PROGRESS';
        $update = db()->prepare('UPDATE production_tasks SET status = :status, completed_at = :completedAt, updated_at = :updatedAt WHERE id = :id');
        $update->execute([':status' => $status, ':completedAt' => $status === 'COMPLETED' ? $now : null, ':updatedAt' => $now, ':id' => $task['id']]);
        db()->commit();
    } catch (PDOException $e) {
        if (db()->inTransaction()) db()->rollBack();
        if ((string) $e->getCode() === '23000') json_error('This production submission was already recorded', 409);
        json_error('Failed to save production log', 500, $e->getMessage());
    } catch (Throwable $e) {
        if (db()->inTransaction()) db()->rollBack(); json_error('Failed to save production log', 500, $e->getMessage());
    }
    $log = db()->prepare('SELECT l.*, u.display_name AS employee_name FROM production_logs l JOIN users u ON u.id = l.employee_user_id WHERE l.id = :id'); $log->execute([':id' => $id]);
    $taskRow = db()->prepare("SELECT t.*, u.display_name AS employee_name FROM production_tasks t JOIN users u ON u.id = t.employee_user_id WHERE t.id = :id"); $taskRow->execute([':id' => $task['id']]);
    json_response(['productionLog' => production_logs_to_wire($log->fetch()), 'productionTask' => production_task_to_wire($taskRow->fetch())], 201);
}

function production_item_summary($params, $body, $user)
{
    require_management($user); $orderId = (int) $params['orderId']; $uid = (string) $params['itemUid'];
    $tasks = db()->prepare("SELECT t.*, COALESCE(CONCAT(p.first_name, ' ', p.last_name), u.display_name, u.username) AS employee_name, COALESCE(SUM(l.quantity),0) AS produced_quantity
        FROM production_tasks t JOIN users u ON u.id=t.employee_user_id LEFT JOIN employee_accounts ea ON ea.user_id=u.id LEFT JOIN people p ON p.id=ea.person_id LEFT JOIN production_logs l ON l.task_id=t.id
        WHERE t.order_id=:orderId AND t.order_item_uid=:uid AND t.deleted_at IS NULL GROUP BY t.id ORDER BY t.created_at ASC");
    $tasks->execute([':orderId' => $orderId, ':uid' => $uid]); $taskRows = $tasks->fetchAll();
    $logs = db()->prepare("SELECT l.*, COALESCE(CONCAT(p.first_name, ' ', p.last_name), u.display_name, u.username) AS employee_name FROM production_logs l JOIN users u ON u.id=l.employee_user_id LEFT JOIN employee_accounts ea ON ea.user_id=u.id LEFT JOIN people p ON p.id=ea.person_id WHERE l.order_id=:orderId AND l.order_item_uid=:uid ORDER BY l.created_at DESC");
    $logs->execute([':orderId' => $orderId, ':uid' => $uid]); $logRows = $logs->fetchAll();
    $byEmployee = []; foreach ($logRows as $log) { $id = (int) $log['employee_user_id']; if (!isset($byEmployee[$id])) $byEmployee[$id] = ['employeeUserId'=>$id,'employeeName'=>$log['employee_name'],'quantity'=>0]; $byEmployee[$id]['quantity'] += (float) $log['quantity']; }
    json_response(['tasks' => array_map('production_task_to_wire', $taskRows), 'totalProduced' => array_sum(array_map(fn($l)=>(float)$l['quantity'],$logRows)), 'byEmployee' => array_values($byEmployee), 'logs' => array_map('production_logs_to_wire',$logRows)]);
}
