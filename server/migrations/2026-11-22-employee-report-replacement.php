<?php
// Retained so databases that recorded this migration keep a complete history.
// The employee report replacement was retired; fresh installs do not create
// report or employee task storage.
return [
    'description' => 'Retired employee report replacement migration',
    'destructive' => false,
    'transactional' => false,
    'verify' => static function (MigrationDatabase $database): bool {
        return true;
    },
    'up' => static function (MigrationDatabase $database): void {
        // Intentionally empty; later retirement migrations remove old storage.
    },
];
