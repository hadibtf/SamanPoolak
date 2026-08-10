<?php
// Loads server/config.php once and exposes config().

function config($key = null, $default = null)
{
    static $cfg = null;
    if ($cfg === null) {
        $file = dirname(__DIR__) . '/config.php';
        if (!file_exists($file)) {
            http_response_code(500);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(['error' => 'Server not configured: config.php is missing.']);
            exit;
        }
        $cfg = require $file;
    }
    if ($key === null) {
        return $cfg;
    }
    return array_key_exists($key, $cfg) ? $cfg[$key] : $default;
}
