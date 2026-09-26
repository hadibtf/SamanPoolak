<?php
// Signit API — front controller.
// All requests are routed here by .htaccess.

require __DIR__ . '/lib/config.php';
require __DIR__ . '/lib/http.php';
require __DIR__ . '/lib/db.php';
require __DIR__ . '/lib/auth.php';
require __DIR__ . '/routes/auth.php';
require __DIR__ . '/routes/users.php';
require __DIR__ . '/routes/people.php';
require __DIR__ . '/routes/orders.php';
require __DIR__ . '/routes/production.php';
require __DIR__ . '/routes/markings.php';
require __DIR__ . '/routes/expenses.php';
require __DIR__ . '/routes/issue_notes.php';
require __DIR__ . '/routes/attendance.php';
require __DIR__ . '/routes/holidays.php';
require __DIR__ . '/routes/inquiries.php';
require __DIR__ . '/routes/job_applications.php';
require __DIR__ . '/routes/admin.php';

handle_cors();

// GET /  -> health check
function health($params, $body, $user)
{
    json_response(['ok' => true, 'name' => 'signit-api', 'time' => to_iso(now_utc())]);
}

// [method, pattern, handler, requiresAuth]
$routes = [
    ['GET',    '/',                 'health',        false],
    ['POST',   '/setup/seed-admin', 'seed_admin',    false],
    ['POST',   '/auth/login',       'auth_login',    false],
    ['POST',   '/auth/logout',      'auth_logout',   true],
    ['GET',    '/auth/me',          'auth_me',       true],
    ['GET',    '/users',            'users_list',    true],
    ['POST',   '/users',            'users_create',  true],
    ['DELETE', '/users/{id}',       'users_delete',  true],
    ['GET',    '/people',           'people_list',   true],
    ['POST',   '/people',           'people_create', true],
    ['GET',    '/people/{id}/employee-account', 'people_employee_account_get', true],
    ['GET',    '/people/{id}',      'people_get',    true],
    ['PUT',    '/people/{id}',      'people_update', true],
    ['DELETE', '/people/{id}',      'people_delete', true],
    ['GET',    '/orders',           'orders_list',   true],
    ['POST',   '/orders',           'orders_create', true],
    ['GET',    '/orders/{id}',      'orders_get',    true],
    ['PUT',    '/orders/{id}',      'orders_update', true],
    ['DELETE', '/orders/{id}',      'orders_delete', true],
    ['GET',    '/production/employees', 'production_employees', true],
    ['GET',    '/production/tasks', 'production_tasks_list', true],
    ['POST',   '/production/tasks', 'production_tasks_create', true],
    ['GET',    '/production/statistics/month', 'production_employee_month_statistics', true],
    ['GET',    '/production/statistics/day', 'production_employee_day_statistics', true],
    ['GET',    '/production/tasks/{id}/logs', 'production_task_logs_list', true],
    ['POST',   '/production/tasks/{id}/logs', 'production_task_log_create', true],
    ['GET',    '/production/orders/{orderId}/items/{itemUid}/summary', 'production_item_summary', true],
    ['GET',    '/markings',         'markings_list',   true],
    ['POST',   '/markings',         'markings_create', true],
    ['DELETE', '/markings/{id}',    'markings_delete', true],
    ['GET',    '/expenses',         'expenses_list',   true],
    ['POST',   '/expenses',         'expenses_create', true],
    ['PUT',    '/expenses/{id}',    'expenses_update', true],
    ['DELETE', '/expenses/{id}',    'expenses_delete', true],
    ['GET',    '/issue-notes',      'issue_notes_list', true],
    ['POST',   '/issue-notes',      'issue_notes_create', true],
    ['PUT',    '/issue-notes/{id}', 'issue_notes_update', true],
    ['DELETE', '/issue-notes/{id}', 'issue_notes_delete', true],
    ['POST',   '/inquiries',        'inquiries_create', false],
    ['GET',    '/inquiries',        'inquiries_list',   true],
    ['PUT',    '/inquiries/{id}',   'inquiries_update', true],
    ['GET',    '/job-applications/status', 'job_applications_hiring_status', false],
    ['PUT',    '/job-applications/status', 'job_applications_hiring_update', true],
    ['POST',   '/job-applications',      'job_applications_create', false],
    ['GET',    '/job-applications',      'job_applications_list',   true],
    ['DELETE', '/job-applications',      'job_applications_delete_all', true],
    ['GET',    '/job-applications/{id}', 'job_applications_get',    true],
    ['PUT',    '/job-applications/{id}', 'job_applications_update', true],
    ['DELETE', '/job-applications/{id}', 'job_applications_delete', true],
    ['POST',   '/attendance/import', 'attendance_import', true],
    ['GET',    '/attendance',       'attendance_list',   true],
    ['POST',   '/attendance',       'attendance_create', true],
    ['PUT',    '/attendance/{id}',  'attendance_update', true],
    ['DELETE', '/attendance/{id}',  'attendance_delete', true],
    ['POST',   '/holidays/import',  'holidays_import',   true],
    ['GET',    '/holidays',         'holidays_list',     true],
    ['GET',    '/backup',           'admin_backup',    true],
    ['POST',   '/restore',          'admin_restore',   true],
];

// Resolve the request path relative to where the app is installed
// (works at a subdomain root or in a subfolder).
$uri  = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
$base = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '')), '/');
if ($base !== '' && strpos($uri, $base) === 0) {
    $uri = substr($uri, strlen($base));
}
$path   = '/' . trim($uri, '/');
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

try {
    foreach ($routes as [$m, $pattern, $handler, $needsAuth]) {
        if ($m !== $method) {
            continue;
        }
        $regex = '#^' . preg_replace('#\{([a-zA-Z_]+)\}#', '(?P<$1>[^/]+)', $pattern) . '$#';
        if (preg_match($regex, $path, $matches)) {
            $params = array_filter($matches, 'is_string', ARRAY_FILTER_USE_KEY);
            $user   = $needsAuth ? require_auth() : null;
            // Employee tokens are intentionally narrow: production task reads
            // (and, later, production-log writes) are their only business API.
            $employeeAllowed = [
                'POST /auth/logout', 'GET /auth/me', 'GET /production/tasks', 'GET /holidays',
                'GET /production/statistics/month', 'GET /production/statistics/day',
            ];
            if ($user && ($user['role'] ?? '') === 'employee'
                && !in_array($method . ' ' . $path, $employeeAllowed, true)
                && !preg_match('#^(GET|POST) /production/tasks/[^/]+/logs$#', $method . ' ' . $path)) {
                json_error('Employee access is limited to production tasks', 403);
            }
            $body   = in_array($method, ['POST', 'PUT', 'PATCH'], true) ? json_input() : [];
            $handler($params, $body, $user);
            exit;
        }
    }
    json_error('Not found: ' . $method . ' ' . $path, 404);
} catch (Throwable $e) {
    json_error('Internal server error', 500, $e->getMessage());
}
