<?php
// Token-based authentication helpers.

function generate_token()
{
    return bin2hex(random_bytes(32)); // 64 hex chars
}

// Read the bearer token from the Authorization header (handles header-stripping hosts).
function bearer_token()
{
    $header = '';
    if (!empty($_SERVER['HTTP_AUTHORIZATION'])) {
        $header = $_SERVER['HTTP_AUTHORIZATION'];
    } elseif (!empty($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
        $header = $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
    } elseif (function_exists('apache_request_headers')) {
        $h = apache_request_headers();
        $header = $h['Authorization'] ?? ($h['authorization'] ?? '');
    }
    if (preg_match('/Bearer\s+(\S+)/i', $header, $m)) {
        return $m[1];
    }
    return null;
}

// Shape a users row for the wire (never leak the password hash).
function public_user($row)
{
    return [
        'id'          => (int) $row['id'],
        'username'    => $row['username'],
        'displayName' => $row['display_name'],
        'role'        => $row['role'],
    ];
}

// Return the authenticated user array (with active token) or null.
function current_user()
{
    $token = bearer_token();
    if (!$token) {
        return null;
    }
    $stmt = db()->prepare(
        'SELECT u.*, s.token AS session_token, s.expires_at
         FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token = :token LIMIT 1'
    );
    $stmt->execute([':token' => $token]);
    $row = $stmt->fetch();
    if (!$row) {
        return null;
    }
    if (strtotime($row['expires_at']) < time()) {
        // Expired: clean it up.
        $del = db()->prepare('DELETE FROM sessions WHERE token = :t');
        $del->execute([':t' => $token]);
        return null;
    }
    if ((int) $row['disabled'] === 1) {
        return null;
    }
    // Sliding expiry: extend on use.
    $ttlDays = (int) config('session_ttl_days', 30);
    $newExpiry = gmdate('Y-m-d H:i:s', time() + $ttlDays * 86400);
    $upd = db()->prepare('UPDATE sessions SET expires_at = :e WHERE token = :t');
    $upd->execute([':e' => $newExpiry, ':t' => $token]);

    $row['active_token'] = $token;
    return $row;
}

// Require a valid session; sends 401 and exits if absent.
function require_auth()
{
    $user = current_user();
    if (!$user) {
        json_error('Unauthorized', 401);
    }
    return $user;
}

// Require the (already authenticated) user to be an admin; 403 otherwise.
function require_admin($user)
{
    if (($user['role'] ?? '') !== 'admin') {
        json_error('Admin access required', 403);
    }
    return $user;
}
