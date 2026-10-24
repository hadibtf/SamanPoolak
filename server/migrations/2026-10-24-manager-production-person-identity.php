<?php
return [
    'description' => 'Allow manager production logs for every employee profile',
    'destructive' => false,
    'transactional' => false,
    'verify' => static function (MigrationDatabase $database): bool {
        return $database->columnExists('manager_production_logs', 'employee_person_id');
    },
    'up' => static function (MigrationDatabase $database): void {
        if (!$database->columnExists('manager_production_logs', 'employee_person_id')) {
            $database->execute('ALTER TABLE manager_production_logs
                ADD COLUMN employee_person_id VARCHAR(32) NULL AFTER employee_user_id,
                ADD CONSTRAINT fk_manager_production_logs_person FOREIGN KEY (employee_person_id) REFERENCES people(id),
                ADD INDEX idx_manager_production_logs_person_date (employee_person_id, production_date)');
        }
        $database->execute('UPDATE manager_production_logs ml
            JOIN employee_accounts ea ON ea.user_id = ml.employee_user_id
            SET ml.employee_person_id = ea.person_id
            WHERE ml.employee_person_id IS NULL');
        $database->execute('ALTER TABLE manager_production_logs MODIFY employee_user_id INT NULL');
    },
];
