<?php
// PHP's built-in server uses this router in local development. Let it serve
// uploaded images as static files and send API routes through the front controller.
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
$file = realpath(__DIR__ . $path);
$root = realpath(__DIR__);

if (strpos($path, '/uploads/') === 0 && $file && $root
    && strpos($file, $root . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR) === 0
    && is_file($file)) {
    return false;
}

require __DIR__ . '/index.php';
