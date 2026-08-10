<?php
// Local dev router for PHP's built-in server (NOT used in production).
//   php -S localhost:8000 -t server dev-router.php
// Serves real files under /server (e.g. uploaded marking images) directly,
// and routes every virtual API path to the front controller.

$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$file = __DIR__ . '/server' . $path;

if ($path !== '/' && is_file($file)) {
    return false; // let the built-in server serve the static file
}

require __DIR__ . '/server/index.php';
