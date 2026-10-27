# Remove Dexie — full change plan

## Decision

Move every browser data read/write to the existing authenticated PHP API. The
request path will be:

```text
React screen → src/api/client.js → PHP API → MySQL/MariaDB
```

The browser must not connect to MySQL directly. Keep fetched results only in
React memory; do not replace Dexie with another persistent browser database or
a second background sync system. The API/server remains authoritative. Existing
`ManagementStatistics` and employee production screens already use this model.

## Scope and behavior

- Remove Dexie/IndexedDB, `dexie-react-hooks`, `useLiveQuery`, mirror sync,
  mirror cursors, and local mirror writes.
- Preserve API-backed create/update/delete behavior and server authorization.
- Read on screen entry; after a mutation, use the canonical API response to
  update the current React state or refetch the affected query.
- Refresh on navigation/focus where other users' changes need to appear. Add
  polling only to screens that need it; do not poll every resource globally.
- Show explicit loading, empty, and error states. A failed/offline request must
  not silently fall back to a local write. Offline viewing after reload will no
  longer be supported.
- Keep the remote database, its data, and normal CRUD/statistics API routes.
  Review `updatedAfter` delta support separately; keep it if another client uses
  it.

## Execution stages

### 1. Audit API coverage and local-only data

- Confirm the existing list/detail/write APIs for people, orders, markings,
  expenses, issue notes, attendance, and holidays. Add a server endpoint only
  where the UI lacks a suitable API read.
- Check list sizes. For growing lists, add server-side filters/pagination and
  return only the fields that screen needs instead of downloading the entire
  table. Keep SQL behind PHP with authorization and prepared statements.
- Before clearing browser stores, determine whether `attendanceScans`,
  `attendanceEmployees`, `personCards`, `counters`, or negative-ID rows in
  `attendance` contain data that exists only on a user's device. Export or
  migrate required values; explicitly retire unused values.
- Record current cross-device freshness expectations. Dexie's engine currently
  pulls about every 15 seconds; replace that with on-entry/on-focus refresh or
  narrowly scoped polling where required.

### 2. Separate pure domain helpers from storage

- Extract still-used pure helpers from `src/db.js` into storage-neutral modules:
  `jalaliDateKey`, `deriveOrderStatus`, `computeWeights`, and `newUid`.
- Confirm whether `generateId`, `generateOrderNumber`, and `addMarking` have any
  active call sites. Remove dead helpers; route any needed behavior through the
  server rather than rebuilding it over local records.
- Keep order IDs, order numbers, item UIDs, and server-owned fields canonical
  from the API response.

### 3. Migrate screens to API reads and React memory

Use `src/api/client.js` for every request so bearer auth and `ApiError` handling
stay consistent. Each screen should own or receive ordinary React state; handle
request cancellation/late responses when filters or routes change.

- `src/pages/People.jsx` — load with `peopleApi.list()`; after deletion, update
  the list only after the server confirms success.
- `src/components/PersonFormSheet.jsx` — use the current people list or fetch it
  from `peopleApi.list()` for duplicate checks; remove the mirror upsert after
  server create/update.
- `src/pages/SubmitOrder.jsx` — load edit data with `ordersApi.get()` and
  customer candidates with `peopleApi.list()`; remove all Dexie reads/writes.
- `src/pages/OrderList.jsx` — load orders and people from their APIs; preserve
  filtering/sorting in memory initially, and add server pagination if list size
  warrants it. Keep the server delete as the only delete.
- `src/pages/OrderView.jsx` — load the order with `ordersApi.get()`, customer
  with `peopleApi.get()` where needed, and markings from `markingsApi.list()`;
  update view state from API responses after edits/deletes.
- `src/components/MarkingsManager.jsx` — load markings from the API and update
  local component state after server create/delete.
- `src/pages/Expenses.jsx` — load with `expensesApi.list()`; replace local mirror
  mutations with state updates from successful responses.
- `src/pages/IssueNotes.jsx` — load with `issueNotesApi.list()` and remove the
  local delete mirror update.
- `src/pages/HumanResources.jsx` — load employees and attendance through their
  APIs; preserve payroll calculations and date filtering.
- `src/pages/PayrollAttendance.jsx` — load people/attendance through APIs and
  keep import/manual scan edits server-backed. Remove silent local fallback and
  show a clear failure when the API is unavailable.
- `src/pages/SettingsInfo.jsx` — replace “full sync”/cursor-reset behavior with
  direct refresh of the affected data. Refresh holiday state from the API after
  calendar import.
- `src/pages/EmployeeTasks.jsx` — change the `computeWeights` import after that
  pure helper moves; production reads already use the API.

For API-backed mutations, prefer server-first writes and the returned canonical
row. Do not report success or persist an offline change when the request fails.

### 4. Retire the mirror engine

- Remove `useSyncEngine()` from `src/App.jsx` after no screen needs it.
- Delete `src/hooks/useSyncEngine.js` and `src/syncBus.js` after removing their
  imports/callers.
- Remove per-resource cursor keys and `signit_mirror_revision` handling from
  `src/hooks/useSyncEngine.js` and `src/pages/SettingsInfo.jsx`.
- Refactor `src/holidays.js`: it may keep its lightweight `localStorage`
  calendar cache, but its data must come from a direct holiday API response,
  not `db.holidays`. Do not clear its `ir_holidays_*` keys as part of Dexie
  cleanup. Keep theme/currency preferences in localStorage too.
- Review optional `updatedAfter` parameters in `src/api/client.js` and matching
  server list routes. Remove delta-only code only after confirming no other app
  or deployed client consumes it; normal API list/detail routes remain.

### 5. Delete Dexie and clean browser data

- Once all imports and helper use are gone, delete `src/db.js` and remove
  `dexie`/`dexie-react-hooks` from `package.json` with npm so
  `package-lock.json` is updated consistently.
- Ship a one-time cleanup for IndexedDB database `BusinessPlatformDB` after the
  local-only data decision in Stage 1. Handle open tabs blocking deletion and
  retry after reload. Remove only Dexie sync cursor/revision localStorage keys;
  do not wipe unrelated localStorage.
- Rebuild `build/` and `dist/` outputs from source. Do not hand-edit generated
  bundles or `node_modules/`.

### 6. Docs, tests, and release checks

- Update architecture and setup guidance so it no longer promises Dexie-backed
  instant/offline reads or says new features should add stores to Dexie.
- Adapt the `useLiveQuery` mock in `src/pages/Expenses.test.jsx`; search all
  tests for Dexie, `db`, and sync-cursor mocks.
- Verify API loading/errors, mutations, deleted rows, attendance import/manual
  edits, calendar import, backup/restore, and cross-device refresh behavior.
- Build both management and employee surfaces. Confirm no Dexie imports,
  `db` access, `useLiveQuery`, `useSyncEngine`, or sync-bus references remain.
  During rollout, allow only a narrowly scoped one-time `BusinessPlatformDB`
  deletion shim; remove that shim after the cleanup release has reached users.

## Complete file and directory inventory

### Source files to read and migrate

| Path | Dexie/sync responsibility |
| --- | --- |
| `src/db.js` | Dexie v1–v10 schema, stores, and mixed domain/storage helpers; delete last after extraction. |
| `src/hooks/useSyncEngine.js` | Delta pull, mirror writes/deletes, 15-second timer, browser sync cursors, holiday bridge. |
| `src/syncBus.js` | Requests immediate mirror sync after settings/attendance operations. |
| `src/App.jsx` | Starts sync engine in the authenticated management shell. |
| `src/api/client.js` | Keep API client and CRUD; review optional `updatedAfter` arguments. |
| `src/holidays.js` | Keep calendar logic/localStorage only if useful; replace Dexie-fed rows with API data. |
| `src/pages/People.jsx` | People list and mirror deletion. |
| `src/components/PersonFormSheet.jsx` | Local duplicate-search dataset and post-save mirror update. |
| `src/pages/SubmitOrder.jsx` | Local edit-order/customer reads and order mirror update. |
| `src/pages/OrderList.jsx` | Local order/people lists and delete mirror. |
| `src/pages/OrderView.jsx` | Local order/customer/marking reads and mirror updates. |
| `src/components/MarkingsManager.jsx` | Local marking list and mirror mutations. |
| `src/pages/Expenses.jsx` | Local list and mirror mutations. |
| `src/pages/IssueNotes.jsx` | Local note list and delete mirror. |
| `src/pages/HumanResources.jsx` | Local employee/attendance reads. |
| `src/pages/PayrollAttendance.jsx` | Local attendance reads, import/manual editing, offline fallback. |
| `src/pages/SettingsInfo.jsx` | Cursor clearing and sync-triggered restore/calendar refresh. |
| `src/pages/EmployeeTasks.jsx` | Imports the pure `computeWeights` helper from `src/db.js`. |
| `src/pages/Expenses.test.jsx` | Mocks `dexie-react-hooks`; adapt to API-backed state. |

### API, docs, dependencies, and generated data to review

- `server/routes/people.php`, `orders.php`, `markings.php`, `expenses.php`,
  `issue_notes.php`, `attendance.php`, `holidays.php` — retain server data and
  normal API behavior; review delta filters for compatibility, not blanket
  deletion.
- `server/DOC.md` — describes `updatedAfter` API behavior; update only if those
  endpoints change.
- `README.md`, `DOC.md`, `MASTERCONTEXT.md` — remove Dexie architecture, sync
  instructions, and local-mirror promises.
- `package.json`, `package-lock.json` — remove Dexie packages via npm.
- `node_modules/` — npm-managed; never edit manually.
- `build/`, `dist/` — ignored generated outputs; rebuild after source migration.
- Browser IndexedDB `BusinessPlatformDB` — per browser/profile, not a repository
  directory; clear after local-only data is handled and API reads are live.
- Browser localStorage — remove obsolete `signit_*_synced_at` and
  `signit_mirror_revision`; preserve `ir_holidays_*`, theme, currency, and auth
  data unless separately changed.

`src/productionStatistics.js`, `src/pages/ManagementStatistics.jsx`,
`src/pages/EmployeeStatistics.jsx`, and `src/pages/EmployeeTasks.jsx` show the
existing API-plus-React-state pattern. `todo-obsolete-do-not-read-or-implement/`
is explicitly out of scope per repository instructions.

## Safety boundary

Dexie contains both refetchable mirrors and potentially device-only data. A
successful migration may delete cached server rows, but must not delete or alter
remote MySQL records. Do not clear `BusinessPlatformDB` until required local-only
attendance/card data has been exported, migrated to the API, or explicitly
declared disposable. Do not clear unrelated localStorage.
