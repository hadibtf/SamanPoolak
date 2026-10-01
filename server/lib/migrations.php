<?php
// Tracked schema migrations for the PHP/MySQL cPanel deployment.

interface MigrationDatabase
{
    public function trackingTableExists(): bool;
    public function ensureTrackingTable(): void;
    public function appliedMigrations(): array;
    public function columnExists($table, $column): bool;
    public function execute($sql): void;
    public function recordMigration($migrationId): void;
    public function acquireMigrationLock($lockName): bool;
    public function releaseMigrationLock(): void;
    public function beginTransaction(): void;
    public function commit(): void;
    public function rollBack(): void;
    public function inTransaction(): bool;
}

final class PdoMigrationDatabase implements MigrationDatabase
{
    private $pdo;
    private $lockAcquired = false;
    private $lockName = null;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    public function trackingTableExists(): bool
    {
        $stmt = $this->pdo->prepare(
            'SELECT COUNT(*) FROM information_schema.TABLES
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table_name'
        );
        $stmt->execute([':table_name' => 'schema_migrations']);
        return (int) $stmt->fetchColumn() > 0;
    }

    public function ensureTrackingTable(): void
    {
        $this->pdo->exec(
            'CREATE TABLE IF NOT EXISTS schema_migrations (
                migration_id VARCHAR(191) NOT NULL,
                applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (migration_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
        );
    }

    public function appliedMigrations(): array
    {
        if (!$this->trackingTableExists()) {
            return [];
        }
        $stmt = $this->pdo->query(
            'SELECT migration_id, applied_at FROM schema_migrations ORDER BY migration_id ASC'
        );
        $rows = [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $rows[$row['migration_id']] = $row['applied_at'];
        }
        return $rows;
    }

    public function columnExists($table, $column): bool
    {
        $stmt = $this->pdo->prepare(
            'SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table_name AND COLUMN_NAME = :column_name'
        );
        $stmt->execute([':table_name' => $table, ':column_name' => $column]);
        return (int) $stmt->fetchColumn() > 0;
    }

    public function execute($sql): void
    {
        $this->pdo->exec($sql);
    }

    public function recordMigration($migrationId): void
    {
        $stmt = $this->pdo->prepare(
            'INSERT INTO schema_migrations (migration_id, applied_at) VALUES (:migration_id, UTC_TIMESTAMP())'
        );
        $stmt->execute([':migration_id' => $migrationId]);
    }

    public function acquireMigrationLock($lockName): bool
    {
        $stmt = $this->pdo->prepare('SELECT GET_LOCK(:lock_name, 0)');
        $stmt->execute([':lock_name' => $lockName]);
        $this->lockAcquired = (int) $stmt->fetchColumn() === 1;
        $this->lockName = $this->lockAcquired ? $lockName : null;
        return $this->lockAcquired;
    }

    public function releaseMigrationLock(): void
    {
        if (!$this->lockAcquired) {
            return;
        }
        try {
            $stmt = $this->pdo->prepare('SELECT RELEASE_LOCK(:lock_name)');
            $stmt->execute([':lock_name' => $this->lockName]);
            $stmt->fetchColumn();
        } finally {
            $this->lockAcquired = false;
            $this->lockName = null;
        }
    }

    public function beginTransaction(): void
    {
        if (!$this->pdo->beginTransaction()) {
            throw new RuntimeException('Could not start the migration transaction.');
        }
    }

    public function commit(): void
    {
        if (!$this->pdo->commit()) {
            throw new RuntimeException('Could not commit the migration transaction.');
        }
    }

    public function rollBack(): void
    {
        if ($this->pdo->inTransaction()) {
            $this->pdo->rollBack();
        }
    }

    public function inTransaction(): bool
    {
        return $this->pdo->inTransaction();
    }
}

function migrations_discover($directory): array
{
    $paths = glob(rtrim($directory, '/\\') . DIRECTORY_SEPARATOR . '*.php');
    if ($paths === false) {
        throw new RuntimeException('Could not read the migration directory.');
    }
    sort($paths, SORT_STRING);

    $migrations = [];
    foreach ($paths as $path) {
        $migrationId = basename($path, '.php');
        if (!preg_match('/^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/D', $migrationId)) {
            throw new RuntimeException("Invalid migration filename: {$migrationId}.php");
        }

        $definition = require $path;
        if (!is_array($definition)
            || !isset($definition['description'])
            || !is_string($definition['description'])
            || trim($definition['description']) === ''
            || !array_key_exists('destructive', $definition)
            || !is_bool($definition['destructive'])
            || !array_key_exists('transactional', $definition)
            || !is_bool($definition['transactional'])
            || !isset($definition['up'])
            || !is_callable($definition['up'])
            || (array_key_exists('verify', $definition) && !is_callable($definition['verify']))) {
            throw new RuntimeException("Invalid migration definition: {$migrationId}");
        }

        $definition['id'] = $migrationId;
        $definition['path'] = $path;
        $migrations[] = $definition;
    }
    return $migrations;
}

function migrations_status(MigrationDatabase $database, array $migrations): array
{
    $trackingTableExists = $database->trackingTableExists();
    $applied = $trackingTableExists ? $database->appliedMigrations() : [];
    $knownIds = [];
    $pending = [];
    $schemaPresent = [];
    $schemaDrift = [];
    foreach ($migrations as $migration) {
        $knownIds[$migration['id']] = true;
        if (array_key_exists($migration['id'], $applied)) {
            if (isset($migration['verify']) && !$migration['verify']($database)) {
                $schemaDrift[$migration['id']] = true;
            }
        } else {
            $pending[] = $migration;
            if (isset($migration['verify']) && $migration['verify']($database)) {
                $schemaPresent[$migration['id']] = true;
            }
        }
    }

    $unknown = [];
    foreach ($applied as $migrationId => $appliedAt) {
        if (!isset($knownIds[$migrationId])) {
            $unknown[$migrationId] = $appliedAt;
        }
    }

    return [
        'tracking_table_exists' => $trackingTableExists,
        'applied' => $applied,
        'pending' => $pending,
        'schema_present' => $schemaPresent,
        'schema_drift' => $schemaDrift,
        'unknown' => $unknown,
    ];
}

function migrations_apply(MigrationDatabase $database, array $migrations, $allowDestructive = false, $lockName = 'saman_schema_migrations'): array
{
    $hadTrackingTable = $database->trackingTableExists();
    $database->ensureTrackingTable();
    if (!$database->acquireMigrationLock($lockName)) {
        throw new RuntimeException('Another migration runner holds the database lock. No migrations were run.');
    }

    try {
        $status = migrations_status($database, $migrations);
        if ($status['unknown']) {
            throw new RuntimeException(
                'Tracking contains migration IDs without matching files; restore those migration files before applying: ' .
                implode(', ', array_keys($status['unknown']))
            );
        }
        if ($status['schema_drift']) {
            throw new RuntimeException(
                'Tracked migration schema is missing expected columns; inspect the database before applying: ' .
                implode(', ', array_keys($status['schema_drift']))
            );
        }
        $blocked = [];
        foreach ($status['pending'] as $migration) {
            if ($migration['destructive'] && !$allowDestructive) {
                $blocked[] = $migration['id'];
            }
        }
        if ($blocked) {
            throw new RuntimeException(
                'Pending destructive migration(s) require the explicit --allow-destructive flag: ' . implode(', ', $blocked)
            );
        }

        $appliedNow = [];
        foreach ($status['pending'] as $migration) {
            try {
                if ($migration['transactional']) {
                    $database->beginTransaction();
                }
                $migration['up']($database);
                $database->recordMigration($migration['id']);
                if ($migration['transactional']) {
                    $database->commit();
                }
                $appliedNow[] = $migration['id'];
            } catch (Throwable $error) {
                if ($database->inTransaction()) {
                    $database->rollBack();
                }
                throw new RuntimeException(
                    "Migration {$migration['id']} failed and was not recorded: {$error->getMessage()}",
                    0,
                    $error
                );
            }
        }

        return [
            'created_tracking_table' => !$hadTrackingTable,
            'applied' => $appliedNow,
            'skipped' => array_keys($status['applied']),
        ];
    } finally {
        $database->releaseMigrationLock();
    }
}
