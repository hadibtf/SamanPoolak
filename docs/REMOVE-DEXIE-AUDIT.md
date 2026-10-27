# Direct API migration audit

## Coverage and compatibility

People and orders have authenticated list/detail/create/update/delete handlers.
Markings, expenses, issue notes and attendance have suitable list and mutation
handlers; holidays have list/import handlers. Existing authorization remains in
PHP and all business requests use `src/api/client.js`. No SQL credentials or
direct MySQL access are added to the browser.

Attendance was the unbounded historical read. The management header now uses
`GET /attendance?countOnly=1`; payroll and attendance detail use `cardNo`, `from`
and `to` filters with prepared SQL. Markings use `customerId` filtering. People
are loaded for duplicate checks and candidate selection. Order/expense/note
lists retain existing in-memory sorting/filtering as allowed by the migration
plan. Production row counts were not accessed; measure these lists during
rollout before choosing pagination thresholds and changing filter semantics.

Optional `updatedAfter` parameters and server delta behavior are retained. The
repository cannot establish that every older deployed client has been retired.
New clients do not store cursors or use delta synchronization.

## Local data disposition

The retired schema allowed `attendanceScans`, `attendanceEmployees`, `personCards`
and negative-ID `attendance` rows to exist only on a device. It is impossible to
inspect all users' browser profiles from the repository. The one-release native
IndexedDB shim checks each profile at runtime and preserves these stores until
the user downloads a full JSON snapshot and acknowledges saving it. It checks
the protected values again before deletion; changed values require a new export.
The backup includes all stores under `stores`, so legacy field values and old
mirror records remain available for review. It is **not** an admin server-backup
file and must not be uploaded to database restore.

Retain the export for manual recovery: scan rows can be reviewed and imported
through the attendance API/UI, manual rows through the single-scan API, and card
links reconciled with server people.cardNo. Employee fallback names are retained
in the export for that reconciliation. No automatic reconciliation overwrites
server attendance or people. The export is the chosen preservation path, not an
automatic migration of potentially conflicting device values.

`counters` only served dead client ID/order-number generators and is explicitly
retired. `generateId`, `generateOrderNumber`, `addMarking`, customer-marking
storage helpers and person-card storage helpers had no active callers.
Date/status/weight/item-UID helpers moved to `src/domain.js` unchanged.

Profiles containing only refetchable mirrors and obsolete counters can delete
`BusinessPlatformDB` automatically. Inspection errors preserve the database.
Blocked deletion asks the user to close old tabs and reload/retry. Only the seven
known `signit_*_synced_at` keys and `signit_mirror_revision` are retired. Calendar,
theme, currency and auth preferences remain. The shim performs no record writes
and is not a replacement storage layer. Remove it after this release reaches
existing profiles and protected exports have been handled.

## Freshness and failure behavior

Previously the management mirror polled all resources about every 15 seconds.
Now mounted screen queries read on entry, focus, visibility return and reconnect;
navigation mounts the affected query again. Canonical writes update component
state or refetch their query. Active order-item production summaries retain their
existing scoped 15-second polling. There is no global resource polling.

API failures display loading/error/retry states; no attendance operation falls
back to local writes. Reloading offline cannot display saved business records.
Holiday imports immediately fetch canonical holiday rows. Backup/restore stays
server-backed; restore reloads the application without cursor reset or mirror
rebuild. Holiday localStorage caching is populated only by holiday API responses.

## Verification scope

Automated checks cover query races, canonical writes, focus refresh, error/retry,
deleted rows, cleanup preservation/key scope/blocked deletion, attendance write
failures, and existing RTL/dialog behavior. Run `npm test`, both surface builds,
PHP lint, and PHP validation tests before release.

No production database, live browser profiles, backup/restore data, or remote
records were modified during implementation. Real cross-device accounts,
device-specific exports and production calendar/backup imports still require
rollout verification. Builds generate `dist/platform` and `dist/employee`; the
obsolete `build` directory is regenerated from the platform build for parity.

The unrelated existing `migrations_validation.php` check currently fails because
its expected migration IDs stop at 2026-10-06, while the repository also contains
the 2026-10-10 and 2026-10-24 migrations. These migration files and the test were
unchanged by this task. Resource-read and production validation pass.
