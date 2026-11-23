-- Run only after the preflight queries show no unmapped/conflicting records
-- and the manager production baseline has been saved.
-- This script removes employee login credentials, not People employee profiles
-- or manager-entered production history.

UPDATE manager_production_logs ml
JOIN employee_accounts ea ON ea.user_id = ml.employee_user_id
SET ml.employee_person_id = ea.person_id
WHERE ml.employee_user_id IS NOT NULL
  AND ml.employee_person_id IS NULL;

ALTER TABLE manager_production_logs
    DROP FOREIGN KEY fk_manager_production_logs_employee,
    DROP INDEX idx_manager_production_logs_employee_date,
    DROP COLUMN employee_user_id;

DROP TABLE employee_accounts;

-- sessions.user_id uses ON DELETE CASCADE, so employee sessions are removed too.
DELETE FROM users WHERE role = 'employee';

INSERT IGNORE INTO schema_migrations (migration_id, applied_at)
VALUES ('2026-11-23-remove-employee-login-system', UTC_TIMESTAMP());

-- Confirm the employee login storage is gone and manager data is unchanged.
SELECT table_name
FROM information_schema.tables
WHERE table_schema = DATABASE()
  AND table_name = 'employee_accounts';

SELECT column_name
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND table_name = 'manager_production_logs'
  AND column_name = 'employee_user_id';

SELECT COUNT(*) AS employee_login_accounts
FROM users
WHERE role = 'employee';

SELECT COUNT(*) AS manager_log_rows,
       COALESCE(SUM(quantity), 0) AS manager_log_quantity,
       COALESCE(SUM(total_weight_grams), 0) AS manager_log_weight_grams
FROM manager_production_logs;

SELECT COUNT(*) AS employee_people_profiles
FROM people
WHERE category = 'EMPLOYEE';

SELECT migration_id, applied_at
FROM schema_migrations
WHERE migration_id = '2026-11-23-remove-employee-login-system';
