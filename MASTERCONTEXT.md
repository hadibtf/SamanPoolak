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
| [architecture](#architecture) | App surfaces, auth, API, screen state |
| [domain-rules](#domain-rules) | Money, dates, IDs, orders, weights |
| [employee-production](#employee-production) | Employee login removal; manager production remains |
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
- GitHub Actions in `.github/workflows/verify.yml` runs verification only. Keep
  production deployment local; the host blocks FTP from GitHub runners.
- Deploy commands default to automatic upload; `:manual` produces ZIP packages.
- Apply required live database changes before dependent API deployment.
  Uploading schema files does not migrate an existing database.
- Build the management surface with `npm run build:platform`; output is in
  `dist/platform/`. `npm run build` aliases the platform build.
- Keep passwords/tokens out of docs and commits. `deploy.env` and server
  `config.php` hold private configuration and must remain gitignored.

<a id="project-map"></a>
## Project map

Persian/RTL business software for a metal stamping/plating workshop: payroll,
attendance, people/customers, customer markings, multi-item orders, invoices,
expenses, manager-entered production, statistics, and administrative settings.
Employee People profiles remain for HR and production attribution, with no
employee login accounts or employee-facing site. Landing and careers sites are
separate static surfaces.

| Surface | Host | Host directory under `/home/hadibt` |
| --- | --- | --- |
| Management | `platform.samanpoolak.ir` | `platform/` |
| PHP API | `api.samanpoolak.ir` | `api/` |
| Landing | `samanpoolak.ir` | `samanpoolak.ir/` |
| Careers | `jobs.samanpoolak.ir` | `jobs/` |

Other projects on the same hosting account are outside this app's deployment
targets.

| Source | Responsibility |
| --- | --- |
| `src/index.jsx` | Management app mounting |
| `src/App.jsx` | Management routes, login gate, calendar bootstrap |
| `src/auth/AuthContext.jsx` | User/session, login/logout, token validation |
| `src/api/client.js` | Fetch wrapper, bearer token, per-resource API helpers |
| `src/domain.js` | Pure date, weight and order helpers |
| `src/hooks/useApiQuery.js` | Memory-only screen reads, entry/focus/reconnect refresh |
| `src/context/SettingsContext.jsx` | Theme, currency, formatting |
| `src/constants.js` | Enums and Persian labels |
| `src/pages/`, `src/components/` | Screens and shared UI |
| `src/utils/image.js` | Image compression before upload |
| `server/index.php` | CORS, route table, and authentication |
| `server/lib/` | Configuration, PDO, HTTP and auth helpers |
| `server/routes/production.php` | Assignments, logs, corrections, statistics |
| `server/routes/` | Other resource handlers, backup/restore |
| `server/schema.sql`, `server/migrations/` | Fresh schema and existing-DB migrations |
| `server/tests/` | PHP validation checks |
| `scripts/deploy.mjs` | Local automatic/manual deployment |
| `landing/`, `jobs/` | Standalone static sites |

<a id="architecture"></a>
## Architecture and data flow

React 19 / Vite clients call a vanilla PHP 8 + PDO + MySQL/MariaDB
API. Production PHP is 8.1+. The server is the single source of truth.

All business reads use `src/api/client.js` and ordinary React memory. Screens
fetch on entry and focus/reconnect through `useApiQuery`; filters/routes are
query keys and late responses are ignored. Successful mutations apply the
canonical server row or refetch the affected query. No persistent business-data
cache, offline writes, global polling or sync cursors remain. Order item production
summaries retain their scoped 15-second polling. Offline reload cannot show
business records; request failures must be visible and retryable.

Holiday API responses may populate the lightweight `ir_holidays_*` localStorage
calendar cache. Theme, currency, and auth preferences stay in localStorage.
`src/legacyDataCleanup.js` is a temporary read/export/delete-only migration shim
for `BusinessPlatformDB`. It protects old attendance/card data until a backup is
downloaded and acknowledged, then handles blocked deletion with a retry/reload.
Counters from unused client ID generators are retired. Remove the shim after
this cleanup release reaches existing users; see `docs/REMOVE-DEXIE-AUDIT.md`.

The repository ships one management app. Employee People profiles support HR
and manager-entered production attribution; they have no login accounts or
employee-submitted production access. AuthContext validates saved tokens
through `/auth/me`; global API 401 responses clear the session. Authentication
accepts only `admin` and `user` roles.

API requests use bearer tokens, not cookies, across origins. The fetch wrapper
prefixes `VITE_API_URL`, parses JSON, and throws `ApiError`; status `0`
means a network failure. The server validates roles/ownership independently of
frontend navigation. The management app origin belongs in
`cors_allowed_origins`; the API answers OPTIONS.
Uploaded images use absolute API URLs so they work across origins.

React conventions: immutable object/array updates, local `useState`, effect
cleanup, providers for auth/settings, and React Router for navigation.

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
  hardening/plating details, description, prices, state/history, weights, and the
  manager's `productionStopped` confirmation flag.
- Order workflow labels come from `ORDER_STATES`: registered, pressing,
  production complete, hardening sent/returned, plating sent/returned, ready,
  packaged, and delivered. A state change appends
  `{state, date, totalWeight, note?}`. An order is done when every item has a
  latest delivered state (`DELIVERED_WORKSHOP`, `SENT_FREIGHT`, or
  `DELIVERED_PLATING`).
- `computeWeights()` derives unit grams = 10-piece grams / 10 and expected
  weight = unit × quantity. The order view derives produced quantity and measured
  weight from active production logs; manager log quantities are calculated from
  batch weight when the item's sample weight becomes available.
- Payroll calculation results are not persisted. Keep insured-base insurance,
  non-insured additions/deductions, and Jalali working-day calculations intact.
- Attendance uses a separate configurable Thursday end time. Thursday breakfast
  is always deducted; lunch is deducted from worked time only after a 15:00
  checkout, and enters the expected target only when the configured Thursday
  shift ends after 15:00.
- Images are compressed before upload; marking records belong to customers.
- Invoice descriptions combine product, applicable hardening/plating,
  dimensions, and description, omitting absent parts.

<a id="employee-production"></a>
## Employee production and login removal

There are no employee logins, user accounts, employee production reports, task
assignments, or employee-facing app. Employee records remain in People. Manager
production remains available through `manager_production_logs`, links to People
profiles, and continues to power order totals and management statistics.

Manager production records use the order item's saved 10-piece sample weight to
calculate piece quantity. If that sample is missing, the entry remains pending
until an admin saves the sample. Managers can correct the date, weight, and
employee or soft-delete a record. The order progress bar caps visually at 100%
while produced totals retain any overproduction. Admins can confirm production
completion at or below the ordered quantity after acknowledging a shortfall;
completion blocks new manager production entries. Admins can still correct or
soft-delete existing manager entries after completion, or use `ادامه تولید` to
reopen logging. Resuming preserves later workflow states.

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
  Management navigation uses the floating bottom-nav appearance.
- PDF: off-screen DOM → html2canvas → jsPDF, contain-fit and centered, plain
  download. Salary slip is A5 landscape; invoice is A4 portrait.
- Keep `.salary-slip` and `.invoice-sheet` light even in dark mode. Avoid ASCII
  parentheses around Persian in PDF nodes: html2canvas mirrors them incorrectly.

<a id="deployment"></a>
## Deployment and database operations

| Command | Target |
| --- | --- |
| `npm run deploy:web` / `npm run deploy:platform` | Management build |
| `npm run deploy:api` | PHP server |
| `npm run deploy:landing` | Landing site |
| `npm run deploy:jobs` | Careers site |
| `npm run deploy:all` | API + platform + landing + jobs |

Append `:manual` for ZIPs and upload instructions in `deploy-manual/`. Automatic
deployment uses Node and WinSCP FTPS through a persistent connection.
Platform/landing preserve server-owned `.htaccess`; API includes its router.
Never upload live `server/config.php`. The deploy sync does not delete remote
files; the old employee document root and subdomain must be removed separately.

GitHub Actions verifies frontend tests, the management build, PHP
lint, and production validation on pushes and pull requests. It requires no
production secrets and never deploys. Production deployment remains a local
operation using the commands above.

Private `deploy.env` uses `FTP_SERVER`, `FTP_USER`, `FTP_PASSWORD`, `FTP_WEB_DIR`,
`FTP_API_DIR`, `FTP_LANDING_DIR`, `FTP_JOBS_DIR`, and `API_URL`;
see `deploy.env.sample`. Optional `WINSCP_PATH` locates WinSCP.com. Host is
`hadibtf.ir`, FTPS port 21, main account `hadibt`; subaccounts are jailed away from
the doc roots. Directory names are short names, not full domain names.

The complete fresh-install schema is `server/schema.sql`; importing it does not
alter existing tables and API deployment never applies migrations. Use the
CLI-only `server/migrate.php` from cPanel Terminal (`php migrate.php status`,
`dry-run`, `apply`) after confirming `config.php` points at the intended DB.
`status`/`dry-run` are read-only; `apply` takes an advisory lock, applies pending
migrations in filename order, records only successes, and stops on failure.
DDL migrations must be retry-safe because MySQL/MariaDB implicitly commits
`ALTER TABLE`. Apply migrations before activating dependent API code. The owner
confirmed both 2026-09-26 production weight and log edit/delete migrations
applied live; their IDs are preserved and their column effects are checked
before an untracked migration is recorded. On 2026-10-01, the owner verified
those four columns in `hadibt_business_platform` and bootstrapped
`schema_migrations` through phpMyAdmin. Both IDs now have tracking records
(2026-10-01 09:21:21 UTC). Legacy log weight zero remains unknown measured
weight, not a fabricated estimate. Full operating steps are in
[DEPLOY.md](DEPLOY.md#database-migrations).

For the employee-login retirement, deploy the updated person-ID-only API and
management app first; they work against both manager-log schemas. Then run the
phpMyAdmin preflight SQL, resolve any unmapped/conflicting attribution, export a
backup, and apply the matching cleanup SQL. Verify manager-log counts, weights,
quantities, and People profile counts are unchanged. Hosting must separately
remove the old employee subdomain, DNS/SSL, and document-root files.

The `2026-10-06-manager-production-logs` migration adds the separate manager
log table. Apply it to the intended database before deploying API code that
reads or writes manager-entered production logs.

Fresh host sequence: create DB/user and privileges; configure domains and PHP;
upload API; create private config with DB credentials, allowed origins and a
temporary setup key; import schema; enable SSL; seed the first admin through
`/setup/seed-admin`; blank the setup key; deploy both frontends. Seed management
SPA rewrite once from `public/.htaccess`. Exact setup and manual target paths
remain in [DEPLOY.md](DEPLOY.md).

<a id="verification"></a>
## Verification and release status

For a management resource: add schema/route, register the handler, apply live
migration if required, add the API helper, then implement memory-only UI state,
loading/errors, server-first mutations, and cross-device entry/focus refresh.
Never add a browser database or background sync layer.
Use checks proportionate to the change:

- PHP lint for changed PHP files and `php server/tests/production_validation.php`.
- Vitest: `npm test`.
- Management production build; no TypeScript check exists.
- Verify management authentication and the `/statistics` route. Employee login
  attempts and saved employee sessions must be rejected.

Historical employee report/task migrations remain in the ledger for existing
databases. The 2026-11-23 login-removal migration deletes login accounts while
preserving People profiles and manager production rows. Offline business-data
writes are unsupported.

<a id="troubleshooting"></a>
## Known failures and remedies

| Symptom | Check / remedy |
| --- | --- |
| Build warning about a large chunk | Inspect the Vite bundle report; current app surfaces include large existing route bundles |
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
