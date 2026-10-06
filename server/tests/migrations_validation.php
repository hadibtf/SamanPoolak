<?php
require_once __DIR__ . '/../lib/migrations.php';

function migration_check($condition, $message)
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

final class FakeMigrationDatabase implements MigrationDatabase
{
    public $trackingExists = false;
    public $columns = [];
    public $applied = [];
    public $executed = [];
    public $failOnceWhen = null;
    public $lockHeld = false;
    private $transactionSnapshot = null;

    public function trackingTableExists(): bool
    {
        return $this->trackingExists;
    }

    public function ensureTrackingTable(): void
    {
        $this->trackingExists = true;
    }

    public function appliedMigrations(): array
    {
        return $this->applied;
    }

    public function columnExists($table, $column): bool
    {
        return !empty($this->columns[$table][$column]);
    }

    public function execute($sql): void
    {
        if ($this->failOnceWhen !== null && strpos($sql, $this->failOnceWhen) !== false) {
            $this->failOnceWhen = null;
            throw new RuntimeException('Simulated DDL failure.');
        }
        if (preg_match('/^CREATE TABLE IF NOT EXISTS `?([^`\s(]+)`?\s*\(/i', $sql, $matches)) {
            $table = $matches[1];
            preg_match_all('/^\s*`([^`]+)`\s+[^,\r\n]+/m', $sql, $columnMatches);
            foreach ($columnMatches[1] as $column) {
                $this->columns[$table][$column] = true;
            }
            $this->executed[] = $sql;
            return;
        }
        if (!preg_match('/^ALTER TABLE `([^`]+)` ADD COLUMN `([^`]+)`/i', $sql, $matches)) {
            throw new RuntimeException('Unexpected SQL in migration test: ' . $sql);
        }
        $table = $matches[1];
        $column = $matches[2];
        if ($this->columnExists($table, $column)) {
            throw new RuntimeException("Duplicate column {$table}.{$column}");
        }
        $this->columns[$table][$column] = true;
        $this->executed[] = $sql;
    }

    public function recordMigration($migrationId): void
    {
        if (array_key_exists($migrationId, $this->applied)) {
            throw new RuntimeException("Duplicate migration record {$migrationId}");
        }
        $this->applied[$migrationId] = '2026-10-01 00:00:00';
    }

    public function acquireMigrationLock($lockName): bool
    {
        if ($this->lockHeld) {
            return false;
        }
        $this->lockHeld = true;
        return true;
    }

    public function releaseMigrationLock(): void
    {
        $this->lockHeld = false;
    }

    public function beginTransaction(): void
    {
        if ($this->transactionSnapshot !== null) {
            throw new RuntimeException('Nested fake transaction.');
        }
        $this->transactionSnapshot = [$this->columns, $this->applied];
    }

    public function commit(): void
    {
        $this->transactionSnapshot = null;
    }

    public function rollBack(): void
    {
        if ($this->transactionSnapshot !== null) {
            [$this->columns, $this->applied] = $this->transactionSnapshot;
            $this->transactionSnapshot = null;
        }
    }

    public function inTransaction(): bool
    {
        return $this->transactionSnapshot !== null;
    }
}

$migrationDirectory = __DIR__ . '/../migrations';
$migrations = migrations_discover($migrationDirectory);
$expectedIds = [
    '2026-09-26-production-log-edit-delete',
    '2026-09-26-production-weight',
    '2026-10-06-manager-production-logs',
];
migration_check(array_column($migrations, 'id') === $expectedIds, 'Migrations must be discovered in stable lexical order.');

$schema = file_get_contents(__DIR__ . '/../schema.sql');
foreach ([
    'schema_migrations',
    'weight_of_10_grams',
    'total_weight_grams',
    'updated_at          DATETIME      NULL',
    'deleted_at          DATETIME      NULL',
    'CREATE TABLE IF NOT EXISTS manager_production_logs',
] as $schemaToken) {
    migration_check(strpos($schema, $schemaToken) !== false, "Fresh-install schema is missing {$schemaToken}.");
}

// Confirmed production migrations must be adopted without replaying ALTERs
// when their effects are already present and the tracking table is new.
$adopted = new FakeMigrationDatabase();
$adopted->columns = [
    'production_tasks' => ['weight_of_10_grams' => true],
    'production_logs' => [
        'total_weight_grams' => true,
        'updated_at' => true,
        'deleted_at' => true,
    ],
];
$initialStatus = migrations_status($adopted, $migrations);
migration_check(!$initialStatus['tracking_table_exists'], 'Status must not create the tracking table.');
migration_check(count($initialStatus['pending']) === 3, 'Untracked migrations must remain visible.');
migration_check(count($initialStatus['schema_present']) === 2, 'Status should recognize confirmed historical schema before tracking exists.');
$adoptResult = migrations_apply($adopted, $migrations);
migration_check($adoptResult['created_tracking_table'], 'Apply should create tracking on an existing database.');
migration_check(count($adopted->executed) === 1, 'Existing production columns must not be altered again; the new manager log table must be created.');
migration_check(count($adopted->applied) === 3, 'Verified historical migrations and the new manager log table must be recorded.');

// Missing columns are added once; recorded migrations are skipped on rerun.
$fresh = new FakeMigrationDatabase();
$firstRun = migrations_apply($fresh, $migrations);
migration_check(count($firstRun['applied']) === 3, 'Apply must record all pending migrations.');
migration_check(count($fresh->executed) === 5, 'Apply must add missing columns and create the manager log table once.');
$secondRun = migrations_apply($fresh, $migrations);
migration_check(count($secondRun['applied']) === 0, 'A second apply must not rerun recorded migrations.');
migration_check(count($fresh->executed) === 5, 'A second apply must not rerun schema changes.');

// A failed multi-column DDL migration is not recorded, stops the run, and can
// be safely retried because already-added columns are checked individually.
$retry = new FakeMigrationDatabase();
$retry->failOnceWhen = 'ADD COLUMN `total_weight_grams`';
try {
    migrations_apply($retry, $migrations);
    throw new RuntimeException('Expected the injected migration failure.');
} catch (RuntimeException $error) {
    migration_check(strpos($error->getMessage(), '2026-09-26-production-weight') !== false, 'Failure must identify the migration.');
}
migration_check(isset($retry->applied['2026-09-26-production-log-edit-delete']), 'Prior successful migrations must remain recorded.');
migration_check(!isset($retry->applied['2026-09-26-production-weight']), 'Failed migration must not be recorded.');
migration_check(!$retry->lockHeld, 'The advisory lock must be released after failure.');
$retryResult = migrations_apply($retry, $migrations);
migration_check(count($retryResult['applied']) === 2, 'Retry must finish the failed migration and then create the manager log table.');
migration_check(count($retry->executed) === 5, 'Retry must preserve completed DDL and apply each pending change once.');

// Destructive migrations are rejected before their callback can execute.
$destructiveDatabase = new FakeMigrationDatabase();
$destructiveMigration = [[
    'id' => '2099-01-01-remove-archive',
    'description' => 'Remove an obsolete archive table',
    'destructive' => true,
    'transactional' => false,
    'up' => static function (MigrationDatabase $database): void {
        $database->execute('DROP TABLE `archive`');
    },
]];
try {
    migrations_apply($destructiveDatabase, $destructiveMigration);
    throw new RuntimeException('Expected destructive migration to be blocked.');
} catch (RuntimeException $error) {
    migration_check(strpos($error->getMessage(), '--allow-destructive') !== false, 'Blocked destructive migration must state the required flag.');
}
migration_check(count($destructiveDatabase->executed) === 0, 'Blocked destructive migration must execute no SQL.');
migration_check(!$destructiveDatabase->lockHeld, 'The advisory lock must be released after preflight failure.');

// Unknown recorded IDs mean migration history is incomplete; stop before
// changing schema until the missing migration files are restored.
$unknownDatabase = new FakeMigrationDatabase();
$unknownDatabase->trackingExists = true;
$unknownDatabase->applied['2025-01-01-missing-file'] = '2025-01-01 00:00:00';
try {
    migrations_apply($unknownDatabase, $migrations);
    throw new RuntimeException('Expected unknown migration history to be blocked.');
} catch (RuntimeException $error) {
    migration_check(strpos($error->getMessage(), '2025-01-01-missing-file') !== false, 'Unknown migration IDs must be reported.');
}
migration_check(count($unknownDatabase->executed) === 0, 'Unknown migration history must block all schema changes.');
migration_check(!$unknownDatabase->lockHeld, 'The advisory lock must be released after unknown-history failure.');

// A recorded migration whose expected schema has disappeared is drift; stop
// instead of silently treating its tracking row as sufficient.
$driftDatabase = new FakeMigrationDatabase();
$driftDatabase->trackingExists = true;
$driftDatabase->applied['2026-09-26-production-log-edit-delete'] = '2026-09-26 00:00:00';
$driftStatus = migrations_status($driftDatabase, $migrations);
migration_check(isset($driftStatus['schema_drift']['2026-09-26-production-log-edit-delete']), 'Status must detect missing columns for a recorded migration.');
try {
    migrations_apply($driftDatabase, $migrations);
    throw new RuntimeException('Expected tracked schema drift to be blocked.');
} catch (RuntimeException $error) {
    migration_check(strpos($error->getMessage(), '2026-09-26-production-log-edit-delete') !== false, 'Apply must identify tracked schema drift.');
}
migration_check(count($driftDatabase->executed) === 0, 'Tracked schema drift must block schema changes.');
migration_check(!$driftDatabase->lockHeld, 'The advisory lock must be released after drift failure.');

echo "Migration validation passed\n";
