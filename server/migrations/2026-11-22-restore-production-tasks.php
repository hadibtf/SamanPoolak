<?php
// Retained so databases that recorded this temporary restoration keep a
// complete migration history. The employee task mechanism is now retired.
return [
    'description' => 'Retired temporary production task restoration migration',
    'destructive' => false,
    'transactional' => false,
    'verify' => static function (MigrationDatabase $database): bool {
        return true;
    },
    'up' => static function (MigrationDatabase $database): void {
        // Intentionally empty. Fresh installs do not recreate employee tasks.
    },
];
