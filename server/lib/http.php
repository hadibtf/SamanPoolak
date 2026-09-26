<?php
// HTTP / JSON helpers shared by all routes.

// Emit CORS headers based on the request Origin and the config allowlist.
// Answers preflight (OPTIONS) requests directly.
function handle_cors()
{
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    // Keep the configured allowlist, while always allowing the two fixed
    // first-party application origins. Existing deployments can have an older
    // config.php which predates the employee app; without these defaults the
    // browser blocks its login request before it reaches the auth route.
    $allowed = array_unique(array_filter(array_merge(
        config('cors_allowed_origins', []),
        [
            config('management_app_origin', 'https://platform.samanpoolak.ir'),
            config('employee_app_origin', 'https://employee.samanpoolak.ir'),
        ]
    )));
    if ($origin && in_array($origin, $allowed, true)) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Vary: Origin');
    }
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization');
    header('Access-Control-Max-Age: 86400');

    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

// Decode the JSON request body into an associative array (empty array if none).
function json_input()
{
    $raw = file_get_contents('php://input');
    if ($raw === '' || $raw === false) {
        return [];
    }
    $data = json_decode($raw, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        json_error('Invalid JSON body', 400);
    }
    return is_array($data) ? $data : [];
}

function json_response($data, $status = 200)
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

// $detail is only surfaced when config('debug') is true.
function json_error($message, $status = 400, $detail = null)
{
    $payload = ['error' => $message];
    if ($detail !== null && config('debug')) {
        $payload['detail'] = $detail;
    }
    if ($detail !== null) {
        error_log("[signit-api] $message :: $detail");
    }
    json_response($payload, $status);
}

// Ensure each named field is present and non-empty in $data, else 400.
function require_fields($data, array $fields)
{
    $missing = [];
    foreach ($fields as $f) {
        if (!isset($data[$f]) || $data[$f] === '') {
            $missing[] = $f;
        }
    }
    if ($missing) {
        json_error('Missing required fields: ' . implode(', ', $missing), 422);
    }
}

// Convert a DB DATETIME ("Y-m-d H:i:s" UTC) to ISO 8601 ("...Z"), or null.
function to_iso($dt)
{
    return $dt ? str_replace(' ', 'T', $dt) . 'Z' : null;
}

// Normalize a client-supplied timestamp (ISO or "Y-m-d H:i:s") to DB format.
function from_iso($value)
{
    $ts = strtotime($value);
    return $ts === false ? null : gmdate('Y-m-d H:i:s', $ts);
}
