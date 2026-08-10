# Developer guide (DOC.md)

How the **front-end** is built and why, for a developer new to React/web but
comfortable with **Android (Kotlin, Compose, Room)**. "🤖 Android analogy"
callouts map web ideas to things you know. For the API see
[server/DOC.md](server/DOC.md); for hosting see [DEPLOY.md](DEPLOY.md);
for the quick operational map see [CLAUDE.md](CLAUDE.md).

---

## 1. Mental-model mapping

| Web / React | Android / Compose | Notes |
| --- | --- | --- |
| Component (function returning JSX) | `@Composable` | Declarative UI; re-runs on state change. |
| `useState` | `remember { mutableStateOf() }` | Local UI state. |
| `useEffect(fn, [deps])` | `LaunchedEffect(keys)` | Side effects keyed on deps; return = cleanup. |
| `useMemo` / `useCallback` | `remember(key) {}` | Memoize value / function identity. |
| `useContext` (Auth, Settings) | A Hilt-provided singleton / `CompositionLocal` | App-wide state shared via providers. |
| React Router | Navigation / `NavHost` | URL paths ↔ screens. |
| Dexie.js | Room | ORM over a local DB (IndexedDB here). |
| `useLiveQuery` | Room `Flow` + `collectAsState` | Re-renders when the queried table changes. |
| `fetch` wrapper (`api/client.js`) | Retrofit + an `AuthInterceptor` | HTTP with the bearer token attached. |
| CRA (`react-scripts`) | Gradle + AGP | `npm start` ≈ run; `npm run build` ≈ release. |

### The big shift from MVVM
There is **no ViewModel/Repository layer and no Redux**. The architecture is:

```
PHP + MySQL  ←──  src/api/client.js  ──→  Dexie mirror (IndexedDB)  ──→  useLiveQuery  ──→  UI
  (source         (writes go here          (local read cache,            (auto re-render
   of truth)       first, then mirror)      filled by the sync engine)    on change)
```

The **server** is the source of truth. The **Dexie mirror** is a local read
cache the UI binds to. You almost never read the server directly in a component —
you read the mirror with `useLiveQuery`, and a background **sync engine** keeps
the mirror fresh. Writes call the API, then upsert the canonical row into the
mirror so the UI updates instantly.

🤖 **Analogy:** like a Room cache fed by a Retrofit-backed repository with a
WorkManager sync — except there's no explicit repository/VM; components call the
API client and read Room (`useLiveQuery`) directly.

---

## 2. Boot & auth gate

```
src/index.js
  └ <SettingsProvider>            theme + currency (also themes the login screen)
      └ <BrowserRouter>
          └ <AuthProvider>        validates a stored token, exposes user/login/logout
              └ <App/>            if no user → <Login/>; else <AppShell/> (routes + nav + sync)
```

- [`src/auth/AuthContext.jsx`](src/auth/AuthContext.jsx): on mount, validates the
  saved token via `GET /auth/me`; exposes `{ user, loading, login, logout }`. A
  global 401 (from the API client) forces logout.
- [`src/App.js`](src/App.js): shows a splash while validating, the **Login**
  screen when unauthenticated, otherwise the routed app. `useSyncEngine()` runs
  only inside the authenticated shell.

🤖 **Analogy:** `AuthProvider` ≈ a session manager; the login gate ≈ an auth
`NavGraph` start-destination guard.

---

## 3. The data layer

### 3.1 API client — [`src/api/client.js`](src/api/client.js)
A `fetch` wrapper that prefixes `REACT_APP_API_URL`, attaches
`Authorization: Bearer <token>`, parses JSON, throws a typed `ApiError`
(`status: 0` means network/offline), and on `401` clears the token and notifies
listeners. It exports per-entity helpers: `authApi`, `usersApi`, `peopleApi`,
`ordersApi`, `markingsApi`, `expensesApi`.

🤖 **Analogy:** Retrofit interface + an OkHttp auth interceptor + a 401
authenticator, in one file.

### 3.2 Local mirror — [`src/db.js`](src/db.js) (Dexie)
Stores: `people`, `orders`, `markings`, `expenses`, `counters`, mirrored from the
server. Schema is versioned (currently **v6**); each `db.version(n)` is like a
Room migration (the v5 upgrade wrapped legacy single-product orders into the
`items[]` array). Also holds pure helpers: `jalaliDateKey`, `yymmPrefix`,
`deriveOrderStatus`, `computeWeights`, `newUid`.

> Records are stored as whole objects (NoSQL-ish). The schema string only lists
> the **primary key + indexes**, not every field.

### 3.3 Sync engine — [`src/hooks/useSyncEngine.js`](src/hooks/useSyncEngine.js)
Defines a `RESOURCES` list (people / orders / markings / expenses). For each, it
pulls `GET /<resource>?updatedAfter=<cursor>` and upserts changes into the Dexie
mirror (and deletes rows whose `deletedAt` is set), advancing a per-resource
cursor in `localStorage`. First run (no cursor) replaces the local set with the
server's. Runs on mount, every ~15s, and on `online`/`focus`.

🤖 **Analogy:** a periodic `WorkManager` job doing delta-pull into Room. Adding a
new server-backed entity = add one line to `RESOURCES` + a Dexie store + an API
helper.

### 3.4 The write pattern (copy this)
```js
const { order } = await ordersApi.update(id, patch); // server is authoritative
await db.orders.put(order);                           // mirror the canonical row
```
Reads stay on `useLiveQuery(() => db.orders.toArray())`. Offline writes throw
`ApiError(status:0)` — surface a "needs connection" message; don't fake success.

---

## 4. Settings: theme & currency — [`src/context/SettingsContext.jsx`](src/context/SettingsContext.jsx)
One context holds **theme** (`light`/`dark`) and **currency** (`RIAL`/`TOMAN`),
persisted in `localStorage`.
- **Theme**: sets `data-theme="dark"` on `<html>`; dark rules live in
  `src/index.css` (and per-page CSS). The off-screen PDF nodes deliberately stay
  light.
- **Currency**: money is **stored in Rial** everywhere. The context exposes
  `formatMoney(rial)`, `toRial(input)`, `fromRial(rial)` and `currencyLabel`.
  Inputs are entered in the active currency and converted to Rial on save. **The
  invoice is always Rial** (uses raw Rial, ignores the toggle).

🤖 **Analogy:** a `MaterialTheme`/`CompositionLocal` for theme + a money formatter
use-case, provided app-wide.

---

## 5. Screens (`src/pages/`)

- **Login** — username/password → `AuthContext.login`.
- **Payroll** (`Payroll.jsx`) — pure calculator (results not persisted); Jalali
  working-day math; insurance only on the insured base; non-insured
  additions/deductions; copy-net (always Rial); A5 salary-slip PDF (plain
  download). Currency comes from `SettingsContext`.
- **People** (`People.jsx`) — CRUD via `peopleApi`, mirrored to Dexie; opens
  **MarkingsManager** for customers.
- **MarkingsManager** (`components/`) — per-customer images; compresses
  (`utils/image.js`) and uploads via `markingsApi` (server saves a file, returns a
  URL).
- **Orders** — `Orders.jsx` (layout + segmented control + `<Outlet/>`),
  `SubmitOrder.jsx` (create/edit a multi-item order; server assigns id +
  `YYMMN`), `OrderList.jsx` (filterable), `OrderView.jsx` (per-item panels: state
  machine + timeline + weight reconciliation + pricing; **invoice PDF**).
- **Expenses** (`Expenses.jsx`) — add/edit/delete modal + filterable list
  (category/date/text) + total; amounts via `formatMoney`; shows "entered by".
- **Settings** (`Settings.jsx`) — theme toggle, currency, logout, and **admin**
  user management + DB backup/restore.

---

## 6. Domain rules cheat-sheet
- **Order item** (`orders.items[]`): `productName, quantity, material,
  thickness, diameter, markingId/markingName, platingColor, isHardened,
  hardeningIntensity, description, salePrice, unitCost, state, stateHistory[],
  weightOf10, producedTotalWeight`.
- **Workflow states** (`constants.js → ORDER_STATES`): ثبت شده → درحال ضرب →
  ارسال/بازگشت سختکاری → ارسال/بازگشت آبکاری → آماده تحویل. Free-select; each
  change appends `{state, date, totalWeight}`. Order "done" when all items READY.
- **Weights** (`computeWeights`): unit weight = `weightOf10/10` (grams); expected
  total = unit × qty; produced qty = `producedTotalWeight / unitWeight`.
- **Order number** `YYMMN` and **person id** `0-/1-/2-` are **server-assigned**.
- **Invoice** description: `{product} - سختکاری شده - پوشش گالوانیزه زرد/سفید
  {th}*{dia} mm - {desc}` (parts omitted when absent); amounts raw Rial, no label.

---

## 7. PDF pipeline
Render a hidden, off-screen styled node (A5-landscape slip / A4-portrait invoice)
→ `html2canvas` → image into `jsPDF` (contain-fit, centered) → `pdf.save()`
(plain download). It's a screenshot, so Persian/RTL render perfectly.

⚠️ Keep `.salary-slip` / `.invoice-sheet` **light** in dark mode. ⚠️ No ASCII
parentheses around Persian inside PDF nodes (html2canvas mirrors them wrong).

🤖 **Analogy:** drawing a Compose/`View` bitmap into a `PdfDocument` page.

---

## 8. Styling & dark mode
Plain CSS files imported per component (bundled globally by CRA). Tokens in
`:root`; dark overrides under `[data-theme="dark"]` (class-scoped — never bare
element selectors that would hit the PDF nodes). Native `<select>` dark mode:
paint `option { background-color; color }` explicitly (don't rely on
`color-scheme`, which broke Firefox/Zen). RTL: document is `dir="rtl"`; use
`dir="ltr"` locally on numeric fields and negative amounts.

---

## 9. Conventions & gotchas
- **Build fails on lint warnings** (`CI=true`). No unused imports/vars.
- **Money in Rial**, **dates Jalali `YYYYMMDD`**, **server-assigned IDs/numbers**.
- **Immutable updates** — rebuild arrays/objects; editing an order rebuilds
  `items[]` but preserves each item's `state/stateHistory/weight`.
- **Images compressed** before upload (`utils/image.js`).
- **PWA caching** — hard-refresh after deploy.
- **Deploy is local** (`npm run deploy:web|api`); **adding a table needs a
  phpMyAdmin step**. See [CLAUDE.md](CLAUDE.md) / [DEPLOY.md](DEPLOY.md).

---

## 10. Add a server-backed feature (worked example)
Add a "delivery note" entity:
1. **Backend**: `server/schema.sql` table; `server/routes/notes.php` (copy
   `expenses.php`); register routes in `server/index.php`.
2. **DB (live)**: run the new `CREATE TABLE` in phpMyAdmin.
3. **Client**: `notesApi` in `api/client.js`; add a `notes` Dexie store (bump
   `db.version`); add `notes` to `RESOURCES` in `useSyncEngine.js`.
4. **UI**: a page reading `useLiveQuery(db.notes…)` and writing via `notesApi`
   then `db.notes.put`.
5. **Verify**: `CI=true npm run build`, `npm run deploy:all`, import the table,
   test cross-device.

🤖 **Analogy:** add a Room entity (+migration), a Retrofit endpoint, a sync step,
and a screen — same shape, fewer layers.

---

## 11. File reference
| File | Responsibility |
| --- | --- |
| `src/index.js` | Mount + providers |
| `src/App.js` | Routes, login gate, sync bootstrap |
| `src/db.js` | Dexie schema/migrations + helpers |
| `src/constants.js` | Enums + Persian labels |
| `src/api/client.js` | HTTP + per-entity API objects + token |
| `src/auth/AuthContext.jsx` | Session/user, login/logout |
| `src/context/SettingsContext.jsx` | Theme + currency + money helpers |
| `src/hooks/useSyncEngine.js` | Delta-pull mirror sync |
| `src/utils/image.js` | Image compression |
| `src/components/` | BottomNav, MarkingsManager |
| `src/pages/*` | One screen each (+ `.css`) |
| `server/` | PHP API (see server/DOC.md) |
| `scripts/deploy.mjs` | Local FTPS deploy |
| `todo/` | Open feature plans |
