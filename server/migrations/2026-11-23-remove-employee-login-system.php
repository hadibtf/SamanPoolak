<?php
return [
    'description' => 'Remove employee login accounts while preserving manager production attribution',
    'destructive' => true,
    'transactional' => false,
    'verify' => static function (MigrationDatabase $database): bool {
        return !$database->tableExists('employee_accounts')
            && !$database->columnExists('manager_production_logs', 'employee_user_id');
    },
    'up' => static function (MigrationDatabase $database): void {
        $hasLogs = $database->tableExists('manager_production_logs');
        $hasLoginId = $hasLogs && $database->columnExists('manager_production_logs', 'employee_user_id');
        $hasPersonId = $hasLogs && $database->columnExists('manager_production_logs', 'employee_person_id');
        $hasAccounts = $database->tableExists('employee_accounts');

        if (($hasAccounts || ($hasLogs && $hasPersonId)) && !$database->tableExists('people')) {
            throw new RuntimeException('Employee login removal stopped: People profiles are unavailable for attribution review.');
        }
        if (($hasLoginId || $hasAccounts) && !$database->tableExists('users')) {
            throw new RuntimeException('Employee login removal stopped: user accounts are unavailable for attribution review.');
        }

        $unmapped = 0;
        $conflicting = 0;
        $loginRoleMismatch = 0;
        if ($hasLoginId) {
            if (!$hasPersonId) {
                throw new RuntimeException('Employee login removal stopped: manager production records have not been linked to People profiles.');
            }

            $unmapped = $hasAccounts
                ? (int) $database->fetchValue("SELECT COUNT(*) FROM manager_production_logs ml
                    LEFT JOIN employee_accounts ea ON ea.user_id = ml.employee_user_id
                    WHERE ml.employee_user_id IS NOT NULL AND ml.employee_person_id IS NULL AND ea.user_id IS NULL")
                : (int) $database->fetchValue('SELECT COUNT(*) FROM manager_production_logs
                    WHERE employee_user_id IS NOT NULL AND employee_person_id IS NULL');

            $conflicting = $hasAccounts
                ? (int) $database->fetchValue('SELECT COUNT(*) FROM manager_production_logs ml
                    JOIN employee_accounts ea ON ea.user_id = ml.employee_user_id
                    WHERE ml.employee_person_id IS NOT NULL AND ml.employee_person_id <> ea.person_id')
                : 0;
            $loginRoleMismatch = (int) $database->fetchValue("SELECT COUNT(*) FROM manager_production_logs ml
                JOIN users u ON u.id = ml.employee_user_id
                WHERE ml.employee_user_id IS NOT NULL AND u.role <> 'employee'");
        }

        $accountRoleMismatch = $hasAccounts
            ? (int) $database->fetchValue("SELECT COUNT(*) FROM employee_accounts ea
                JOIN users u ON u.id = ea.user_id WHERE u.role <> 'employee'")
            : 0;

        $accountProfileMismatch = $hasAccounts
            ? (int) $database->fetchValue("SELECT COUNT(*) FROM employee_accounts ea
                LEFT JOIN people p ON p.id = ea.person_id
                WHERE p.id IS NULL OR p.category <> 'EMPLOYEE'")
            : 0;

        $recordProfileMismatch = $hasPersonId
            ? (int) $database->fetchValue("SELECT COUNT(*) FROM manager_production_logs ml
                LEFT JOIN people p ON p.id = ml.employee_person_id
                WHERE ml.employee_person_id IS NOT NULL
                  AND (p.id IS NULL OR p.category <> 'EMPLOYEE')")
            : 0;

        $managerCreators = $hasLogs && $database->columnExists('manager_production_logs', 'entered_by')
            ? (int) $database->fetchValue("SELECT COUNT(*) FROM manager_production_logs ml
                JOIN users u ON u.id = ml.entered_by WHERE u.role = 'employee'")
            : 0;

        if ($unmapped > 0 || $conflicting > 0 || $accountRoleMismatch > 0
            || $accountProfileMismatch > 0 || $recordProfileMismatch > 0
            || $loginRoleMismatch > 0 || $managerCreators > 0) {
            throw new RuntimeException(
                'Employee login removal stopped for review: '
                . "{$unmapped} production records lack a People profile, "
                . "{$conflicting} records conflict with their employee account, "
                . "{$accountRoleMismatch} employee-account links point to management users, "
                . "{$accountProfileMismatch} employee-account links point to missing or non-employee People profiles, "
                . "{$recordProfileMismatch} production records point to missing or non-employee People profiles, "
                . "{$loginRoleMismatch} production records reference a management login as the employee, "
                . "and {$managerCreators} records name an employee login as the manager who entered them. "
                . 'Resolve these references before retrying.'
            );
        }

        if ($hasLoginId) {
            if ($hasAccounts) {
                $database->execute('UPDATE manager_production_logs ml
                    JOIN employee_accounts ea ON ea.user_id = ml.employee_user_id
                    SET ml.employee_person_id = ea.person_id
                    WHERE ml.employee_user_id IS NOT NULL AND ml.employee_person_id IS NULL');
            }
            if ($database->foreignKeyExists('manager_production_logs', 'fk_manager_production_logs_employee')) {
                $database->execute('ALTER TABLE `manager_production_logs` DROP FOREIGN KEY `fk_manager_production_logs_employee`');
            }
            if ($database->indexExists('manager_production_logs', 'idx_manager_production_logs_employee_date')) {
                $database->execute('ALTER TABLE `manager_production_logs` DROP INDEX `idx_manager_production_logs_employee_date`');
            }
            $database->execute('ALTER TABLE `manager_production_logs` DROP COLUMN `employee_user_id`');
        }

        if ($hasAccounts) {
            $database->execute('DROP TABLE IF EXISTS `employee_accounts`');
        }
        $database->execute("DELETE FROM users WHERE role = 'employee'");
    },
];
