-- Run this first in phpMyAdmin against the production database.
-- Do not run the apply script until the unmapped, conflicting, and employee-as-manager results are empty.

SELECT DATABASE() AS selected_database;

-- These rows can be backfilled automatically by the apply script.
SELECT COUNT(*) AS production_rows_to_link
FROM manager_production_logs ml
JOIN employee_accounts ea ON ea.user_id = ml.employee_user_id
WHERE ml.employee_user_id IS NOT NULL
  AND ml.employee_person_id IS NULL;

-- Must return zero rows. Resolve each record to a People employee profile first.
SELECT ml.id AS production_log_id, ml.employee_user_id, u.username, u.display_name,
       ml.order_id, ml.order_item_uid, ml.production_date
FROM manager_production_logs ml
LEFT JOIN employee_accounts ea ON ea.user_id = ml.employee_user_id
LEFT JOIN users u ON u.id = ml.employee_user_id
WHERE ml.employee_user_id IS NOT NULL
  AND ml.employee_person_id IS NULL
  AND ea.user_id IS NULL
ORDER BY ml.id;

-- Must return zero rows. Review and correct the People profile mapping before continuing.
SELECT ml.id AS production_log_id, ml.employee_user_id, ea.person_id AS account_person_id,
       ml.employee_person_id AS log_person_id, ml.order_id, ml.order_item_uid
FROM manager_production_logs ml
JOIN employee_accounts ea ON ea.user_id = ml.employee_user_id
WHERE ml.employee_person_id IS NOT NULL
  AND ml.employee_person_id <> ea.person_id
ORDER BY ml.id;

-- Must return zero rows. The employee login ID must not point to a manager account.
SELECT ml.id AS production_log_id, ml.employee_user_id, u.username, u.display_name, u.role
FROM manager_production_logs ml
JOIN users u ON u.id = ml.employee_user_id
WHERE ml.employee_user_id IS NOT NULL
  AND u.role <> 'employee'
ORDER BY ml.id;

-- Must return zero rows. Every account mapping must point to a People employee profile.
SELECT ea.user_id, ea.person_id, p.category, p.deleted_at
FROM employee_accounts ea
LEFT JOIN people p ON p.id = ea.person_id
WHERE p.id IS NULL OR p.category <> 'EMPLOYEE'
ORDER BY ea.user_id;

-- Must return zero rows. Existing production attribution must remain a People employee ID.
SELECT ml.id AS production_log_id, ml.employee_person_id, p.category,
       ml.order_id, ml.order_item_uid
FROM manager_production_logs ml
LEFT JOIN people p ON p.id = ml.employee_person_id
WHERE ml.employee_person_id IS NOT NULL
  AND (p.id IS NULL OR p.category <> 'EMPLOYEE')
ORDER BY ml.id;

-- Must return zero rows. These accounts have a management role and need review.
SELECT ea.person_id, ea.user_id, u.username, u.display_name, u.role
FROM employee_accounts ea
JOIN users u ON u.id = ea.user_id
WHERE u.role <> 'employee'
ORDER BY ea.person_id;

-- Must return zero rows. entered_by identifies the manager who created a record.
SELECT ml.id AS production_log_id, ml.entered_by, u.username, u.display_name
FROM manager_production_logs ml
JOIN users u ON u.id = ml.entered_by
WHERE u.role = 'employee'
ORDER BY ml.id;

-- Save these values and compare after applying the cleanup.
SELECT COUNT(*) AS manager_log_rows,
       COALESCE(SUM(quantity), 0) AS manager_log_quantity,
       COALESCE(SUM(total_weight_grams), 0) AS manager_log_weight_grams
FROM manager_production_logs;

SELECT COUNT(*) AS employee_people_profiles
FROM people
WHERE category = 'EMPLOYEE';

SELECT COUNT(*) AS employee_login_accounts
FROM users
WHERE role = 'employee';
