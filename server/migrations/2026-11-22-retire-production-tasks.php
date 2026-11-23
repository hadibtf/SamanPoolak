<?php
return [
    'description' => 'Remove retired employee production task tables and their history',
    'destructive' => true,
    'transactional' => false,
    'verify' => static function (MigrationDatabase $database): bool {
        return !$database->tableExists('production_logs') && !$database->tableExists('production_tasks');
    },
    'up' => static function (MigrationDatabase $database): void {
        // The user retired the task flow; these historical tables must not add
        // production to order totals or employee statistics anymore.
        $database->execute('DROP TABLE IF EXISTS production_logs');
        $database->execute('DROP TABLE IF EXISTS production_tasks');
    },
];
