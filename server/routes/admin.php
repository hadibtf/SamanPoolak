<?php
// Admin-only database backup & restore.
// Backup returns the raw rows of all shared data. Restore fully replaces the
// business tables (people/orders/markings); users are UPSERTED (never deleted)
// so the current admin and active sessions survive a restore.

function admin_backup($params, $body, $user)
{
    require_admin($user);
    $out = ['version' => 1, 'exportedAt' => to_iso(now_utc())];
    foreach (['people', 'orders', 'markings', 'expenses', 'inquiries', 'job_applications', 'app_settings', 'users'] as $t) {
        $out[$t] = db()->query("SELECT * FROM $t")->fetchAll();
    }
    json_response($out);
}

// Re-insert raw rows verbatim (preserving ids) into a freshly-cleared table.
function restore_insert_rows($table, $rows)
{
    if (!is_array($rows)) {
        return;
    }
    foreach ($rows as $row) {
        if (!is_array($row) || !$row) {
            continue;
        }
        $cols = array_keys($row);
        $place = array_map(fn ($c) => ':' . $c, $cols);
        $sql = "INSERT INTO $table (" . implode(',', $cols) . ') VALUES (' . implode(',', $place) . ')';
        $stmt = db()->prepare($sql);
        foreach ($row as $k => $v) {
            $stmt->bindValue(':' . $k, $v);
        }
        $stmt->execute();
    }
}

// Add/update users without deleting any (keeps current admin + sessions alive).
function restore_upsert_users($rows)
{
    if (!is_array($rows)) {
        return;
    }
    foreach ($rows as $row) {
        if (empty($row['username'])) {
            continue;
        }
        $cols = array_keys($row);
        $place = array_map(fn ($c) => ':' . $c, $cols);
        $updates = implode(', ', array_map(
            fn ($c) => "$c = VALUES($c)",
            array_filter($cols, fn ($c) => $c !== 'id')
        ));
        $sql = 'INSERT INTO users (' . implode(',', $cols) . ') VALUES (' . implode(',', $place) . ')'
            . ($updates ? " ON DUPLICATE KEY UPDATE $updates" : '');
        $stmt = db()->prepare($sql);
        foreach ($row as $k => $v) {
            $stmt->bindValue(':' . $k, $v);
        }
        $stmt->execute();
    }
}

function admin_restore($params, $body, $user)
{
    require_admin($user);
    $people = $body['people'] ?? null;
    $orders = $body['orders'] ?? null;
    $markings = $body['markings'] ?? null;
    $expenses = $body['expenses'] ?? null;
    $users = $body['users'] ?? null;
    $inquiries = $body['inquiries'] ?? null;
    $jobApplications = $body['job_applications'] ?? null;
    $appSettings = $body['app_settings'] ?? null;

    if (!is_array($people) && !is_array($orders) && !is_array($markings) && !is_array($expenses) && !is_array($inquiries) && !is_array($jobApplications) && !is_array($appSettings)) {
        json_error('فایل پشتیبان نامعتبر است', 422);
    }

    db()->beginTransaction();
    try {
        // DELETE (not TRUNCATE — TRUNCATE auto-commits and would break the txn).
        if (is_array($orders))   { db()->exec('DELETE FROM orders');   restore_insert_rows('orders', $orders); }
        if (is_array($markings)) { db()->exec('DELETE FROM markings'); restore_insert_rows('markings', $markings); }
        if (is_array($expenses)) { db()->exec('DELETE FROM expenses'); restore_insert_rows('expenses', $expenses); }
        if (is_array($inquiries)) { db()->exec('DELETE FROM inquiries'); restore_insert_rows('inquiries', $inquiries); }
        if (is_array($jobApplications)) { db()->exec('DELETE FROM job_applications'); restore_insert_rows('job_applications', $jobApplications); }
        if (is_array($appSettings)) { db()->exec('DELETE FROM app_settings'); restore_insert_rows('app_settings', $appSettings); }
        if (is_array($people))   { db()->exec('DELETE FROM people');   restore_insert_rows('people', $people); }
        restore_upsert_users($users);
        db()->commit();
    } catch (Throwable $e) {
        db()->rollBack();
        json_error('بازگردانی ناموفق بود', 500, $e->getMessage());
    }

    json_response(['ok' => true]);
}
