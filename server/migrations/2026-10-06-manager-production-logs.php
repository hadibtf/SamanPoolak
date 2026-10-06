<?php
return [
    'description' => 'Create separate manager-entered production logs without task quantity caps',
    'destructive' => false,
    'transactional' => false,
    'verify' => static function (MigrationDatabase $database): bool {
        return $database->columnExists('manager_production_logs', 'submission_key')
            && $database->columnExists('manager_production_logs', 'entered_by')
            && $database->columnExists('manager_production_logs', 'deleted_at');
    },
    'up' => static function (MigrationDatabase $database): void {
        if (!$database->columnExists('manager_production_logs', 'id')) {
            $database->execute('CREATE TABLE IF NOT EXISTS manager_production_logs (
                `id` INT AUTO_INCREMENT PRIMARY KEY,
                `employee_user_id` INT NOT NULL,
                `entered_by` INT NOT NULL,
                `order_id` INT NOT NULL,
                `order_item_uid` VARCHAR(128) NOT NULL,
                `quantity` DECIMAL(14,3) NOT NULL,
                `total_weight_grams` DECIMAL(14,3) NOT NULL,
                `production_date` VARCHAR(8) NOT NULL,
                `submission_key` CHAR(36) NOT NULL,
                `created_at` DATETIME NOT NULL,
                `updated_at` DATETIME NULL,
                `deleted_at` DATETIME NULL,
                CONSTRAINT fk_manager_production_logs_employee FOREIGN KEY (`employee_user_id`) REFERENCES users(id),
                CONSTRAINT fk_manager_production_logs_entered_by FOREIGN KEY (`entered_by`) REFERENCES users(id),
                CONSTRAINT fk_manager_production_logs_order FOREIGN KEY (`order_id`) REFERENCES orders(id),
                UNIQUE KEY uq_manager_production_logs_submission (`submission_key`),
                INDEX idx_manager_production_logs_employee_date (`employee_user_id`, `production_date`),
                INDEX idx_manager_production_logs_order_item (`order_id`, `order_item_uid`),
                INDEX idx_manager_production_logs_created (`created_at`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
        }
    },
];
