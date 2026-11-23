<?php
return [
    'description' => 'Remove retired employee report storage and preserve its order production records',
    'destructive' => true,
    'transactional' => false,
    'verify' => static function (MigrationDatabase $database): bool {
        $reportsRemoved = !$database->tableExists('employee_production_reports');
        $reportLinkRemoved = !$database->tableExists('manager_production_logs')
            || !$database->columnExists('manager_production_logs', 'source_report_id');
        return $reportsRemoved && $reportLinkRemoved;
    },
    'up' => static function (MigrationDatabase $database): void {
        // Synced report production is already represented by manager log rows.
        // Remove only the back-reference and report payload; keep those rows.
        if ($database->tableExists('manager_production_logs')
            && $database->columnExists('manager_production_logs', 'source_report_id')) {
            if ($database->foreignKeyExists('manager_production_logs', 'fk_manager_production_logs_report')) {
                $database->execute('ALTER TABLE `manager_production_logs` DROP FOREIGN KEY `fk_manager_production_logs_report`');
            }
            $database->execute('ALTER TABLE `manager_production_logs` DROP COLUMN `source_report_id`');
        }
        if ($database->tableExists('employee_production_reports')) {
            $database->execute('DROP TABLE IF EXISTS `employee_production_reports`');
        }
    },
];
