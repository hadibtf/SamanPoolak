# Production domain

This document describes the shipped employee production workflow, accepted by
the owner on 2026-09-26. `/todo/` is unrelated to this scope.

## Identity and authorization

- `admin` remains the management role and is the only role allowed to assign
  production tasks or inspect factory-wide statistics. Order-item production
  summaries are management-authorized, including existing general-user accounts.
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
  `SUM(production_logs.quantity)` over rows with `deleted_at IS NULL`; it is never
  stored separately. Weight-based new logs estimate whole pieces by rounding.

## Existing reusable platform pieces

- Authentication and authorization: `server/lib/auth.php`; bearer sessions and
  `require_admin()` already protect management actions.
- Orders: `server/routes/orders.php`, mirrored in `db.orders`; detail UI is
  `src/pages/OrderView.jsx` and item identity is `items[].uid`.
- Weight logic: `computeWeights()` in `src/db.js`; 10-piece grams ÷ 10 yields
  unit grams, then unit grams × required quantity yields expected total weight.
- Jalali dates: `JalaliDatePicker`, `jalaliDateKey()` and `react-date-object`.
  Production dates use the established sortable `YYYYMMDD` format.
- Navigation: management and the separate employee app share the floating-nav
  visual style; employee navigation contains production list, statistics, and logout.
- Charts: the project has no shadcn or Recharts dependency/component today.

## Logging, corrections, and assignment rules

- Save `weight_of_10_grams` once per task, in grams, before logging. Unit grams =
  measured grams / 10. Expected kg = required pieces × unit grams / 1000;
  estimated remaining kg uses remaining pieces in the same formula.
- Each log accepts `weightKg`, `productionDate`, and a submission UUID. The API
  stores actual `total_weight_grams` and derives quantity as
  `round(weightKg * 1000 * 10 / weightOf10Grams)`. The UI previews the piece count.
- Employees may edit weight/date or soft-delete their own log; bulk clearing is
  limited to their selected task/item. Clearing retains the 10-piece measurement.
  Deleted rows remain in the database; there is no restore UI. Editing does not
  retain a separate revision history.
- Every summary, chart, and progress query excludes soft-deleted logs. Mutation
  transactions recompute status and remaining capacity while holding parent locks.
- Managers may edit assigned quantities, never below produced pieces. An explicit
  split confirmation transfers the capacity deficit from a selected earlier
  assignment's unproduced allocation; historical logs remain attributed to their author.
- Valid past Jalali dates are supported, within 1405–1499. Pass a Jalali DateObject
  to the shared picker and serialize numeric fields to ASCII `YYYYMMDD`.
- Use «لیست تولید» and a single-open accordion. Weight placeholders are
  `۰.۰ گرم` / `۰.۰ کیلوگرم`. Charts show quantity-only tooltips and ungrouped years.

- Task statuses are `ASSIGNED`, `IN_PROGRESS`, and `COMPLETED`.
- Tasks and logs use UTC `created_at`/`updated_at` audit timestamps, following
  every other server resource.
- A required client submission key is unique per task/employee, allowing the
  server to return the original log for identical retries. Changed content or
  reuse of a deleted log's key returns a conflict; distinct UUIDs allow partial logs.
- The API must reject production entries with non-positive quantities, tasks
  belonging to another employee, logs beyond the remaining task quantity, and
  malformed Jalali dates. Task status changes and log insertion must occur in
  one database transaction.

## Required database migration

`employee_accounts`, `production_tasks`, and `production_logs` are new tables
using the project's established `CREATE TABLE IF NOT EXISTS` convention. No
existing `users` or `people` columns change, so existing logins and HR/payroll
records are unaffected.

Existing installations also require these migrations before dependent API code:

- `server/migrations/2026-09-26-production-weight.sql`
- `server/migrations/2026-09-26-production-log-edit-delete.sql`

The owner confirmed both applied live. Fresh installs use `server/schema.sql`.
Legacy logs with zero stored weight have unknown measured weight; do not invent
a backfill. See `EMPLOYEE-TODO.md` for release acceptance and test coverage limits.
