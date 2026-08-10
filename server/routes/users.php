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
        'INSERT INTO users (username, password_hash, display_name, role, disabled, created_at)
         VALUES (:u, :p, :d, :r, 0, :c)'
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
