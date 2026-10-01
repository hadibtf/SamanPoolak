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
npm run deploy:web      # build + upload dist/platform/ → platform/ (platform.samanpoolak.ir)
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
- `npm run build:platform` writes to `dist/platform/`; `npm run build:employee`
  writes to `dist/employee/`. `npm run build` remains an alias for the platform build.
- Builds may run in either order. Each build clears only its own output directory.
- Employee deploy explicitly uploads the SPA `.htaccess` through curl after
  WinSCP synchronization; its manual ZIP includes that file too. Verify refreshes
  on `/tasks` and `/statistics`, since a root-page check does not catch missing rewrites.
- `deploy:web` and `deploy:platform` build from `dist/platform/`; employee deploys
  use `dist/employee/`. Manual ZIP packages use the same surface-specific output.
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

### Database migrations

`server/schema.sql` is the complete schema for fresh installations. It does not
update existing tables, and deploying backend files never runs migrations.
Migrations are ordered by their `YYYY-MM-DD-name.php` filenames and tracked in
`schema_migrations`. The runner is CLI-only and is not an HTTP endpoint.

On the cPanel host, use Terminal from the API document root. Confirm that
`config.php` points to the intended database (`hadibt_business_platform` in
production) before using `apply`:

```bash
cd /home/hadibt/api
php migrate.php status
php migrate.php dry-run
php migrate.php apply
php migrate.php status
```

`status` and `dry-run` do not modify the database. `apply` creates the tracking
table when needed, takes a database advisory lock, applies only unrecorded
migrations in filename order, and records each migration only after it succeeds.
It stops on an error. MySQL/MariaDB implicitly commits `ALTER TABLE`, so DDL
migrations are not wrapped in transactions; each must check for existing schema
before changing it so a partial failure can be retried safely. A destructive
migration is blocked unless explicitly run as `php migrate.php apply --allow-destructive`.

If cPanel Terminal is unavailable, phpMyAdmin can bootstrap tracking for the
two historical production migrations **only after their columns have been
verified**. Select `hadibt_business_platform` and run the read-only query below;
it must return all four columns with their expected definitions. Then run the
tracking-table and insert statements, followed by the confirmation query. The
insert records already-existing schema and does not run `ALTER TABLE`. Do not
use this bootstrap to mark a migration whose schema changes have not been
applied. Future PHP migrations require CLI access or a separately prepared,
reviewed phpMyAdmin SQL procedure.

```sql
SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'hadibt_business_platform'
  AND (
    (TABLE_NAME = 'production_tasks' AND COLUMN_NAME = 'weight_of_10_grams')
    OR
    (TABLE_NAME = 'production_logs' AND COLUMN_NAME IN (
      'total_weight_grams', 'updated_at', 'deleted_at'
    ))
  )
ORDER BY TABLE_NAME, COLUMN_NAME;

CREATE TABLE IF NOT EXISTS schema_migrations (
    migration_id VARCHAR(191) NOT NULL,
    applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (migration_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO schema_migrations (migration_id, applied_at)
VALUES
    ('2026-09-26-production-weight', UTC_TIMESTAMP()),
    ('2026-09-26-production-log-edit-delete', UTC_TIMESTAMP());

SELECT migration_id, applied_at
FROM schema_migrations
WHERE migration_id IN (
    '2026-09-26-production-weight',
    '2026-09-26-production-log-edit-delete'
)
ORDER BY migration_id;
```

The two `2026-09-26` production migrations were confirmed applied by the owner.
Their IDs are preserved. When the tracker is first introduced to an existing
database, `apply` checks the target columns and records those migrations without
repeating existing `ALTER`s; it adds a column only if the check shows it is
missing. Do not delete migration files or reuse their IDs. Legacy production
log weights of zero remain unknown measured weights; the migration does not
estimate or rewrite stored values.

For a fresh host, import `server/schema.sql`, then run `php migrate.php status`,
`dry-run`, and `apply` before enabling dependent API behavior. For future API
changes, install the runner and migration files, inspect the target with
`status`/`dry-run`, apply migrations, and only then activate API code that needs
the new schema. The normal API deployment command does not run `apply`.

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
API_URL=https://api.samanpoolak.ir # baked into the web build (VITE_API_URL)
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
7. **Schema** — phpMyAdmin → Import `server/schema.sql` (creates all fresh-install tables and migration tracking).
8. **Migrations** — from cPanel Terminal in `/home/hadibt/api`, run
   `php migrate.php status`, `php migrate.php dry-run`, then
   `php migrate.php apply` after confirming `config.php` targets the intended DB.
9. **SSL** — run AutoSSL for both subdomains; verify `https://api.samanpoolak.ir/`
   returns `{"ok":true,…}`.
10. **First admin** — one-time:
   ```bash
   curl -X POST https://api.samanpoolak.ir/setup/seed-admin \
     -H "Content-Type: application/json" \
     -d '{"setupKey":"YOUR_SETUP_KEY","username":"admin","password":"STRONG","displayName":"Admin"}'
   ```
   Then blank `setup_key` in `config.php` to disable the route. (Further users
   are added in-app: **Settings → user management**, admin only.)
11. **Front-ends** — `npm run deploy:web` uploads the manager build to `platform/`
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
