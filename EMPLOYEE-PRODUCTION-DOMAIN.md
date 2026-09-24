# Production domain

This document records the production feature boundary agreed during TODO 1.

## Identity and authorization

- `admin` remains the management role and is the only role allowed to assign
  production tasks, inspect factory-wide production, or inspect another
  employee's records.
- `employee` is the authenticated login role for an impact-press operator.
  Existing `user` accounts remain valid and unchanged.
- An employee login belongs to exactly one existing `people` row with
  `category = EMPLOYEE`, via the one-to-one `employee_accounts` mapping.
  Existing management/general accounts remain untouched.
- The People add/edit flow is the single place to provision and maintain an
  employee login: creating an employee may create their username/password, and
  editing that employee may change their display name, username, password, or
  disable their login. A password is never returned to the client after save.
- Production ownership and authorization use the authenticated `users.id`,
  while management can display the linked employee People record for a name.

## Source-of-truth relationships

```text
orders.id + orders.items[].uid
          │
          └── production_tasks (assigned employee, required quantity, status)
                         │
                         └── production_logs (one partial-production entry)
```

- An order item remains inside the existing `orders.items` JSON and is located
  by its stable client-generated `uid`; no product, marking, customer, price,
  or specification snapshot is copied into a task.
- `production_tasks.order_id` and `order_item_uid` identify that source item.
  A task may be split across employees, so this pair is intentionally not
  unique.
- `production_logs` carries task, employee, order, and item identifiers for
  direct audit and aggregation. The server must derive those identifiers from
  the authorized task when creating a log; the client must never choose them.
- `required_quantity` and `quantity` are decimal quantities to preserve the
  existing order quantity semantics. Task progress is always
  `SUM(production_logs.quantity)`; it is never stored separately.

## Existing reusable platform pieces

- Authentication and authorization: `server/lib/auth.php`; bearer sessions and
  `require_admin()` already protect management actions.
- Orders: `server/routes/orders.php`, mirrored in `db.orders`; detail UI is
  `src/pages/OrderView.jsx` and item identity is `items[].uid`.
- Weight logic: `computeWeights()` in `src/db.js`; 10-piece grams ÷ 10 yields
  unit grams, then unit grams × required quantity yields expected total weight.
- Jalali dates: `JalaliDatePicker`, `jalaliDateKey()` and `react-date-object`.
  Production dates use the established sortable `YYYYMMDD` format.
- Navigation: the only current bottom navigation is `src/components/BottomNav.jsx`.
  There is no employee-specific navigation yet.
- Charts: the project has no shadcn or Recharts dependency/component today.

## Schema rules for later TODOs

- Task statuses are `ASSIGNED`, `IN_PROGRESS`, and `COMPLETED`.
- Tasks and logs use UTC `created_at`/`updated_at` audit timestamps, following
  every other server resource.
- A required client submission key is unique per task/employee, allowing the
  server to reject a retry/double-tap without suppressing legitimate partial
  logs.
- The API must reject production entries with non-positive quantities, tasks
  belonging to another employee, logs beyond the remaining task quantity, and
  malformed Jalali dates. Task status changes and log insertion must occur in
  one database transaction.

## Required database migration

`employee_accounts`, `production_tasks`, and `production_logs` are new tables
using the project's established `CREATE TABLE IF NOT EXISTS` convention. No
existing `users` or `people` columns change, so existing logins and HR/payroll
records are unaffected.
