<?php
// Local-only configuration for Docker Compose. Copy to config.local.php.
// These credentials are intentionally disposable and must never be reused on a hosted server.

return [
    'db' => [
        'host' => 'database',
        'name' => 'samanpoolak_dev',
        'user' => 'samanpoolak_local',
        'pass' => 'local-dev-only',
        'charset' => 'utf8mb4',
    ],
    'cors_allowed_origins' => [
        'http://localhost:3000',
        'http://localhost:3001',
    ],
    'management_app_origin' => 'http://localhost:3000',
    'employee_app_origin' => 'http://localhost:3001',
    'setup_key' => 'local-first-admin-setup-only',
    'session_ttl_days' => 30,
    'debug' => true,
];
