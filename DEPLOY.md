# Hosting & deployment

AI agent entry point: [MASTERCONTEXT.md](MASTERCONTEXT.md#deployment).

How the app is hosted and how to ship changes. Production runs on a cPanel
shared host that serves several domains on one account: the
**platform.samanpoolak.ir** subdomain (management front-end),
**employee.samanpoolak.ir** (employee front-end), the
**api.samanpoolak.ir** subdomain (the API), **samanpoolak.ir** (the static
marketing/landing site — see [`landing/`](landing/)), and **hadibtf.ir** (the
owner's personal use — not this app). Each domain has its own doc root in
`/home/hadibt`; the application doc roots are listed below.

- **Site (front-end):** `https://platform.samanpoolak.ir` → `platform/` (doc root)
- **Employee site:** `https://employee.samanpoolak.ir` → `employee/` (doc root)
- **API (back-end):** `https://api.samanpoolak.ir` → `api/` (doc root; the API
  serves at the subdomain **root**, so endpoints are `/auth/login`, `/people`, …)
- **Landing:** `https://samanpoolak.ir` → `samanpoolak.ir/` (doc root; a
  standalone static marketing page, independent of the app)
- **DB:** MySQL/MariaDB `hadibt_business_platform`, PHP 8.1, AutoSSL on.

> **Cross-origin:** the front-end (`platform.samanpoolak.ir`) and the API
> (`api.samanpoolak.ir`) are different origins, so the API's
> `cors_allowed_origins` (in the live `api/config.php`) must include
> `https://platform.samanpoolak.ir` and `https://employee.samanpoolak.ir`.
> Auth uses bearer tokens (not cookies), the
> CORS handler answers preflight, and uploaded image URLs are **absolute**
> (`https://api.samanpoolak.ir/uploads/…`) so they load cross-origin.

> **Deploys are run from a local machine, not CI.** The host firewalls FTP from
> foreign IPs, so GitHub Actions can't reach it. A `.github/workflows/deploy-api.yml`
> exists but is effectively dead — **use the npm deploy scripts below.**

---

## Deploying changes (the normal flow)

From the project root on a machine that can reach the host:

```bash
npm run deploy:web      # build (CI=true) + upload build/ → platform/ (platform.samanpoolak.ir)
npm run deploy:platform # same as deploy:web, clearer name
npm run deploy:api      # upload server/ → api/ (api.samanpoolak.ir)
npm run deploy:landing  # upload landing/ → samanpoolak.ir/ (static marketing site)
npm run deploy:jobs     # upload jobs/ → jobs/ (jobs.samanpoolak.ir)
npm run deploy:employee # build + upload employee app → employee/ (employee.samanpoolak.ir)
npm run deploy:all      # api + platform + landing + jobs + employee
```

- Implemented in [`scripts/deploy.mjs`](scripts/deploy.mjs) using **WinSCP**
  over FTPS. It synchronizes changed files through one persistent connection,
  avoiding shared-host FTP timeouts caused by a separate login per file.
  Install WinSCP once (or set `WINSCP_PATH` in `deploy.env` if it is installed
  somewhere unusual). Credentials come from a **gitignored `deploy.env`** in
  the project root (copy [`deploy.env.sample`](deploy.env.sample) once).
- Standard `deploy:*` commands upload automatically over FTP.
- Manual commands use the `:manual` suffix, create ZIP packages in
  `deploy-manual/`, and write `UPLOAD-INSTRUCTIONS.md` beside them. For example:
  `npm run deploy:all:manual`.
- The underlying script also accepts `--mode=automatic` or `--mode=manual`.
- Build platform and employee sequentially: they share the `build/` directory.
- Employee deploy explicitly uploads the SPA `.htaccess` through curl after
  WinSCP synchronization; its manual ZIP includes that file too. Verify refreshes
  on `/tasks` and `/statistics`, since a root-page check does not catch missing rewrites.
- `deploy:web` builds first; the build runs with `CI=true`, so **any lint
  warning fails it**. Fix warnings before deploying.
- Platform and landing deploys **do not upload** `.htaccess` because the server's
  copy has cPanel/PWA routing rules. API deploys include the API router
  `.htaccess`. Deploys never upload `server/config.php` (live DB creds).
  Re-running after a transient single-file FTP failure is normal.
- **PWA caching:** after a web deploy, hard-refresh (Ctrl+Shift+R); an installed
  phone PWA may need closing/reopening to pick up the new build.

### Manual upload folders

When using manual mode, upload each generated zip to its matching cPanel folder,
extract it there, then delete the zip from the server:

```text
api.samanpoolak.ir      → /home/hadibt/api
platform.samanpoolak.ir → /home/hadibt/platform
employee.samanpoolak.ir → /home/hadibt/employee
samanpoolak.ir          → /home/hadibt/samanpoolak.ir
jobs.samanpoolak.ir     → /home/hadibt/jobs
```

Other projects on the same account are separate and should not receive these
packages:

```text
hadibtf.ir        → /home/hadibt/public_html
recipe.hadibtf.ir → /home/hadibt/recipe
teleclip.hadibtf.ir → /home/hadibt/teleclip
```

### Adding a DB table or column
`server/schema.sql` uses `CREATE TABLE IF NOT EXISTS`, so deploying backend code
does **not** change the live schema. Before deploying dependent API code, run the new
`CREATE`/`ALTER` once in **cPanel → phpMyAdmin → (select `hadibt_business_platform`)
→ SQL**. Selecting the database first avoids MySQL error `#1046 No database selected`.
`CREATE TABLE IF NOT EXISTS` does not add columns to existing tables.

The production-weight and log edit/delete migrations under `server/migrations/`
dated `2026-09-26` were confirmed applied by the owner. Fresh installs use the
current schema; do not rerun `ADD COLUMN` migrations blindly on an existing DB.

---

## `deploy.env`

```ini
FTP_SERVER=hadibtf.ir              # FTP host for the cPanel account (login lands in /home/hadibt)
FTP_USER=hadibt                    # main cPanel/FTP account
FTP_PASSWORD=********               # cPanel/FTP password
FTP_WEB_DIR=platform               # front-end doc root (platform.samanpoolak.ir)
FTP_API_DIR=api                    # API doc root (api.samanpoolak.ir)
FTP_LANDING_DIR=samanpoolak.ir     # landing-site doc root (samanpoolak.ir)
FTP_JOBS_DIR=jobs                  # careers-site doc root (jobs.samanpoolak.ir)
FTP_EMPLOYEE_DIR=employee          # employee app doc root (employee.samanpoolak.ir)
API_URL=https://api.samanpoolak.ir # baked into the web build (REACT_APP_API_URL)
```

`FTP_SERVER` stays the account's FTP host (`hadibtf.ir`) — all domains live on
the same account, the login lands in `/home/hadibt`, and the deploy navigates
into each subdomain's doc-root dir (`platform/` for the SPA, `api/` for the API).
The doc-root dir names are short (`platform`, `api`), **not** the full subdomain
hostnames. Use the **main** account (`hadibt`) — sub-accounts are jailed away
from the doc roots. FTPS over port 21.

---

## One-time server setup (already done in production)

Recorded here for rebuilding on a fresh host:

1. **Database** — cPanel → *MySQL Databases*: create DB (`…_business_platform`),
   a user, add user to DB with **ALL PRIVILEGES**. Note name/user/password.
2. **PHP** — *MultiPHP Manager*: set the domain to **PHP 8.1+**.
3. **Subdomains** — create `platform.samanpoolak.ir`, `employee.samanpoolak.ir`,
   and `api.samanpoolak.ir` in cPanel → *Domains*; note their doc roots
   (`platform/`, `employee/`, `api/`).
4. **PHP** — *MultiPHP Manager*: set both subdomains to **PHP 8.1+**.
5. **Upload the API** — `npm run deploy:api` so `server/` lands in `api/` (it
   serves at the subdomain root; `server/.htaccess` provides the routing).
6. **config.php** — in `api/`, copy `config.sample.php` → `config.php` and fill
   `db.name/user/pass`, `cors_allowed_origins` (include
   `https://platform.samanpoolak.ir`, `https://employee.samanpoolak.ir`, and
   `http://localhost:3000`), and a
   one-time `setup_key`. It stays only on the server (git-ignored, never
   overwritten by deploys).
7. **Schema** — phpMyAdmin → Import `server/schema.sql` (creates all tables).
8. **SSL** — run AutoSSL for both subdomains; verify `https://api.samanpoolak.ir/`
   returns `{"ok":true,…}`.
9. **First admin** — one-time:
   ```bash
   curl -X POST https://api.samanpoolak.ir/setup/seed-admin \
     -H "Content-Type: application/json" \
     -d '{"setupKey":"YOUR_SETUP_KEY","username":"admin","password":"STRONG","displayName":"Admin"}'
   ```
   Then blank `setup_key` in `config.php` to disable the route. (Further users
   are added in-app: **Settings → user management**, admin only.)
10. **Front-ends** — `npm run deploy:web` uploads the manager build to `platform/`
   and preserves its server-owned `.htaccess`. Seed that doc root once with the
   SPA rewrite from [`public/.htaccess`](public/.htaccess). `npm run
   deploy:employee` uploads that rewrite with the employee build, so refreshing
   `/tasks` or `/statistics` continues to serve the SPA.

---

## Troubleshooting

- **`Server not configured: config.php is missing`** — step 4 not done / wrong folder.
- **`Database connection failed`** — bad creds in `config.php`, or user lacks
  privileges on the DB.
- **`… Table '…X' doesn't exist`** — run the table's `CREATE` in phpMyAdmin.
- **401 on every authed call** — host stripped `Authorization`; the bundled
  `.htaccess` re-adds it — make sure it's present in the `api/` doc root.
- **CORS errors** — add the app origin to `cors_allowed_origins` in `config.php`.
- **Deploy says "Input required: server" / connection refused on CI** — ignore
  GitHub Actions; deploy locally (host blocks CI).
- **See error detail** — temporarily set `'debug' => true` in `config.php`.
- **WinSCP not found** — install WinSCP, or set `WINSCP_PATH` in `deploy.env`
  to the full path to `WinSCP.com`.
