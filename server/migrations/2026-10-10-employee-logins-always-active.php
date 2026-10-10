<?php
return [
    'description' => 'Clear the removed active toggle from existing employee logins',
    'destructive' => false,
    'transactional' => true,
    'up' => static function (MigrationDatabase $database): void {
        $database->execute("UPDATE users SET disabled = 0 WHERE role = 'employee' AND disabled <> 0");
    },
];
