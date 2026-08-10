<?php
// Copy this file to config.php on the server and fill in real values.
// config.php is git-ignored and is NEVER deployed/overwritten by CI.

return [
    // MySQL connection (from cPanel "MySQL Databases").
    // Note: cPanel prefixes DB and user names with your account, e.g. "hadibtf_signit".
    'db' => [
        'host'    => 'localhost',
        'name'    => 'CPANELUSER_signit',
        'user'    => 'CPANELUSER_apiuser',
        'pass'    => 'CHANGE_ME',
        'charset' => 'utf8mb4',
    ],

    // Browser origins allowed to call this API (exact scheme + host, no trailing slash).
    // The app SPA is served from the platform subdomain; the API stays at samanpoolak.ir/api,
    // so the platform origin must be allowed (cross-origin).
    'cors_allowed_origins' => [
        'https://platform.samanpoolak.ir',
        'https://samanpoolak.ir',
        'https://jobs.samanpoolak.ir',
        'http://localhost:3000',
    ],

    // One-time key that protects POST /setup/seed-admin. Use a long random string.
    // After you have created the first admin user, blank this out to disable the route.
    'setup_key' => 'CHANGE_ME_TO_A_LONG_RANDOM_STRING',

    // How long a login session stays valid (sliding window, refreshed on each request).
    'session_ttl_days' => 30,

    // Set true only while debugging — includes error details in 500 responses.
    'debug' => false,
];
