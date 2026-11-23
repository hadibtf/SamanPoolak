<?php
// Retained so databases that recorded this migration keep a complete history.
// Synced records already written remain ordinary manager production records.
return [
    'description' => 'Retired employee report production-link migration',
    'destructive' => false,
    'transactional' => false,
    'verify' => static function (MigrationDatabase $database): bool {
        return true;
    },
    'up' => static function (MigrationDatabase $database): void {
        // Intentionally empty. Existing production records are preserved.
    },
];
