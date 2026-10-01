<?php
// The migration ID is kept stable from the confirmed production SQL migration.
return [
    'description' => 'Add measured production weight fields',
    'destructive' => false,
    'transactional' => false,
    'verify' => static function (MigrationDatabase $database): bool {
        return $database->columnExists('production_tasks', 'weight_of_10_grams')
            && $database->columnExists('production_logs', 'total_weight_grams');
    },
    'up' => static function (MigrationDatabase $database): void {
        if (!$database->columnExists('production_tasks', 'weight_of_10_grams')) {
            $database->execute(
                'ALTER TABLE `production_tasks` ADD COLUMN `weight_of_10_grams` DECIMAL(14,3) NULL AFTER `required_quantity`'
            );
        }
        if (!$database->columnExists('production_logs', 'total_weight_grams')) {
            $database->execute(
                'ALTER TABLE `production_logs` ADD COLUMN `total_weight_grams` DECIMAL(14,3) NOT NULL DEFAULT 0 AFTER `quantity`'
            );
        }
    },
];
