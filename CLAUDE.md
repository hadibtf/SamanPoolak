# CLAUDE.md — orientation for agents

Read this first. It's the operational map of the project: what it is, how it's
wired, how to ship it, and the traps that have already bitten us. For depth see
[DOC.md](DOC.md) (frontend deep-dive), [server/DOC.md](server/DOC.md) (API
reference), [DEPLOY.md](DEPLOY.md) (hosting/deploy, web + api), and [todo/](todo/).

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

## The golden rules (read before you touch anything)

1. **Deploy is LOCAL, not CI.** The host blocks FTP from GitHub's runners
   (Iranian host, foreign-IP firewall), so the GitHub Actions workflow does
   **not** work. Deploy from this machine with:
   - `npm run deploy:web` — build + upload `build/` → `platform/` (platform.samanpoolak.ir)
   - `npm run deploy:api` — upload `server/` → `api/` (api.samanpoolak.ir)
   - `npm run deploy:landing` — upload `landing/` → `samanpoolak.ir/` (the static
     marketing site at the bare samanpoolak.ir domain; see [landing/README.md](landing/README.md))
   - `npm run deploy:all` — web + api (not landing — it ships on its own)
   These use Node + `curl` over FTPS ([scripts/deploy.mjs](scripts/deploy.mjs))
   with credentials in **`deploy.env`** (gitignored). Transient single-file FTP
   failures happen — just re-run.

2. **Adding a DB table/column needs a manual step.** `server/schema.sql` is
   `CREATE TABLE IF NOT EXISTS`. After deploying new backend code, the table
   must be created on the **live** DB via cPanel → phpMyAdmin (run the new
   `CREATE`/`ALTER`). The API 500s with "table doesn't exist" until you do.
   DB name on the host: `hadibt_business_platform`.

3. **The production build fails on lint warnings.** `npm run build` runs with
   `CI=true` (and so does the deploy). Unused imports/vars **break the build**.
   Keep the tree clean. Always build before deploying.

4. **Git identity is `Hadi Bastanfar <98bastanfar@gmail.com>`** (set locally in
   this repo). Branch is `main`. Commit messages end with the
   `Co-Authored-By: Claude …` trailer. Push only when asked; `main` is the
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
  `api/client.js`, `db.js` (Dexie v6 + helpers), `constants.js`.
- Backend: `server/` — `index.php` (front controller + route table), `lib/`
  (config/db/http/auth), `routes/` (auth, users, people, orders, markings,
  expenses, admin=backup/restore), `schema.sql`.
- Deploy: `scripts/deploy.mjs`, `deploy.env` (gitignored), `deploy.env.sample`.
- Plans/backlog: `todo/` (open feature todos with `DECIDED`/`OPEN` markers).

## Current state
Done & live: auth + admin user management, people + markings, multi-item orders
+ invoices, payroll + salary slip, expenses, settings (dark theme, global
currency, backup/restore). **Not built yet** (see `todo/`): statistics page,
kg-weights + extra workflow states, production photo/packaging/جفت‌گونی,
produced-quantity invoicing, view-mark lightbox, full offline outbox.

> Legacy naming: the API health response and `localStorage` keys still use
> `signit*`/`signit-api`. These are internal-only and intentionally left
> unchanged (renaming localStorage keys would log everyone out). User-facing
> branding is سامان پولک.
