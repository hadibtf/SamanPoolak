<?php
require_once __DIR__ . '/../lib/migrations.php';

function migration_check($condition, $message)
{
    if (!$condition) throw new RuntimeException($message);
}

final class FakeMigrationDatabase implements MigrationDatabase
{
    public $trackingExists = false;
    public $tables = [];
    public $columns = [];
    public $foreignKeys = [];
    public $indexes = [];
    public $queryValues = [];
    public $applied = [];
    public $executed = [];
    public $failOnceWhen = null;
    public $lockHeld = false;
    private $transactionSnapshot = null;

    public function trackingTableExists(): bool { return $this->trackingExists; }
    public function ensureTrackingTable(): void { $this->trackingExists = true; }
    public function appliedMigrations(): array { return $this->applied; }
    public function tableExists($table): bool { return !empty($this->tables[$table]); }
    public function columnExists($table, $column): bool { return !empty($this->columns[$table][$column]); }
    public function indexExists($table, $index): bool { return !empty($this->indexes[$table][$index]); }
    public function foreignKeyExists($table, $constraint): bool { return !empty($this->foreignKeys[$table][$constraint]); }
    public function fetchValue($sql) { foreach ($this->queryValues as $fragment => $value) if (strpos($sql, $fragment) !== false) return $value; return 0; }

    public function execute($sql): void
    {
        if ($this->failOnceWhen !== null && strpos($sql, $this->failOnceWhen) !== false) {
            $this->failOnceWhen = null;
            throw new RuntimeException('Simulated DDL failure.');
        }
        if (preg_match('/^CREATE TABLE IF NOT EXISTS `?([^`\s(]+)`?\s*\(/i', $sql, $matches)) {
            $table = $matches[1];
            $this->tables[$table] = true;
            preg_match_all('/^\s*`?([a-z][a-z0-9_]*)`?\s+(?:INT|VARCHAR|DECIMAL|CHAR|DATETIME|TEXT|TINYINT|BIGINT|DATE|ENUM)\b/im', $sql, $columnMatches);
            foreach ($columnMatches[1] as $column) $this->columns[$table][$column] = true;
            $this->executed[] = $sql;
            return;
        }
        if (preg_match('/^DROP TABLE IF EXISTS `?([^`\s;]+)`?/i', $sql, $matches)) {
            unset($this->tables[$matches[1]], $this->columns[$matches[1]], $this->foreignKeys[$matches[1]]);
            $this->executed[] = $sql;
            return;
        }
        if (preg_match('/^ALTER TABLE `?([^`\s]+)`? DROP FOREIGN KEY `?([^`\s;]+)`?/i', $sql, $matches)) {
            unset($this->foreignKeys[$matches[1]][$matches[2]]);
            $this->executed[] = $sql;
            return;
        }
        if (preg_match('/^ALTER TABLE `?([^`\s]+)`? DROP INDEX `?([^`\s;]+)`?/i', $sql, $matches)) {
            unset($this->indexes[$matches[1]][$matches[2]]);
            $this->executed[] = $sql;
            return;
        }
        if (preg_match('/^ALTER TABLE `?([^`\s]+)`? DROP COLUMN `?([^`\s;]+)`?/i', $sql, $matches)) {
            unset($this->columns[$matches[1]][$matches[2]]);
            $this->executed[] = $sql;
            return;
        }
        if (preg_match('/^ALTER TABLE `?([^`\s]+)`?\s+ADD COLUMN `?([a-z][a-z0-9_]*)`?/i', $sql, $matches)) {
            $table = $matches[1]; $column = $matches[2];
            if ($this->columnExists($table, $column)) throw new RuntimeException("Duplicate column {$table}.{$column}");
            $this->tables[$table] = true;
            $this->columns[$table][$column] = true;
            $this->executed[] = $sql;
            return;
        }
        if (preg_match('/^(?:UPDATE|INSERT|DELETE|ALTER TABLE .* MODIFY)\b/i', trim($sql))) {
            $this->executed[] = $sql;
            return;
        }
        throw new RuntimeException('Unexpected SQL in migration test: ' . $sql);
    }

    public function recordMigration($migrationId): void
    {
        if (array_key_exists($migrationId, $this->applied)) throw new RuntimeException("Duplicate migration record {$migrationId}");
        $this->applied[$migrationId] = '2026-11-22 00:00:00';
    }
    public function acquireMigrationLock($lockName): bool
    {
        if ($this->lockHeld) return false;
        $this->lockHeld = true;
        return true;
    }
    public function releaseMigrationLock(): void { $this->lockHeld = false; }
    public function beginTransaction(): void
    {
        if ($this->transactionSnapshot !== null) throw new RuntimeException('Nested fake transaction.');
        $this->transactionSnapshot = [$this->tables, $this->columns, $this->foreignKeys, $this->applied];
    }
    public function commit(): void { $this->transactionSnapshot = null; }
    public function rollBack(): void
    {
        if ($this->transactionSnapshot !== null) {
            [$this->tables, $this->columns, $this->foreignKeys, $this->applied] = $this->transactionSnapshot;
            $this->transactionSnapshot = null;
        }
    }
    public function inTransaction(): bool { return $this->transactionSnapshot !== null; }
}

$migrationDirectory = __DIR__ . '/../migrations';
$migrations = migrations_discover($migrationDirectory);
$expectedIds = [
    '2026-09-26-production-log-edit-delete',
    '2026-09-26-production-weight',
    '2026-10-06-manager-production-logs',
    '2026-10-10-employee-logins-always-active',
    '2026-10-24-manager-production-person-identity',
    '2026-11-22-employee-report-replacement',
    '2026-11-22-report-order-record-sync',
    '2026-11-22-restore-production-tasks',
    '2026-11-22-retire-employee-report-storage',
    '2026-11-22-retire-production-tasks',
    '2026-11-23-remove-employee-login-system',
];
migration_check(array_column($migrations, 'id') === $expectedIds, 'Migrations must be discovered in stable lexical order.');

$schema = file_get_contents(__DIR__ . '/../schema.sql');
foreach ([
    'schema_migrations', 'CREATE TABLE IF NOT EXISTS manager_production_logs',
] as $schemaToken) {
    migration_check(strpos($schema, $schemaToken) !== false, "Fresh-install schema is missing {$schemaToken}.");
}
migration_check(strpos($schema, 'CREATE TABLE IF NOT EXISTS production_tasks') === false, 'Fresh installs must not recreate employee tasks.');
migration_check(strpos($schema, 'CREATE TABLE IF NOT EXISTS production_logs') === false, 'Fresh installs must not recreate employee task logs.');
migration_check(strpos($schema, 'CREATE TABLE IF NOT EXISTS employee_production_reports') === false, 'Fresh installs must not recreate employee reports.');
migration_check(strpos($schema, 'source_report_id') === false, 'Fresh installs must not retain employee report links on production rows.');
$schemaWithoutEmployeeAccounts = strpos($schema, 'CREATE TABLE IF NOT EXISTS employee_accounts') === false
    && strpos($schema, 'employee_user_id') === false;
migration_check($schemaWithoutEmployeeAccounts, 'Fresh installs must not create employee login mappings or production login IDs.');
$retiredReportMigrations = array_slice($migrations, 5, 2);
migration_check(count($retiredReportMigrations) === 2
    && !array_filter($retiredReportMigrations, static fn ($migration) => $migration['destructive']),
    'Retired report migrations must not remove task data on fresh installs.');

// Existing employee production storage is removed while order production rows remain.
$legacy = new FakeMigrationDatabase();
$legacy->trackingExists = true;
$legacy->tables = [
    'manager_production_logs' => true, 'employee_production_reports' => true,
    'production_tasks' => true, 'production_logs' => true,
    'employee_accounts' => true, 'users' => true, 'sessions' => true, 'people' => true,
];
$legacy->columns = [
    'production_tasks' => ['weight_of_10_grams' => true],
    'production_logs' => ['total_weight_grams' => true, 'updated_at' => true, 'deleted_at' => true],
    'manager_production_logs' => [
        'submission_key' => true, 'entered_by' => true, 'deleted_at' => true,
        'employee_person_id' => true, 'employee_user_id' => true, 'source_report_id' => true,
    ],
];
$legacy->foreignKeys = ['manager_production_logs' => [
    'fk_manager_production_logs_report' => true,
    'fk_manager_production_logs_employee' => true,
]];
$legacy->indexes = ['manager_production_logs' => ['idx_manager_production_logs_employee_date' => true]];
foreach (array_slice($expectedIds, 0, 8) as $migrationId) $legacy->applied[$migrationId] = '2026-11-22 00:00:00';
$legacyStatus = migrations_status($legacy, $migrations);
 migration_check(count($legacyStatus['pending']) === 3
    && array_column($legacyStatus['pending'], 'id') === [
        '2026-11-22-retire-employee-report-storage', '2026-11-22-retire-production-tasks',
        '2026-11-23-remove-employee-login-system',
    ], 'Previously migrated databases should only need employee production storage removal.');
migration_check(!$legacyStatus['schema_drift'] && !$legacyStatus['unknown'], 'Restored migration history must remain valid.');
try {
    migrations_apply($legacy, $migrations);
    throw new RuntimeException('Expected employee production data removal to require destructive approval.');
} catch (RuntimeException $error) {
    migration_check(strpos($error->getMessage(), '--allow-destructive') !== false, 'Employee production cleanup must explain the destructive flag.');
}
$retireResult = migrations_apply($legacy, $migrations, true);
migration_check($retireResult['applied'] === [
    '2026-11-22-retire-employee-report-storage', '2026-11-22-retire-production-tasks',
    '2026-11-23-remove-employee-login-system',
], 'Employee production storage migrations must apply once.');
migration_check(!$legacy->tableExists('production_tasks') && !$legacy->tableExists('production_logs'), 'Employee task tables must be removed.');
migration_check(!$legacy->tableExists('employee_production_reports')
    && !$legacy->columnExists('manager_production_logs', 'source_report_id'), 'Employee reports and their order-record link must be removed.');
migration_check(!$legacy->foreignKeyExists('manager_production_logs', 'fk_manager_production_logs_report'), 'Employee report foreign key must be removed.');
migration_check(!$legacy->tableExists('employee_accounts')
    && !$legacy->columnExists('manager_production_logs', 'employee_user_id'), 'Employee login mappings and manager-log login IDs must be removed.');
migration_check(!$legacy->foreignKeyExists('manager_production_logs', 'fk_manager_production_logs_employee')
    && empty($legacy->indexes['manager_production_logs']['idx_manager_production_logs_employee_date']), 'Manager-log login references must be removed.');
migration_check($legacy->tableExists('manager_production_logs'), 'Manager-entered and synced order production records must be preserved.');
migration_check(count(array_filter($legacy->executed, static fn ($sql) => strpos($sql, 'DELETE FROM manager_production_logs') !== false)) === 0, 'Employee login retirement must not delete manager production history.');
migration_check(count(array_filter($legacy->executed, static fn ($sql) => strpos($sql, "DELETE FROM users WHERE role = 'employee'") !== false)) === 1, 'Employee login users must be deleted by the cleanup migration.');
migration_check(strpos($schema, 'REFERENCES users(id) ON DELETE CASCADE') !== false, 'Deleting employee users must cascade to their login sessions.');
$legacyExecutedCount = count($legacy->executed);
$legacySecondRun = migrations_apply($legacy, $migrations, true);
migration_check(!$legacySecondRun['applied'] && count($legacy->executed) === $legacyExecutedCount, 'A completed restoration must not repeat schema changes.');

// Fresh installs do not recreate task tables and can apply the cleanup safely.
$fresh = new FakeMigrationDatabase();
$fresh->tables = ['people' => true, 'users' => true];
$freshResult = migrations_apply($fresh, $migrations, true);
migration_check(count($freshResult['applied']) === 11, 'Fresh migration history must include retired IDs and employee login removal.');
migration_check(!$fresh->tableExists('production_tasks') && !$fresh->tableExists('production_logs'), 'Fresh installs must not create employee task tables.');
migration_check($fresh->tableExists('manager_production_logs'), 'Fresh installs must retain manager-entered production records.');
$freshExecutedCount = count($fresh->executed);
$freshSecondRun = migrations_apply($fresh, $migrations, true);
migration_check(!$freshSecondRun['applied'] && count($fresh->executed) === $freshExecutedCount, 'A second fresh-schema apply must be a no-op.');

// Employee login retirement blocks before DDL when manager attribution needs review.
foreach ([
    ['fragment' => 'ea.user_id IS NULL', 'error' => 'lack a People profile'],
    ['fragment' => 'ml.employee_person_id <> ea.person_id', 'error' => 'conflict with their employee account'],
    ['fragment' => 'LEFT JOIN people p ON p.id = ea.person_id', 'error' => 'employee-account links point to missing or non-employee People profiles'],
    ['fragment' => 'LEFT JOIN people p ON p.id = ml.employee_person_id', 'error' => 'production records point to missing or non-employee People profiles'],
    ['fragment' => 'JOIN users u ON u.id = ml.employee_user_id', 'error' => 'production records reference a management login as the employee'],
    ['fragment' => 'u.id = ea.user_id WHERE u.role <>', 'error' => 'employee-account links point to management users'],
    ['fragment' => 'u.id = ml.entered_by WHERE u.role =', 'error' => 'records name an employee login as the manager who entered them'],
] as $case) {
    $blocked = new FakeMigrationDatabase();
    $blocked->trackingExists = true;
    $blocked->tables = ['manager_production_logs' => true, 'employee_accounts' => true, 'users' => true, 'people' => true];
    $blocked->columns = ['manager_production_logs' => [
        'employee_user_id' => true, 'employee_person_id' => true, 'entered_by' => true,
        'submission_key' => true, 'deleted_at' => true,
    ]];
    $blocked->foreignKeys = ['manager_production_logs' => ['fk_manager_production_logs_employee' => true]];
    $blocked->indexes = ['manager_production_logs' => ['idx_manager_production_logs_employee_date' => true]];
    $blocked->queryValues = [$case['fragment'] => 1];
    foreach (array_slice($expectedIds, 0, 10) as $migrationId) $blocked->applied[$migrationId] = '2026-11-22 00:00:00';
    try {
        migrations_apply($blocked, $migrations, true);
        throw new RuntimeException('Expected employee-account mapping review to block removal.');
    } catch (RuntimeException $error) {
        migration_check(strpos($error->getMessage(), $case['error']) !== false, 'Mapping review failed for ' . $case['fragment'] . ': ' . $error->getMessage());
    }
    migration_check(count($blocked->executed) === 0
        && $blocked->tableExists('employee_accounts')
        && $blocked->columnExists('manager_production_logs', 'employee_user_id'), 'A blocked review must leave login and production tables untouched.');
}

// Destructive migrations are rejected before their callback can execute.
$destructiveDatabase = new FakeMigrationDatabase();
$destructiveMigration = [[
    'id' => '2099-01-01-remove-archive',
    'description' => 'Remove an obsolete archive table',
    'destructive' => true,
    'transactional' => false,
    'up' => static function (MigrationDatabase $database): void { $database->execute('DROP TABLE IF EXISTS `archive`'); },
]];
try {
    migrations_apply($destructiveDatabase, $destructiveMigration);
    throw new RuntimeException('Expected destructive migration to be blocked.');
} catch (RuntimeException $error) {
    migration_check(strpos($error->getMessage(), '--allow-destructive') !== false, 'Blocked destructive migration must state the required flag.');
}
migration_check(count($destructiveDatabase->executed) === 0 && !$destructiveDatabase->lockHeld, 'Blocked migration must execute no SQL and release its lock.');

$unknown = new FakeMigrationDatabase();
$unknown->trackingExists = true;
$unknown->applied['2025-01-01-missing-file'] = '2025-01-01 00:00:00';
try {
    migrations_apply($unknown, $migrations, true);
    throw new RuntimeException('Expected unknown migration history to be blocked.');
} catch (RuntimeException $error) {
    migration_check(strpos($error->getMessage(), '2025-01-01-missing-file') !== false, 'Unknown migration IDs must be reported.');
}
migration_check(count($unknown->executed) === 0 && !$unknown->lockHeld, 'Unknown history must block schema changes and release its lock.');

echo "Migration validation passed\n";
