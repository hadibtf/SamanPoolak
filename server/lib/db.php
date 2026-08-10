<?php
// PDO connection (single shared instance).

function db()
{
    static $pdo = null;
    if ($pdo === null) {
        $c = config('db');
        $dsn = "mysql:host={$c['host']};dbname={$c['name']};charset={$c['charset']}";
        try {
            $pdo = new PDO($dsn, $c['user'], $c['pass'], [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
            ]);
        } catch (PDOException $e) {
            json_error('Database connection failed', 500, $e->getMessage());
        }
    }
    return $pdo;
}

// UTC timestamp string used for all created_at/updated_at/deleted_at writes.
function now_utc()
{
    return gmdate('Y-m-d H:i:s');
}

// Atomically increment a named counter and return the new value.
function next_counter($name)
{
    $stmt = db()->prepare(
        'INSERT INTO counters (name, value) VALUES (:name, LAST_INSERT_ID(1))
         ON DUPLICATE KEY UPDATE value = LAST_INSERT_ID(value + 1)'
    );
    $stmt->execute([':name' => $name]);
    return (int) db()->lastInsertId();
}
