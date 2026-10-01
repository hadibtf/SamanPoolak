<?php
// The migration ID is kept stable from the confirmed production SQL migration.
return [
    'description' => 'Add production log edit and soft-delete timestamps',
    'destructive' => false,
    'transactional' => false,
    'verify' => static function (MigrationDatabase $database): bool {
        return $database->columnExists('production_logs', 'updated_at')
            && $database->columnExists('production_logs', 'deleted_at');
    },
    'up' => static function (MigrationDatabase $database): void {
        if (!$database->columnExists('production_logs', 'updated_at')) {
            $database->execute(
                'ALTER TABLE `production_logs` ADD COLUMN `updated_at` DATETIME NULL AFTER `created_at`'
            );
        }
        if (!$database->columnExists('production_logs', 'deleted_at')) {
            $database->execute(
                'ALTER TABLE `production_logs` ADD COLUMN `deleted_at` DATETIME NULL AFTER `updated_at`'
            );
        }
    },
];
