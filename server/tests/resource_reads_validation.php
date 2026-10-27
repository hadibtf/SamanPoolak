<?php
// Route-level validation with a recording database double; no live DB writes.
require_once __DIR__ . '/../routes/attendance.php';
require_once __DIR__ . '/../routes/markings.php';

class ReadResponse extends RuntimeException {
    public $payload;
    public function __construct($payload) { $this->payload = $payload; }
}
class ReadStatement {
    public $sql;
    public $values;
    public function __construct($sql) { $this->sql = $sql; }
    public function execute($values) { $this->values = $values; }
    public function fetchAll() { return []; }
    public function fetchColumn() { return 27; }
}
class ReadDatabase {
    public $last;
    public function prepare($sql) { return $this->last = new ReadStatement($sql); }
}
$database = new ReadDatabase();
function db() { global $database; return $database; }
function require_management($user) { if (($user['role'] ?? '') !== 'admin') throw new RuntimeException('Forbidden', 403); }
function json_response($payload) { throw new ReadResponse($payload); }
function json_error($message, $status) { throw new RuntimeException($message, $status); }
function from_iso($value) { return $value === '2026-10-01T00:00:00Z' ? '2026-10-01 00:00:00' : null; }
function check_read($condition, $message) { if (!$condition) throw new RuntimeException($message); }
function call_read($handler, $query, $role = 'admin') {
    $_GET = $query;
    try { $handler([], null, ['role' => $role]); }
    catch (ReadResponse $response) { return $response->payload; }
    throw new RuntimeException('No response');
}

$rows = call_read('attendance_list', ['cardNo' => "42' OR 1=1", 'from' => '14050101', 'to' => '14050131']);
check_read($rows === ['attendance' => []], 'Unexpected attendance shape');
check_read(strpos($database->last->sql, 'a.deleted_at IS NULL') !== false, 'Deleted attendance leaked');
check_read(strpos($database->last->sql, 'a.card_no = :card') !== false, 'Missing card filter');
check_read(strpos($database->last->sql, "42'") === false, 'Card filter interpolated into SQL');
check_read($database->last->values === [':card' => "42' OR 1=1", ':from' => '14050101', ':to' => '14050131'], 'Incorrect bound filters');
check_read(call_read('attendance_list', ['countOnly' => '1']) === ['count' => 27], 'Count shape changed');
check_read(strpos($database->last->sql, 'COUNT(*)') !== false, 'Count downloaded records');

call_read('markings_list', ['customerId' => '1-42']);
check_read(strpos($database->last->sql, 'customer_id = :customer') !== false, 'Missing marking customer scope');
check_read($database->last->values === [':customer' => '1-42'], 'Incorrect customer binding');
foreach (['attendance_list', 'markings_list'] as $handler) {
    call_read($handler, ['updatedAfter' => '2026-10-01T00:00:00Z']);
    check_read(strpos($database->last->sql, 'updated_at > :ts') !== false, 'Delta compatibility lost');
    check_read(strpos($database->last->sql, 'deleted_at IS NULL') === false, 'Delta lost tombstones');
    try { call_read($handler, [], 'employee'); throw new RuntimeException('Employee allowed'); }
    catch (RuntimeException $error) { check_read($error->getCode() === 403, 'Wrong authorization error'); }
}
try { call_read('attendance_list', ['from' => '1405junk']); throw new RuntimeException('Bad date allowed'); }
catch (RuntimeException $error) { check_read($error->getCode() === 422, 'Wrong date error'); }
echo "Resource read validation passed\n";
