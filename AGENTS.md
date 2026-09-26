# AGENTS.md — orientation for agents

Read this first. It's the operational map of the project: what it is, how it's
wired, how to ship it, and the traps that have already bitten us. For depth see
[DOC.md](DOC.md) (frontend deep-dive), [server/DOC.md](server/DOC.md) (API
reference), and [DEPLOY.md](DEPLOY.md) (hosting/deploy, web + api).
Employee work is documented in [EMPLOYEE-TODO.md](EMPLOYEE-TODO.md) and
[EMPLOYEE-PRODUCTION-DOMAIN.md](EMPLOYEE-PRODUCTION-DOMAIN.md). The `/todo/`
directory is unrelated to the employee scope; do not use it to drive that work.

## What this is
**سامان پولک (Saman Poolak)** — a Persian/RTL business-management web app for a
metal stamping/plating workshop. Domains: **payroll**, **people/customers +
per-customer markings**, **multi-item orders** (with a production workflow,
weights, pricing, invoices), and **expenses**. Plus admin settings (theme,
currency, user management, DB backup/restore).

## Architecture in one paragraph
React 19 SPA (Create React App), served from `https://platform.samanpoolak.ir`,
talking to a **vanilla PHP 8 + MySQL** API at `https://api.samanpoolak.ir` (its
own subdomain). The SPA calls it **cross-origin** — that origin is in the API's
CORS allowlist; auth uses bearer tokens (not cookies).
**The server is the single source of truth.** The
client keeps a **Dexie (IndexedDB) mirror** so screens read instantly via
`useLiveQuery`; [`src/hooks/useSyncEngine.js`](src/hooks/useSyncEngine.js) polls
the API every ~15s (and on focus/reconnect) and writes deltas into the mirror.
**Writes** go through [`src/api/client.js`](src/api/client.js) to the server
first, then upsert the returned row into Dexie. Writing requires a connection;
reading works offline from the mirror. There is **no Redux/Context store** for
data — the DB mirror is the shared state. Auth is per-user (bearer tokens); the
whole app is gated behind a login.

This mirror pattern describes management resources. Employee production screens
and production statistics call `productionApi` directly and keep local React
state; do not add unrestricted log mirroring. `src/index.js` selects the separate
employee build with `REACT_APP_APP_SURFACE=employee`, served at
`https://employee.samanpoolak.ir`. Employee bundles must contain no management
screens, links, or management URL disclosure. Login surface/origin checks and the
API employee-route allowlist enforce separation alongside handler ownership checks.

## The golden rules (read before you touch anything)

1. **Deploy is LOCAL, not CI.** The host blocks FTP from GitHub's runners
   (Iranian host, foreign-IP firewall), so the GitHub Actions workflow does
   **not** work. Deploy from this machine with:
   - `npm run deploy:web` / `npm run deploy:platform` — build + upload `build/` → `platform/` (platform.samanpoolak.ir)
   - `npm run deploy:api` — upload `server/` → `api/` (api.samanpoolak.ir)
   - `npm run deploy:landing` — upload `landing/` → `samanpoolak.ir/` (the static
     marketing site at the bare samanpoolak.ir domain; see [landing/README.md](landing/README.md))
   - `npm run deploy:jobs` — upload `jobs/` → `jobs/` (jobs.samanpoolak.ir)
   - `npm run deploy:employee` — employee build → `employee/`
   - `npm run deploy:all` — api + platform + landing + jobs + employee
   These default to automatic upload; append `:manual` for ZIP packaging.
   Automatic deploy uses Node + WinSCP over FTPS, with an explicit curl upload
   for the employee SPA `.htaccess` ([scripts/deploy.mjs](scripts/deploy.mjs))
   with credentials in **`deploy.env`** (gitignored). Transient single-file FTP
   failures happen — just re-run or use manual mode.

2. **Adding a DB table/column needs a manual step.** `server/schema.sql` is
   `CREATE TABLE IF NOT EXISTS`. Before deploying dependent backend code, the table
   must be created on the **live** DB via cPanel → phpMyAdmin (run the new
   `CREATE`/`ALTER`). The API 500s with "table doesn't exist" until you do.
   DB name on the host: `hadibt_business_platform`.

3. **The production build fails on lint warnings.** `npm run build` runs with
   `CI=true` (and so does the deploy). Unused imports/vars **break the build**.
   Keep the tree clean. Always build before deploying.

4. **Git identity is `Hadi Bastanfar <98bastanfar@gmail.com>`** (set locally in
   this repo). Branch is `main`. Commit messages end with the
   `Co-Authored-By: Codex …` trailer. Push only when asked; `main` is the
   working branch here by the owner's preference.

5. **It's a PWA → caching.** After deploying, changes may not show until a hard
   refresh (Ctrl+Shift+R) or, on an installed phone PWA, closing/reopening. If
   "my fix isn't showing," suspect the cache before the code.

## Money, dates, currency, language
- **All money is stored in Rial** (canonical). The global Rial/Toman setting
  ([`src/context/SettingsContext.jsx`](src/context/SettingsContext.jsx)) only
  changes display/entry: `formatMoney(rial)`, `toRial(input)`, `fromRial(rial)`.
  **The exported invoice is always Rial** regardless of the setting.
- **Dates are Jalali (Shamsi)**, stored as a sortable `YYYYMMDD` string (e.g.
  `14050401`). Pickers use `react-multi-date-picker`.
- **Everything is RTL Persian.** New UI text is Persian.
- **Order numbers**: server-assigned `YYMMN` (monthly reset). **People IDs**:
  server-assigned `0-/1-/2-` prefixes. Never generate these client-side.

## Gotchas that already cost us time
- **PDF export** = render an off-screen DOM node → `html2canvas` → `jsPDF`. The
  off-screen slip/invoice nodes must stay **light** even in dark mode (don't let
  global dark rules hit `.salary-slip` / `.invoice-sheet`).
- **html2canvas mishandles ASCII parentheses around Persian** — they mirror
  wrong. Don't wrap Persian in `()` inside PDF nodes.
- **Native `<select>` dark mode**: paint `option { background-color; color }`
  explicitly. `color-scheme: dark` alone left Firefox/Zen popups invisible.
- **PHP native prepared statements** (`EMULATE_PREPARES=false`): a named
  placeholder can be used **once** per statement. Reusing `:by` for two columns
  throws `Invalid parameter number`. Use distinct names (`:cb`, `:ub`).
- **`.sh` files are pinned to LF** via `.gitattributes` (Windows CRLF breaks
  bash). `npm` scripts spawn via `shell:true` so Node can run `npm.cmd`.

## Where things live
- Frontend: `src/` — `pages/` (one per screen), `components/`, `context/`
  (theme+currency), `auth/` (AuthContext), `hooks/useSyncEngine.js`,
  `api/client.js`, `db.js` (Dexie v10 + helpers), `constants.js`.
- Backend: `server/` — `index.php` (front controller + route table), `lib/`
  (config/db/http/auth), `routes/` (auth, users, people, orders, markings,
  expenses, production, admin=backup/restore), `schema.sql`, `migrations/`, `tests/`.
- Deploy: `scripts/deploy.mjs`, `deploy.env` (gitignored), `deploy.env.sample`.
- Careers site: `jobs/` — standalone static site for `jobs.samanpoolak.ir`.
- Plans/backlog: `todo/` (open feature todos with `DECIDED`/`OPEN` markers).

## Current state
Done & live: auth + admin user management, people + markings, multi-item orders
+ invoices, payroll + salary slip, expenses, settings (dark theme, global
currency, backup/restore), separate employee app, assignment editing/splitting,
measured-weight production logs with edit/soft-delete, and employee/management
production statistics. The owner accepted the employee release; outstanding
integration-test coverage is recorded in `EMPLOYEE-TODO.md`.

## Employee production rules

- Provision employee usernames/passwords through People add/edit. Never expose passwords.
- First save the measured weight of 10 pieces in **grams**. Later log batch weight
  in **kilograms**; the API derives pieces, rounded to the nearest whole piece.
  Show expected total and estimated remaining weight from the saved measurement.
- Edits and deletes apply only to the authenticated employee's logs. Bulk clear
  applies only to the selected task/item. All progress/statistics exclude soft-deleted logs.
- Assignment splits transfer only unproduced capacity after explicit confirmation.
- Reuse `JalaliDatePicker` with a Jalali DateObject; compact date strings are storage
  values, not picker values. Valid past production dates must remain selectable.
  Scope form/button CSS so it cannot restyle the calendar's navigation buttons.
- Shared chart bar heights use the actual 236px plot inside a 260px cell with a
  24px label gutter. Keep CSS and `productionBarHeight` aligned to avoid clipped bars.
- Employee deploys must include `public/.htaccess` for refreshes on `/tasks` and
  `/statistics`. Build platform and employee sequentially: both write `build/`.
- Checks: `php server/tests/production_validation.php`, PHP lint, Jest via
  `npm test -- --watch=false --runInBand` with `CI=true`, and both app builds.

> Legacy naming: the API health response and `localStorage` keys still use
> `signit*`/`signit-api`. These are internal-only and intentionally left
> unchanged (renaming localStorage keys would log everyone out). User-facing
> branding is سامان پولک.
