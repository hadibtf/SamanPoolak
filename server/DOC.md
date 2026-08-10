# API reference (server/)

The backend for the سامان پولک platform: the single shared source of truth all
React clients read from and write to. Plain **PHP 8 + PDO + MySQL/MariaDB**, no
framework or dependencies.

- **Base URL (production):** `https://api.samanpoolak.ir` (its own subdomain; the
  front-end at `platform.samanpoolak.ir` calls it cross-origin)
- **Format:** JSON in / JSON out, UTF-8. Wire field names are `camelCase`.
- **Auth:** bearer tokens — send `Authorization: Bearer <token>` on every
  endpoint except public endpoints: `GET /`, `POST /setup/seed-admin`,
  `POST /auth/login`, `POST /inquiries`, `POST /job-applications`, and
  `GET /job-applications/status`.
- Setup/hosting: [../DEPLOY.md](../DEPLOY.md). Frontend: [../DOC.md](../DOC.md).

> Legacy note: the health response still reports `"name": "signit-api"`. It's
> internal only; the product brand is سامان پولک.

---

## Layout

```text
server/
  index.php          Front controller: requires, CORS, route table, auth gate, errors
  .htaccess          HTTPS redirect, front-controller rewrite, Authorization passthrough
  config.sample.php  Template for config.php (created on the server; never committed)
  schema.sql         All tables (CREATE TABLE IF NOT EXISTS)
  uploads/           Marking/product images saved as files (served statically)
  lib/
    config.php       config() loader (reads config.php)
    db.php           db() PDO singleton, now_utc(), next_counter()
    http.php         CORS, JSON in/out, json_error, require_fields, ISO timestamp helpers
    auth.php         token gen, bearer parsing, current_user(), require_auth(), require_admin()
  routes/
    auth.php         login / logout / me / seed-admin
    users.php        admin-only user management
    people.php       people CRUD + server-side prefixed IDs
    orders.php       order CRUD + server-side YYMMN number + createdByName join
    markings.php     per-customer marking directory + image-file upload
    expenses.php     expense CRUD
    inquiries.php    landing-page request capture + back-office status
    job_applications.php careers form capture + authenticated HR status
    admin.php        backup / restore (admin-only)
```

Add a resource: create `routes/<name>.php` (copy `expenses.php` — the simplest
full example), register its routes in `index.php`, add the table to
`schema.sql`, and **run the CREATE on the live DB** (phpMyAdmin).

---

## Conventions

- **Timestamps** UTC, returned ISO-8601 with `Z` (`2026-06-25T08:00:00Z`); stored
  as MySQL `DATETIME` (`Y-m-d H:i:s`).
- **Soft deletes**: delete sets `deletedAt`; the row stays so other devices learn
  of the deletion via delta queries.
- **Delta sync**: list endpoints take `?updatedAfter=<iso>` and return everything
  changed since then (including soft-deleted rows), oldest-first. Without the
  param you get only live rows.
- **Server-assigned IDs**: people `0-/1-/2-<n>` (atomic `counters`); order numbers
  `YYMM<n>` (monthly reset, per-month counter). Clients never generate these.
- **Money** is integer **Rial**. **Dates** are Jalali `YYYYMMDD` strings.
- **Native prepared statements** (`EMULATE_PREPARES=false`): a named placeholder
  may appear **once** per statement (use `:cb`/`:ub`, not `:by` twice).

## Errors
`{ "error": "message" }` (+ `"detail"` only when `debug` is on). Codes: 400 bad
JSON · 401 auth · 403 admin/setup · 404 not found · 409 conflict · 422 validation
· 500 server/DB.

---

## Endpoints

### Health & setup
- `GET /` → `{ ok, name, time }`. No auth.
- `POST /setup/seed-admin` `{ setupKey, username, password, displayName? }` →
  `201 { ok, id }`. One-time; guarded by `setup_key` in config (blank it after).

### Auth
- `POST /auth/login` `{ username, password }` → `{ token, user }`.
- `POST /auth/logout` *(auth)* → `{ ok }` (invalidates the token).
- `GET /auth/me` *(auth)* → `{ user }`.

`user` = `{ id, username, displayName, role }` (`role`: `admin` | `user`).

### Users *(admin only)*
- `GET /users` → `{ users: [user] }`.
- `POST /users` `{ username, password, displayName?, role? }` → `201 { user }`
  (409 on duplicate username).
- `DELETE /users/{id}` → `{ ok, id }` (can't delete your own account).

### People *(auth)*
- `GET /people` (all live) / `GET /people?updatedAfter=<iso>` (delta incl. deletes).
- `GET /people/{id}` → `{ person }`.
- `POST /people` — `category` required (`EMPLOYEE|CUSTOMER|SERVICE_PROVIDER`);
  server assigns `id`. → `201 { person }`.
- `PUT /people/{id}` (partial) → `{ person }`.
- `DELETE /people/{id}` (soft) → `{ ok, id }`.

### Orders *(auth)*
- `GET /orders` / `?updatedAfter=` (delta).
- `GET /orders/{id}` → `{ order }`.
- `POST /orders` — `date` (YYYYMMDD) required; server assigns `id` + `orderNumber`.
  → `201 { order }`.
- `PUT /orders/{id}` — order number preserved. → `{ order }`.
- `DELETE /orders/{id}` (soft) → `{ ok, id }`.

### Markings *(auth)*
- `GET /markings` / `?updatedAfter=` (delta).
- `POST /markings` `{ customerId, name, location?, imageData? }` — `imageData` is a
  base64 data URL; the server writes a file under `/uploads/markings` and stores
  its URL in `src`. Names are auto-numerated per customer. → `201 { marking }`.
- `DELETE /markings/{id}` (soft) → `{ ok, id }`.

### Expenses *(auth)*
- `GET /expenses` / `?updatedAfter=` (delta).
- `POST /expenses` `{ title, date?, dateText?, category?, amount?, paidTo?, description? }`
  → `201 { expense }`. `amount` is Rial.
- `PUT /expenses/{id}` (partial) → `{ expense }`.
- `DELETE /expenses/{id}` (soft) → `{ ok, id }`.

### Inquiries
- `POST /inquiries` *(public)* `{ name, phone, product, quantity?, note?, source? }`
  → `201 { inquiry }`. Used by the landing page direct-submit option.
- `GET /inquiries` *(auth)* → `{ inquiries: [inquiry] }`, newest first.
- `PUT /inquiries/{id}` *(auth)* `{ handled: true|false }` → `{ inquiry }`.

### Job applications
- `POST /job-applications` *(public)* accepts the careers form payload and returns `201 { ok, id }`. Server validates required/conditional fields, Iranian mobile format, and applies a simple per-IP hourly rate limit.
- `GET /job-applications/status` *(public)* returns `{ open }` so the careers form can close itself when hiring is off.
- `PUT /job-applications/status` *(auth)* `{ open: true|false }` opens/closes public application intake.
- `GET /job-applications` *(auth)* returns `{ jobApplications: [...] }`.
- `GET /job-applications/{id}` *(auth)* returns `{ jobApplication }`.
- `PUT /job-applications/{id}` *(auth)* `{ status, interviewAt? }` updates the internal HR status. Status values: `new`, `interview`, `accepted`, `rejected`.
- `DELETE /job-applications/{id}` *(auth)* deletes one application.
- `DELETE /job-applications` *(auth)* deletes all applications.
### Backup / restore *(admin only)*
- `GET /backup` → one JSON of all tables (`people, orders, markings, expenses,
  inquiries, job_applications, app_settings, users`).
- `POST /restore` — body = a backup JSON; **replaces** people/orders/markings/
  expenses (transaction) and **upserts** users (so the current admin/session
  survive). Marking image *files* are not included — only the DB rows/URLs.

---

## Entities (wire shapes)

**person** — `id, category, firstName, lastName, fatherName, phones[], addresses[],
sex, companyName, county, city, postalCode, nationalCode, iban,
bankAccountNumber, birthDate, description, createdAt, updatedAt, deletedAt`.

**order** — `id, orderNumber, date, dateText, customerId, customerName, items[],
createdBy, createdByName, createdAt, updatedAt, deletedAt`. Each **item**:
`uid, productName, quantity, material, thickness, diameter, markingId,
markingName, platingColor, isHardened, hardeningIntensity, description, salePrice,
unitCost, state, stateHistory[{state,date,totalWeight}], weightOf10,
producedTotalWeight`. (`items` is a JSON column.)

**marking** — `id, customerId, name, src, location, createdAt, updatedAt, deletedAt`.

**expense** — `id, date, dateText, title, category, amount, paidTo, description,
createdBy, createdByName, createdAt, updatedAt, deletedAt`.

---

## Security
- HTTPS only (login sends a plaintext password). Passwords via `password_hash`
  (bcrypt). Tokens are random 64-hex, server-side, revocable; sliding 30-day
  expiry (`session_ttl_days`).
- `config.php` (DB creds + setup key) is git-ignored, denied by `.htaccess`, and
  never uploaded by the deploy script.
- CORS is locked to `cors_allowed_origins` in `config.php`. The front-end
  (`platform.samanpoolak.ir`) and API (`api.samanpoolak.ir`) are **different
  origins**, so `https://platform.samanpoolak.ir` must be in the allowlist; the
  handler answers `OPTIONS` preflight.
- Uploaded marking/product images are saved under `/uploads` and stored as
  **absolute** URLs (`https://api.samanpoolak.ir/uploads/…`) so they load from
  the cross-origin front-end.

## Not yet on the server
Statistics aggregation is computed client-side from the mirror today; offline
write queue is future work. See [../todo/](../todo/).
