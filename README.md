# سامان پولک (Saman Poolak) — business platform

A Persian (Farsi), right-to-left business-management web app for a metal
stamping / plating workshop, built around the Jalali (Shamsi) calendar with an
iOS-style "liquid glass" UI (light + dark themes). A React front-end talks to a
small **PHP + MySQL** backend that is the single shared source of truth, so a
team of users on different devices all see the same live data.

> **New here?** Read **[CLAUDE.md](CLAUDE.md)** for the operational map (how to
> build/deploy and the traps), **[DOC.md](DOC.md)** for a frontend deep-dive
> (with Android/Compose analogies), **[server/DOC.md](server/DOC.md)** for the
> API reference, and **[DEPLOY.md](DEPLOY.md)** for hosting.

---

## Features

- **Auth & users** — per-user login (bcrypt + bearer tokens); the whole app is
  gated. Admins add/remove users and see "entered by" stamps on orders.
- **People directory** — employees, customers, service providers; available from
  the People tab under Settings & Information; server-assigned
  prefixed IDs (`0-/1-/2-`), multiple phones/addresses, Jalali birth date.
- **Per-customer markings** — a directory of stamp/engraving images per customer
  (uploaded as files on the server), reused when creating orders.
- **Multi-item orders** — an order is a header (customer + date) holding several
  product items; each item has its own spec (material, dimensions, marking,
  plating, hardening), pricing, a 7-stage production workflow with history, and
  weight reconciliation. Server-assigned `YYMMN` order numbers.
- **Invoices & salary slips** — client-rendered PDFs (A4 invoice, A5 salary slip).
- **Human resources** — year-1405 payroll calculator (insurance, allowances,
  overtime, deductions, reward), attendance, payroll settings, and job
  applications; includes a Rial/Toman-aware result and printable slip.
- **Expenses** — shared, filterable expense tracker (category, date range, search).
- **Settings & Information** — light/dark theme, app-wide Rial/Toman currency,
  admin database backup/restore, and the People directory.
- **Management** — order entry/list/detail plus the Inquiries tab.
- **Local-mirror sync** — reads are instant from an IndexedDB mirror; the app
  polls the server (~15s) so one user's change appears for the others. Reading
  works offline; writing needs a connection.

---

## Tech stack

| Area | Choice |
| --- | --- |
| UI | React 19 (Create React App / `react-scripts` 5) |
| Routing | React Router 7 |
| Local mirror | Dexie.js 4 (IndexedDB) + `dexie-react-hooks` (`useLiveQuery`) |
| Backend | Vanilla PHP 8 + PDO + MySQL/MariaDB (no framework) |
| Auth | Per-user bcrypt + server-side bearer tokens |
| Jalali dates | `react-multi-date-picker` + `react-date-object` |
| PDF | `jspdf` + `html2canvas` (DOM screenshot → PDF) |
| Styling | Plain CSS (global + per-page), CSS variables, glassmorphism, dark theme |
| Font / icons | Vazirmatn (bundled) / Font Awesome |

No TypeScript, no Redux/Zustand, no CSS framework. Cross-component data flows
through the Dexie mirror via live queries.

---

## Getting started (frontend)

```bash
npm install
# point the app at an API (create .env.local from .env.sample):
#   REACT_APP_API_URL=https://api.samanpoolak.ir
npm start          # dev server at http://localhost:3000
npm run build      # production build → ./build  (runs with CI=true: warnings fail)
```

The app needs a reachable API to log in. Use the live API, or run the PHP backend
locally (see [DEPLOY.md](DEPLOY.md)) and point `REACT_APP_API_URL`
at it.

## Deploying

Deploys run **from a local machine** (the host blocks CI/FTP from foreign IPs):

```bash
npm run deploy:web     # build + upload build/ → platform/ (platform.samanpoolak.ir)
npm run deploy:platform # same as deploy:web, clearer name
npm run deploy:api     # upload server/ → api/ (api.samanpoolak.ir)
npm run deploy:landing # upload landing/ → samanpoolak.ir/ (static marketing site)
npm run deploy:jobs    # upload jobs/ → jobs/ (jobs.samanpoolak.ir)
npm run deploy:employee # build + upload employee app → employee/ (employee.samanpoolak.ir)
npm run deploy:all     # api + platform + landing + jobs
```

Deploy commands upload automatically. For manual zip packaging, append `:manual`
(for example, `npm run deploy:api:manual`).
Credentials live in a gitignored `deploy.env` (copy `deploy.env.sample`). When
a backend change adds a DB table/column, run the matching SQL once in
phpMyAdmin. Full details in [DEPLOY.md](DEPLOY.md).

---

## Project structure

```text
src/
├── index.js                  # Mounts <App> in <SettingsProvider><BrowserRouter><AuthProvider>
├── App.js                    # Routes; gates app behind login; runs the sync engine
├── db.js                     # Dexie schema (v1–v6) + helpers (IDs, weights, order status)
├── constants.js              # Enums + Persian labels (materials, plating, states, expense categories)
├── index.css                 # Global styles incl. dark theme + bottom nav
├── api/client.js             # fetch wrapper + per-entity API objects + auth token handling
├── auth/AuthContext.jsx      # login/logout/me, current user, 401 handling
├── context/SettingsContext.jsx  # theme + currency, formatMoney/toRial/fromRial
├── hooks/useSyncEngine.js    # polls /…?updatedAfter and mirrors deltas into Dexie
├── utils/image.js            # client-side image compression → Base64
├── components/               # BottomNav, MarkingsManager
└── pages/                    # HumanResources (+ payroll tabs), Management (+ orders/inquiries),
                              #   SettingsInfo (+ People), Expenses, Login (+ matching .css)
server/                       # PHP API (see server/DOC.md, server/DEPLOY.md)
landing/                      # standalone static marketing site (samanpoolak.ir) — see landing/README.md
jobs/                         # standalone careers site (jobs.samanpoolak.ir)
scripts/deploy.mjs            # local FTPS deploy or manual zip packages
todo/                         # open feature plans (DECIDED/OPEN markers)
```

## Routes

| Path | Screen |
| --- | --- |
| `/payroll` | Human Resources: payroll, attendance, settings, and job applications |
| `/expenses` | Expenses tracker |
| `/orders`, `/orders/list`, `/orders/inquiries`, `/orders/edit/:id`, `/orders/view/:id` | Management: order submit / list / inquiries / edit / detail+invoice |
| `/settings` | Settings & Information: theme, currency, backup/restore, user management, People tab |
| `/people`, `/inquiries`, `/job-applications` | Legacy paths that redirect to their new parent sections |

(Unauthenticated users see the **Login** screen instead of any route.)

---

## Conventions & gotchas

See **[CLAUDE.md](CLAUDE.md)** — money stored in Rial, Jalali `YYYYMMDD` dates,
server-assigned IDs/order-numbers, PWA caching after deploy, the build's
zero-warning rule, and the PDF/RTL specifics.

## License

Private / internal project. Not published.
