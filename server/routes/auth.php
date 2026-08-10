<?php
// Authentication routes.

// POST /auth/login  { username, password }  ->  { token, user }
function auth_login($params, $body, $user)
{
    require_fields($body, ['username', 'password']);

    $stmt = db()->prepare('SELECT * FROM users WHERE username = :u LIMIT 1');
    $stmt->execute([':u' => trim($body['username'])]);
    $row = $stmt->fetch();

    if (!$row || (int) $row['disabled'] === 1 || !password_verify($body['password'], $row['password_hash'])) {
        json_error('Invalid username or password', 401);
    }

    $token = generate_token();
    $ttlDays = (int) config('session_ttl_days', 30);
    $ins = db()->prepare(
        'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (:t, :uid, :c, :e)'
    );
    $ins->execute([
        ':t'   => $token,
        ':uid' => $row['id'],
        ':c'   => now_utc(),
        ':e'   => gmdate('Y-m-d H:i:s', time() + $ttlDays * 86400),
    ]);

    json_response(['token' => $token, 'user' => public_user($row)]);
}

// POST /auth/logout  -> { ok: true }
function auth_logout($params, $body, $user)
{
    $del = db()->prepare('DELETE FROM sessions WHERE token = :t');
    $del->execute([':t' => $user['active_token']]);
    json_response(['ok' => true]);
}

// GET /auth/me  -> { user }
function auth_me($params, $body, $user)
{
    json_response(['user' => public_user($user)]);
}

// POST /setup/seed-admin  { setupKey, username, password, displayName? }
// One-time bootstrap of the first user. Guarded by config('setup_key').
function seed_admin($params, $body, $user)
{
    $key = config('setup_key');
    if (!$key) {
        json_error('Setup is disabled', 403);
    }
    require_fields($body, ['setupKey', 'username', 'password']);
    if (!hash_equals((string) $key, (string) $body['setupKey'])) {
        json_error('Invalid setup key', 403);
    }

    $exists = db()->prepare('SELECT id FROM users WHERE username = :u LIMIT 1');
    $exists->execute([':u' => trim($body['username'])]);
    if ($exists->fetch()) {
        json_error('User already exists', 409);
    }

    $ins = db()->prepare(
        'INSERT INTO users (username, password_hash, display_name, role, disabled, created_at)
         VALUES (:u, :p, :d, :r, 0, :c)'
    );
    $ins->execute([
        ':u' => trim($body['username']),
        ':p' => password_hash($body['password'], PASSWORD_DEFAULT),
        ':d' => trim($body['displayName'] ?? $body['username']),
        ':r' => 'admin',
        ':c' => now_utc(),
    ]);

    json_response(['ok' => true, 'id' => (int) db()->lastInsertId()], 201);
}
