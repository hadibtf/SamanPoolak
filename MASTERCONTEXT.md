# MASTERCONTEXT — AI agent project reference

Canonical agent orientation for **سامان پولک (Saman Poolak)**. Consolidated from
the former agent guides and the retained frontend/deployment guides. Updated
2026-09-26. Read the operating rules first, then use the topic index.

Use stable addresses such as `MASTERCONTEXT.md#employee-production` in handoffs.
Keep these anchors stable when reorganizing this file. Verify implementation
details against source before changing behavior; release acceptance does not
imply exhaustive test coverage.

## Topic index

| Address | Contents |
| --- | --- |
| [operating-rules](#operating-rules) | Scope, Git, builds, deployment constraints |
| [project-map](#project-map) | Product, domains, folders, source entry points |
| [architecture](#architecture) | App surfaces, auth, API, mirror, state |
| [domain-rules](#domain-rules) | Money, dates, IDs, orders, weights |
| [employee-production](#employee-production) | Isolation, assignments, logging, corrections, charts |
| [ui-and-pdf](#ui-and-pdf) | Styling, calendar, RTL, exports |
| [deployment](#deployment) | Commands, configuration, migrations, host setup |
| [verification](#verification) | Tests, feature implementation checklist, release status |
| [troubleshooting](#troubleshooting) | Known failures and remedies |
| [reference-documents](#reference-documents) | Retained detailed documentation |

<a id="operating-rules"></a>
## Operating rules

- `/todo/` is unrelated to employee work. Do not use it to infer employee
  requirements or expand that scope.
- Preserve the user's existing changes. Inspect Git status before editing.
- Work on `main` by owner preference. Git identity is
  `Hadi Bastanfar <98bastanfar@gmail.com>`. Use an accurate agent coauthor trailer
  (for Codex: `Co-Authored-By: Codex <codex@openai.com>`). Push only when asked.
- Deploy locally: the host blocks FTP from GitHub runners. The existing GitHub
  deployment workflow is not the working delivery path.
- Deploy commands default to automatic upload; `:manual` produces ZIP packages.
- Apply required live database changes before dependent API deployment.
  Uploading schema files does not migrate an existing database.
- Run production builds with `CI=true`; lint warnings, including unused imports,
  fail those builds. Platform and employee builds share `build/`; run sequentially.
- Keep passwords/tokens out of docs and commits. `deploy.env` and server
  `config.php` hold private configuration and must remain gitignored.

<a id="project-map"></a>
## Project map

Persian/RTL business software for a metal stamping/plating workshop: payroll,
attendance, people/customers, customer markings, multi-item orders, invoices,
expenses, employee production, statistics, and administrative settings. The
landing and careers sites are separate static surfaces.

| Surface | Host | Host directory under `/home/hadibt` |
| --- | --- | --- |
| Management | `platform.samanpoolak.ir` | `platform/` |
| Employee | `employee.samanpoolak.ir` | `employee/` |
| PHP API | `api.samanpoolak.ir` | `api/` |
| Landing | `samanpoolak.ir` | `samanpoolak.ir/` |
| Careers | `jobs.samanpoolak.ir` | `jobs/` |

These management host details are internal agent context: never expose the
management URL in employee-facing UI, links, or bundles. Other projects on the
same hosting account are outside this app's deployment targets.

| Source | Responsibility |
| --- | --- |
| `src/index.js` | Build-time surface selection and mounting |
| `src/App.js` | Management routes, login gate, sync bootstrap |
| `src/auth/AuthContext.jsx` | User/session, login/logout, token validation |
| `src/api/client.js` | Fetch wrapper, bearer token, per-resource API helpers |
| `src/db.js` | Dexie v10 schema/migrations and domain helpers |
| `src/hooks/useSyncEngine.js` | Management delta synchronization |
| `src/context/SettingsContext.jsx` | Theme, currency, formatting |
| `src/constants.js` | Enums and Persian labels |
| `src/pages/`, `src/components/` | Screens and shared UI |
| `src/utils/image.js` | Image compression before upload |
| `server/index.php` | CORS, route table, authentication and employee allowlist |
| `server/lib/` | Configuration, PDO, HTTP and auth helpers |
| `server/routes/production.php` | Assignments, logs, corrections, statistics |
| `server/routes/` | Other resource handlers, backup/restore |
| `server/schema.sql`, `server/migrations/` | Fresh schema and existing-DB migrations |
| `server/tests/` | PHP validation checks |
| `scripts/deploy.mjs` | Local automatic/manual deployment |
| `landing/`, `jobs/` | Standalone static sites |

<a id="architecture"></a>
## Architecture and data flow

React 19 / Create React App clients call a vanilla PHP 8 + PDO + MySQL/MariaDB
API. Production PHP is 8.1+. The server is the single source of truth.

Management resources generally use a Dexie IndexedDB read mirror and
`useLiveQuery`. The sync engine pulls deltas about every 15 seconds and on
focus/reconnect, with per-resource cursors in localStorage. Initial sync fills
the mirror; later pulls upsert changes and remove soft-deleted rows. Writes call
the API first, then mirror the returned canonical row:

```js
const { order } = await ordersApi.update(id, patch);
await db.orders.put(order);
```

Cached reads can work offline; writes require a connection. There is no offline
outbox or Redux data store. Production screens and statistics instead call
`productionApi` directly and keep local React state. Do not introduce unrestricted
employee log mirroring.

`REACT_APP_APP_SURFACE=employee` selects the separate employee app at build time.
Management and employee surfaces have separate routes and role restrictions.
AuthContext validates saved tokens through `/auth/me`; global API 401 responses
clear the session. Login sends `username`, `password`, and `surface`.

API requests use bearer tokens, not cookies, across origins. The fetch wrapper
prefixes `REACT_APP_API_URL`, parses JSON, and throws `ApiError`; status `0`
means a network failure. The server validates roles/ownership independently of
frontend navigation. Employee routes are allowlisted in the front controller.
Both app origins belong in `cors_allowed_origins`; the API answers OPTIONS.
Uploaded images use absolute API URLs so they work across origins.

React conventions: immutable object/array updates, local `useState`, effect
cleanup, providers for auth/settings, and React Router for navigation. Dexie
schema declarations list keys/indexes, not every property on stored objects.

<a id="domain-rules"></a>
## Domain rules

- Money is stored in **Rial**. Settings expose `formatMoney`, `toRial`,
  `fromRial`, and `currencyLabel` for the Rial/Toman display/input preference.
  Invoice exports and salary net-copy values remain Rial.
- Dates are Jalali sortable ASCII `YYYYMMDD` strings; UI is Persian/RTL.
  Audit timestamps are a separate UTC concept. Reuse existing date utilities.
- Order numbers `YYMMN` reset monthly and are server-assigned. Person IDs use
  server-assigned `0-/1-/2-` prefixes. Never generate either client-side.
- Order items live in `orders.items[]` and retain a stable `uid`. Edits must
  preserve each item's state/history/weights. Production references order ID
  plus item UID rather than duplicating financial/customer data.
- Items contain product, quantity, material, thickness, diameter, marking,
  hardening/plating details, description, prices, state/history, and weights.
- Order workflow labels come from `ORDER_STATES`: registered, pressing,
  hardening sent/returned, plating sent/returned, ready. A state change appends
  `{state, date, totalWeight}`; an order is done when all items are READY.
- `computeWeights()` derives unit grams = 10-piece grams / 10 and expected
  weight = unit × quantity. Legacy order weight reconciliation and employee
  log-derived totals are distinct; use active logs for employee production totals.
- Payroll calculation results are not persisted. Keep insured-base insurance,
  non-insured additions/deductions, and Jalali working-day calculations intact.
- Images are compressed before upload; marking records belong to customers.
- Invoice descriptions combine product, applicable hardening/plating,
  dimensions, and description, omitting absent parts.

<a id="employee-production"></a>
## Employee production

### Identity and separation

Provision/reset/disable employee credentials in People add/edit, using the
one-to-one `employee_accounts` mapping between an EMPLOYEE person and user.
Passwords are write-only. Existing admin/general-user accounts stay separate.
Employee login uses the shared login presentation with title
«سامانه آمار تولید کارکنان». Employee UI must reveal no management URL or link.
Role checks, configured login origins, and task/log ownership enforce access.

### Assignment and measurement

Admins assign an existing order item to an employee. Quantity edits cannot fall
below already produced pieces or exceed order capacity. When a new assignment
exceeds free capacity, an explicit confirmation may transfer the deficit from
a selected prior assignment's unproduced quantity. Historical authorship stays intact.

First save the measured weight of **10 pieces in grams**, using a separate
button. Then accept production batch weight in **kilograms**. The API stores
actual `total_weight_grams` and calculates whole pieces:

```text
unitGrams = weightOf10Grams / 10
pieces = round(weightKg * 1000 / unitGrams)
expectedKg = requiredPieces * unitGrams / 1000
remainingKg = remainingPieces * unitGrams / 1000
```

Show estimated pieces per log and estimated remaining weight. Use placeholders
`۰.۰ گرم` / `۰.۰ کیلوگرم`, without «مثلاً». Use «لیست تولید» with a single-open
accordion; employee routes are `/tasks` and `/statistics`.

### Logs, ownership, and statistics

Logs derive employee/order/item references from the authorized task. Valid past
production days remain selectable within supported Jalali years 1405–1499.
Each creation has a submission UUID: identical retry returns its original log;
changed content or reuse of a deleted key conflicts. Separate UUIDs permit
legitimate repeated partial production.

Employees may edit batch weight/date, soft-delete their own log, or clear their
own selected task/item's logs. Never clear other employees' production. Clearing
retains the saved 10-piece weight. Soft-deleted rows remain database-recoverable;
there is no restore UI, and edits have no separate revision history.

All progress and statistics use active logs (`deleted_at IS NULL`). Transactions
lock parent records, enforce remaining capacity, and recalculate ASSIGNED,
IN_PROGRESS, or COMPLETED status. Management order summaries show assignments,
per-employee production, log dates and audit times. Admin statistics support
individual/all employees; employee statistics expose only the caller's records.

Charts include every valid day, zero-fill empty days, and allow daily drill-down.
Tooltips show quantity only; years have no thousands separators. Scale labels
remain visible during horizontal scrolling. `productionBarHeight` uses a 236px
plot within a 260px cell with a 24px label gutter: keep CSS and math aligned.

<a id="ui-and-pdf"></a>
## UI, calendar, and PDF conventions

- Plain CSS imports are bundled globally. Scope component rules, especially
  form/button rules, to avoid restyling shared calendar arrows and day buttons.
- Theme uses `data-theme="dark"` on the root, CSS tokens, and scoped dark rules.
  Explicitly paint native select options' foreground/background; `color-scheme`
  alone caused invisible Firefox/Zen option popups.
- Reuse `JalaliDatePicker` with a Jalali DateObject. Compact `YYYYMMDD` strings
  are storage values, not picker values. Serialize numeric fields to ASCII keys.
- Document direction is RTL; use local LTR for numeric fields/negative amounts.
  Shared employee/management navigation uses the floating bottom-nav appearance.
- PDF: off-screen DOM → html2canvas → jsPDF, contain-fit and centered, plain
  download. Salary slip is A5 landscape; invoice is A4 portrait.
- Keep `.salary-slip` and `.invoice-sheet` light even in dark mode. Avoid ASCII
  parentheses around Persian in PDF nodes: html2canvas mirrors them incorrectly.

<a id="deployment"></a>
## Deployment and database operations

| Command | Target |
| --- | --- |
| `npm run deploy:web` / `npm run deploy:platform` | Management build |
| `npm run deploy:employee` | Employee build |
| `npm run deploy:api` | PHP server |
| `npm run deploy:landing` | Landing site |
| `npm run deploy:jobs` | Careers site |
| `npm run deploy:all` | API + platform + landing + jobs + employee |

Append `:manual` for ZIPs and upload instructions in `deploy-manual/`. Automatic
deployment uses Node and WinSCP FTPS through a persistent connection. Employee
deployment explicitly uploads `.htaccess` through curl afterward; manual employee
packages include it. Platform/landing preserve server-owned `.htaccess`; API
includes its router. Never upload live `server/config.php`.

Private `deploy.env` uses `FTP_SERVER`, `FTP_USER`, `FTP_PASSWORD`, `FTP_WEB_DIR`,
`FTP_API_DIR`, `FTP_LANDING_DIR`, `FTP_JOBS_DIR`, `FTP_EMPLOYEE_DIR`, and `API_URL`;
see `deploy.env.sample`. Optional `WINSCP_PATH` locates WinSCP.com. Host is
`hadibtf.ir`, FTPS port 21, main account `hadibt`; subaccounts are jailed away from
the doc roots. Directory names are short names, not full domain names.

Select `hadibt_business_platform` in phpMyAdmin before running migrations.
`CREATE TABLE IF NOT EXISTS` neither alters existing tables nor runs on deploy.
Apply additive migrations before dependent API code. The owner confirmed both
2026-09-26 production weight and log edit/delete migrations applied live. Do not
rerun ADD COLUMN blindly. Fresh installs use current `server/schema.sql`.
Legacy log weight zero represents unknown measured weight, not a fabricated estimate.

Fresh host sequence: create DB/user and privileges; configure domains and PHP;
upload API; create private config with DB credentials, allowed origins and a
temporary setup key; import schema; enable SSL; seed the first admin through
`/setup/seed-admin`; blank the setup key; deploy both frontends. Seed management
SPA rewrite once from `public/.htaccess`. Exact setup and manual target paths
remain in [DEPLOY.md](DEPLOY.md).

<a id="verification"></a>
## Verification and release status

For a management resource: add schema/route, register the handler, apply live
migration, add API helper, add Dexie version/store and sync resource when using
the mirror pattern, then implement UI and verify cross-device behavior. Direct
production API screens follow their existing local-state pattern instead.

Use checks proportionate to the change:

- PHP lint for changed PHP files and `php server/tests/production_validation.php`.
- Jest: `npm test -- --watch=false --runInBand` with `CI=true`.
- CI-mode platform and employee builds, sequentially; no TypeScript check exists.
- After app deployment, verify assets and deep-route refreshes (`/tasks`,
  `/statistics`), not just root HTTP 200. Test appropriate authorized/denied roles.

Owner accepted the employee release on 2026-09-26 after iterative live testing.
Shipped: separate employee app, assignment edits/splits, gram-first measurement,
kg logs, past-day entry, log corrections/soft-deletion, and both statistics views.
Previously passed: PHP lint/validation, seven chart/calendar Jest tests, both
production builds, live route checks, unauthenticated mutation rejection, and
employee rejection from management statistics. Exhaustive authenticated
admin/second-employee, concurrent-write, and duplicate-retry integration tests
were not independently completed. Do not represent release acceptance as those
tests having run. General offline write queues remain future work.

<a id="troubleshooting"></a>
## Known failures and remedies

| Symptom | Check / remedy |
| --- | --- |
| Employee deep-link refresh 404 | Employee doc-root SPA `.htaccess` upload |
| Build fails with unused variable | CI treats lint warnings as failures |
| Missing table/column API 500 | Apply required SQL in selected live database |
| MySQL #1046 | Select `hadibt_business_platform` first |
| Every authenticated call 401 | API `.htaccess` Authorization passthrough |
| Browser connection/CORS error | API reachability, correct API build URL and allowed origin |
| Invalid PDO parameter number | Native prepares allow each named placeholder only once; use distinct names |
| Calendar arrows look like large submit buttons | Broad inherited/global button CSS |
| Past day cannot be selected | Picker value must be a Jalali DateObject |
| Different large values show equal bar heights | Plot-height calculation includes/clips the label gutter |
| Old UI after deployment | Hard refresh or close/reopen installed PWA |
| WinSCP missing | Install it or set `WINSCP_PATH` |
| CI FTP refused | Use local deployment; host blocks runners |
| PHP server not configured | Create private API `config.php`; verify correct directory |
| Database connection failed | DB credentials and privileges |

`.sh` files must use LF (`.gitattributes`); npm script spawning uses `shell:true`
for Windows npm.cmd. Legacy `signit*` localStorage keys and `signit-api` health
name are internal compatibility identifiers; renaming storage keys logs users out.
User-facing brand remains سامان پولک. Debug details can be enabled temporarily
in server config when diagnosing API failures.

<a id="reference-documents"></a>
## Reference documents and maintenance

- [DOC.md](DOC.md): retained frontend guide, examples, and Android analogies.
- [DEPLOY.md](DEPLOY.md): retained hosting runbook, setup and configuration examples.
- [server/DOC.md](server/DOC.md): endpoint contracts and API conventions.
- [landing/README.md](landing/README.md): landing-site specifics.

The former `AGENTS.md` and `CLAUDE.md` were consolidated here and removed at the
owner's request. Tools that only auto-load those conventional names must be
pointed explicitly at `MASTERCONTEXT.md`. Update this map and the relevant retained
guide together when architecture or deployment behavior changes.
