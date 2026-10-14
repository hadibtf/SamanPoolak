<?php
// User management routes (admin-only). The admin seeds the team's logins.

// GET /users
function users_list($params, $body, $user)
{
    require_admin($user);
    $stmt = db()->query('SELECT * FROM users ORDER BY id ASC');
    json_response(['users' => array_map('public_user', $stmt->fetchAll())]);
}

// POST /users  { username, password, displayName?, role? }
function users_create($params, $body, $user)
{
    require_admin($user);
    require_fields($body, ['username', 'password']);
    $username = trim((string) $body['username']);

    $exists = db()->prepare('SELECT id FROM users WHERE username = :u LIMIT 1');
    $exists->execute([':u' => $username]);
    if ($exists->fetch()) {
        json_error('یک کاربر با این شناسه وجود دارد', 409);
    }

    $role = (($body['role'] ?? 'user') === 'admin') ? 'admin' : 'user';
    $ins = db()->prepare(
        'INSERT INTO users (username, password_hash, display_name, role, created_at)
         VALUES (:u, :p, :d, :r, :c)'
    );
    $ins->execute([
        ':u' => $username,
        ':p' => password_hash($body['password'], PASSWORD_DEFAULT),
        ':d' => trim((string) ($body['displayName'] ?? $username)),
        ':r' => $role,
        ':c' => now_utc(),
    ]);
    $id = (int) db()->lastInsertId();

    $stmt = db()->prepare('SELECT * FROM users WHERE id = :id');
    $stmt->execute([':id' => $id]);
    json_response(['user' => public_user($stmt->fetch())], 201);
}

// PUT /users/{id}  { password }
// Passwords are write-only; only a new password can be set, never retrieved.
function users_update($params, $body, $user)
{
    require_admin($user);
    require_fields($body, ['password']);

    $id = (int) $params['id'];
    if ($id <= 0 || $id === (int) $user['id']) {
        json_error('تنظیم رمز فقط برای حساب کاربر دیگری مجاز است', 422);
    }
    $password = (string) $body['password'];
    if ($password === '') {
        json_error('رمز جدید را وارد کنید', 422);
    }

    $exists = db()->prepare('SELECT id FROM users WHERE id = :id LIMIT 1');
    $exists->execute([':id' => $id]);
    if (!$exists->fetch()) {
        json_error('کاربر یافت نشد', 404);
    }

    $pdo = db();
    $pdo->beginTransaction();
    try {
        $update = $pdo->prepare('UPDATE users SET password_hash = :passwordHash WHERE id = :id');
        $update->execute([':passwordHash' => password_hash($password, PASSWORD_DEFAULT), ':id' => $id]);
        $sessions = $pdo->prepare('DELETE FROM sessions WHERE user_id = :id');
        $sessions->execute([':id' => $id]);
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }

    json_response(['ok' => true, 'id' => $id]);
}

// DELETE /users/{id}
function users_delete($params, $body, $user)
{
    require_admin($user);
    $id = (int) $params['id'];
    if ($id === (int) $user['id']) {
        json_error('حذف حساب خودتان ممکن نیست', 422);
    }
    $del = db()->prepare('DELETE FROM users WHERE id = :id');
    $del->execute([':id' => $id]);
    if ($del->rowCount() === 0) {
        json_error('کاربر یافت نشد', 404);
    }
    json_response(['ok' => true, 'id' => $id]);
}
