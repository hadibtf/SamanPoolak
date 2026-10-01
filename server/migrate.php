<?php
// CLI-only schema migration runner. It is intentionally not an HTTP endpoint.
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/lib/config.php';
require_once __DIR__ . '/lib/migrations.php';

function migration_cli_usage(): void
{
    echo "Usage:\n";
    echo "  php migrate.php status\n";
    echo "  php migrate.php dry-run\n";
    echo "  php migrate.php apply [--allow-destructive]\n";
}

function migration_cli_database(): PdoMigrationDatabase
{
    $database = config('db');
    foreach (['host', 'name', 'user', 'pass', 'charset'] as $key) {
        if (!array_key_exists($key, $database)) {
            throw new RuntimeException("Database config is missing '{$key}'.");
        }
    }

    $dsn = "mysql:host={$database['host']};dbname={$database['name']};charset={$database['charset']}";
    $pdo = new PDO($dsn, $database['user'], $database['pass'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    return new PdoMigrationDatabase($pdo);
}

function migration_cli_lock_name(): string
{
    $database = config('db');
    return 'saman_migrations_' . substr(sha1((string) $database['name']), 0, 32);
}

try {
    $args = array_slice($argv, 1);
    $command = $args[0] ?? 'help';
    $allowDestructive = in_array('--allow-destructive', $args, true);
    $allowedArgs = $command === 'apply' ? ['apply', '--allow-destructive'] : [$command];
    if ($command === 'help' || $command === '--help' || $command === '-h') {
        migration_cli_usage();
        exit(0);
    }
    if (!in_array($command, ['status', 'dry-run', 'apply'], true)
        || array_diff($args, $allowedArgs)
        || ($command === 'apply' && count($args) > 2)
        || ($command !== 'apply' && count($args) > 1)) {
        migration_cli_usage();
        throw new RuntimeException('Invalid command or option.');
    }

    $migrations = migrations_discover(__DIR__ . '/migrations');
    $database = migration_cli_database();
    $lockName = migration_cli_lock_name();

    if ($command === 'apply') {
        $result = migrations_apply($database, $migrations, $allowDestructive, $lockName);
        if ($result['created_tracking_table']) {
            echo "Created schema_migrations tracking table.\n";
        }
        foreach ($result['applied'] as $migrationId) {
            echo "Applied {$migrationId}\n";
        }
        if (!$result['applied']) {
            echo "No pending migrations.\n";
        }
        exit(0);
    }

    $status = migrations_status($database, $migrations);
    echo 'Tracking table: ' . ($status['tracking_table_exists'] ? 'present' : 'missing (read-only; apply creates it)') . "\n";
    foreach ($migrations as $migration) {
        if (isset($status['schema_drift'][$migration['id']])) {
            echo "DRIFT  {$migration['id']}: tracked, but expected schema is missing\n";
        } elseif (array_key_exists($migration['id'], $status['applied'])) {
            echo "APPLIED  {$migration['id']} ({$status['applied'][$migration['id']]})\n";
        } elseif ($command === 'dry-run') {
            $action = isset($status['schema_present'][$migration['id']])
                ? 'WOULD VERIFY AND RECORD EXISTING SCHEMA'
                : 'WOULD APPLY';
            $suffix = $migration['destructive'] ? ' [blocked: requires --allow-destructive]' : '';
            echo "{$action}  {$migration['id']}: {$migration['description']}{$suffix}\n";
        } elseif (isset($status['schema_present'][$migration['id']])) {
            echo "SCHEMA PRESENT, UNTRACKED  {$migration['id']}: {$migration['description']}\n";
        } else {
            echo "UNTRACKED  {$migration['id']}: {$migration['description']}\n";
        }
    }
    foreach ($status['unknown'] as $migrationId => $appliedAt) {
        echo "UNKNOWN RECORDED MIGRATION  {$migrationId} ({$appliedAt})\n";
    }
    if ($command === 'dry-run') {
        echo "Dry run complete; no schema or tracking rows were changed.\n";
    }
} catch (Throwable $error) {
    fwrite(STDERR, 'ERROR: ' . $error->getMessage() . "\n");
    exit(1);
}
