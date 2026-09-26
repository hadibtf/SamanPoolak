# EMPLOYEE-TODO.md

## Agent Instructions

This file is the execution tracker for the employee production/task/statistics feature.

- Work through the TODOs in order unless a dependency clearly requires otherwise.
- Keep this file updated while implementing.
- Change `- [ ]` to `- [x]` only when the TODO and all of its acceptance criteria are complete.
- If a TODO is only partially complete, leave it unchecked and add a short progress note beneath it.
- Reuse the existing platform architecture, authentication, calendar, order models, UI components, and business logic wherever possible.
- Do not mark a TODO complete just because the UI exists; the full data flow, validation, permissions, and relevant tests must work.

---

## Progress

- [x] EMERGENCY — Separate employee application at employee.samanpoolak.ir
- [x] TODO 1 — Inspect existing architecture and define the production domain
- [x] TODO 2 — Implement production task assignment from existing orders
- [x] TODO 3 — Build the employee task and production logging workflow
- [x] TODO 4 — Build employee monthly production statistics and daily drill-down
- [ ] TODO 5 — Build management statistics for individual and all employees
- [ ] TODO 6 — Harden, test, and verify the complete workflow

---

## EMERGENCY — Separate Employee Application at employee.samanpoolak.ir

- [x] Build and deploy a distinct employee web application to `employee.samanpoolak.ir`.
- [x] Make the employee build render only employee login/tasks routes; it must not include or route to management screens.
- [x] Make the manager platform reject employee logins with a clear link to the employee site.
- [x] Make the employee site reject admin/general-user logins with a clear link to the manager platform.
- [x] Add dedicated automatic/manual deploy commands and configurable `FTP_EMPLOYEE_DIR`.
- [x] Document the one-time cPanel subdomain setup and API CORS allowlist addition.

### Acceptance Criteria

- Employees use only `https://employee.samanpoolak.ir`.
- Managers use only `https://platform.samanpoolak.ir`.
- The server continues enforcing employee-only API access regardless of URL.
- Each subdomain deploys independently.

Status: the employee application is live at `employee.samanpoolak.ir`, deploys
independently, and the API accepts only its configured employee-app origin for
employee-surface login.

---

## TODO 1 — Inspect Existing Architecture and Define the Production Domain

- [x] Inspect the current authentication and authorization system.
- [x] Identify employee/user roles and how impact press operators should be represented.
- [x] Inspect the current submitted-order, order-item, and product models.
- [x] Locate the existing order-detail UI.
- [x] Locate and understand the existing 10-piece weight calculation.
- [x] Locate the current Jalali/Persian calendar and date utilities.
- [x] Inspect the existing bottom navigation and employee navigation.
- [x] Inspect the existing shadcn/Recharts setup and reusable chart components.
- [x] Define the minimum required `ProductionTask` and `ProductionLog` relationships without duplicating existing order data.
- [x] Create required schema/database migrations using existing project conventions.

Implementation notes: the production-domain contract is documented in
[`EMPLOYEE-PRODUCTION-DOMAIN.md`](EMPLOYEE-PRODUCTION-DOMAIN.md). The schema uses the
project’s existing `schema.sql` + manual phpMyAdmin convention; live deployment
will require running the three new `CREATE TABLE` statements after the production
API routes are implemented and deployed. No production endpoints/UI are part of
this TODO.

Architecture correction: the existing app has no submitted-order state, no
employee-specific navigation, and no shadcn/Recharts setup. Employee logins are
provisioned from the existing People employee add/edit flow through the new
one-to-one `employee_accounts` mapping—not as disconnected accounts in Settings.

### Acceptance Criteria

- Existing reusable components/services/models have been identified.
- Production tasks reference existing orders/order items instead of copying unnecessary data.
- Production logs can reference employee, task, order/order item, quantity, production date, and creation timestamp.
- Existing auth, calendar, and order functionality remain unchanged.
- Required migrations apply successfully.

---

## TODO 2 — Implement Production Task Assignment from Existing Orders

- [x] Extend the People add/edit flow for `EMPLOYEE` records to optionally create, edit, disable, and reset that employee’s login. Keep passwords write-only; never return a password hash or plaintext password.
- [x] In one transaction, create/update the `users` row with role `employee` and its one-to-one `employee_accounts` mapping. Do not change existing admin/general-user accounts.
- [x] Add admin-only ability to assign an existing, non-deleted order item to an employee. The current platform has no `submitted` state, so validate the live order and stable `items[].uid` rather than inventing one.
- [x] Store only task relationship data: assigned employee user, order id, item uid, required quantity, Jalali assignment date, assigning user, and task status (`ASSIGNED`, `IN_PROGRESS`, `COMPLETED`).
- [x] Prevent active-task quantities for an order item from exceeding that item’s required quantity; allow deliberate split assignments only when the remaining quantity permits it.
- [x] Add server routes, API client wrappers, Dexie stores/migrations, and sync resources for production tasks. Do not mirror unrestricted production logs to employee devices.
- [x] Return a server-side employee task projection containing only product/part data, marking image/name, production specifications, required quantity, order reference, and expected weight—never customer contacts, prices, costs, invoices, or administration data.
- [x] Reuse `computeWeights()` from `src/db.js` for 10-piece weight display; do not duplicate its formula.
- [x] Preserve traceability from `orders.id + items[].uid -> production_tasks -> employee_accounts/users`.

### Acceptance Criteria

- Creating/editing an employee in People provisions and maintains only that employee’s linked login.
- Management can assign a real existing order item to an employee without relying on a non-existent submitted status.
- The assignment persists in the database.
- An authenticated employee task-list API query returns only that employee’s assignments and the safe task projection.
- The task references the original order/order item.
- No unrelated customer, financial, or administrative information is returned by the employee task API.

---

## TODO 3 — Build Employee Task and Production Logging Workflow

- [x] Add an employee-only `Tasks` section and route; do not expose management navigation or screens to an employee.
- [x] Build a task detail screen optimized for mobile use.
- [x] Show product, marking image/name, required quantity, production specifications, order reference, task status, and expected weight information.
- [x] Allow partial production to be logged multiple times across one or more days.
- [x] Require production to be logged per task/product record rather than as one vague daily total.
- [x] Create production logs only on the server. Derive employee, order, and item references from the authorized task; accept only task id, positive quantity, Jalali production date, and a client submission UUID.
- [x] Validate that the caller has role `employee`, owns the active task, quantity is finite and positive, date is an eight-digit valid Jalali date, and the new total does not exceed task quantity.
- [x] Prevent accidental duplicate submissions with the task/employee/submission-key unique constraint and idempotent conflict response.
- [x] In one transaction, insert the log, derive task progress from `SUM(production_logs.quantity)`, and change state to `IN_PROGRESS` or `COMPLETED` as appropriate.
- [x] Allow a task to remain incomplete when only part of the required quantity has been produced.
- [x] Update the task state appropriately when production begins or reaches the required quantity.
- [x] Extend the management order-detail item panel to show its current and historical production assignments: each assigned employee, assigned quantity, task status, and assigned date.
- [x] Show order-item production progress from production logs: total produced quantity versus the order-item required quantity, without relying on the legacy weight-derived produced quantity.
- [x] Show a per-employee production breakdown for the order item, derived from `SUM(production_logs.quantity)` grouped by employee. Include employees who produced a portion before a later reassignment, so the history is never overwritten.
- [x] In the order-item production detail, show each production-log entry with employee, quantity, Jalali production date, and its exact created-at timestamp; show assignment date/time where available.
- [x] Keep the assignment roster and production breakdown server-authorized for management, and update them after an assignment or production-log save.

### Acceptance Criteria

- Employee can open an assigned task and log production.
- The task view’s expected-weight values match `computeWeights()` used by the existing order view.
- Multiple logs can exist for the same task.
- Partial production across several days works correctly.
- The authenticated employee identity and task-derived order references are used server-side instead of trusting client-supplied IDs.
- Invalid or unauthorized submissions are rejected.
- Every production record remains traceable to employee, task, and original order.
- Management can see, from an order item, who was assigned, total pieces produced, and the historically accurate pieces produced by each employee.

---

## TODO 4 — Build Employee Monthly Production Statistics and Daily Drill-Down

- [x] Add the employee `Statistics` page.
- [x] Add a year selector covering `1405` through `1499`.
- [x] Add a month selector using the platform's existing Jalali/Persian calendar implementation.
- [x] Build a responsive, touch-friendly shared bar-chart component using the existing React/CSS stack. The repository currently has no shadcn/Recharts dependency; do not claim to reuse one.
- [x] Use day-of-month on the X-axis and total produced quantity on the Y-axis.
- [x] Provide employee-authorized aggregation/detail API endpoints calculated from `SUM(production_logs.quantity)` for the authenticated employee. Do not download other employees’ logs to the browser.
- [x] Generate every valid Jalali day for the selected month (including zero-production days) using the existing `react-date-object` calendar utilities.
- [x] Add tooltip information for date and quantity.
- [x] Make every daily bar clickable/tappable.
- [x] On bar selection, show the underlying production records for that date.
- [x] Show product/part, order reference, task, produced quantity, and relevant production information in the daily detail view.
- [x] Add loading, empty, and error states.
- [x] Ensure the page is touch-friendly and usable on phones.

Implementation verified live with the employee account: مهر ۱۴۰۵ monthly total
matched the production-log sum, and selecting ۱۴۰۵/۰۷/۰۴ returned the exact
underlying product, order, task, quantity, status, dimensions, and timestamp.

### Acceptance Criteria

- Employee can select `Year -> Month -> View Statistics`.
- Every day in the selected month is represented correctly.
- The monthly chart is derived only from production logs.
- Clicking a bar shows exactly what was produced that day.
- The sum of daily bars equals the employee's monthly total.
- Historical month/year navigation works from 1405 through 1499.

---

## TODO 5 — Build Management Statistics for Individual and All Employees

- [x] Add an admin-only `Statistics` bottom-navigation tab; retain the current navigation for non-admin users and ensure route protection is server-side as well as UI-side.
- [x] Reuse the same year/month selection mechanism as employee statistics.
- [x] Add an individual employee statistics mode.
- [x] Allow management to select an employee and see their daily production chart.
- [x] Allow management to click a day and inspect that employee's underlying production logs.
- [x] Add an `All Employees` statistics mode.
- [x] Calculate total factory production per day from all employee production logs.
- [x] Show total production per employee for the selected month.
- [x] Provide a readable employee comparison view without overcrowding the chart.
- [x] Reuse shared chart/month-selector/drill-down components where practical, while management API responses remain admin-only.
- [ ] Verify both desktop and mobile layouts in the live management app.

Implementation is deployed. PHP syntax and both production builds pass; the
live manager statistics endpoints reject employee tokens with HTTP 403.
An admin session and visual desktop/mobile check are still needed before this
TODO's acceptance criteria can be marked complete.

### Acceptance Criteria

- Management can inspect any employee's production for a selected month.
- Management can inspect combined factory production for a selected month.
- Management can see totals per employee.
- Daily drill-down exposes the production records behind the statistics.
- All totals are derived from `ProductionLog` data rather than separately maintained statistics.
- The management statistics page is available from bottom navigation.

---

## TODO 6 — Harden, Test, and Verify the Complete Workflow

- [ ] Test the full workflow: `Existing Order Item -> Assign Employee -> Employee Produces -> Production Log -> Statistics`.
- [ ] Verify role-based authorization for admin, employee, and legacy generic-user accounts.
- [ ] Verify employees cannot access or modify another employee's tasks or logs.
- [ ] Verify management-only assignment/statistics actions are protected.
- [ ] Test partial production across multiple days.
- [ ] Test multiple products/tasks logged on the same day.
- [x] Test zero-production days and months with no production (calendar zero-fill regression test).
- [x] Test Jalali month lengths, leap-year boundaries, and supported years `1405–1499` (PHP validator and shared calendar regression tests).
- [ ] Test production aggregation queries.
- [ ] Test duplicate-submission idempotency using identical submission UUIDs and legitimate repeated partial logs using distinct UUIDs.
- [ ] Test quantity validation and transaction behavior (validation unit-tested; concurrent database transaction test still needed).
- [x] Verify the reused 10-piece weight calculation matches the existing order view (both call `computeWeights()` from `src/db.js`).
- [ ] Verify responsive behavior on desktop and mobile.
- [x] Add/update automated tests following the project's existing testing conventions (Jest and PHP CLI validation tests).
- [x] Remove mock data, temporary code, duplicate logic, and dead code introduced during implementation (unused employee-sync hook removed).
- [x] Run available linting, tests, and production build (`CI=true` CRA build/lint, Jest, PHP lint; no TypeScript/typecheck script exists).
- [x] Update this file so all completed TODOs use `- [x]`.

Hardening changes: assignment and log writes lock their parent rows before checking
remaining quantity; a repeated submission key with the same content returns its
original log, while a changed payload is rejected. The server now rejects invalid
Jalali dates and quantities that MySQL would round. Employee daily details retain
historical logs even if an order item was subsequently removed. The remaining
unchecked items require an admin session, a second employee account, controlled
live writes/concurrency tests, and desktop/mobile UI acceptance; do not infer
those checks from unit tests alone.

### Final Acceptance Criteria

- Employees can log production against assigned real orders.
- Production remains historically traceable.
- Employee statistics work by Jalali year/month and daily drill-down.
- Management can view individual and combined employee statistics.
- Statistics are derived from production logs as the single source of truth.
- Existing order, authentication, calendar, and platform functionality still work.
- Relevant automated tests, linting, type checks, and production build pass.
