# Developer guide (DOC.md)

How the **front-end** is built and why, for a developer new to React/web but
comfortable with **Android (Kotlin, Compose, Room)**. "🤖 Android analogy"
callouts map web ideas to things you know. For the API see
[server/DOC.md](server/DOC.md); for hosting see [DEPLOY.md](DEPLOY.md);
for the AI agent operational map see [MASTERCONTEXT.md](MASTERCONTEXT.md).

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
| `fetch` wrapper (`api/client.js`) | Retrofit + an `AuthInterceptor` | HTTP with the bearer token attached. |
| Vite | Gradle + AGP | `npm start` ≈ run; `npm run build` ≈ release. |

### The big shift from MVVM
There is **no ViewModel/Repository layer and no Redux**. The architecture is:

```text
React screen → src/api/client.js → authenticated PHP API → MySQL/MariaDB
```

The server is authoritative. Screen reads live only in React memory and refresh
on entry/focus/reconnect; confirmed writes update that state from canonical API
responses or refetch the affected query. There is no persistent browser database
or background mirror. Offline reload does not restore business records.
Production summaries use the same direct API model with narrowly scoped polling.
See [employee production](MASTERCONTEXT.md#employee-production) for domain rules.

🤖 **Analogy:** Retrofit requests updating Compose state, with lifecycle-aware
refresh and no Room cache.

---

## 2. Boot & auth gate

`src/index.jsx` selects the employee app at build time when
`VITE_APP_SURFACE=employee`; otherwise it loads the management app shown
below. Employee routes are `/tasks` (single-open production-list accordion) and
`/statistics`. Its login reuses the platform presentation with title
«سامانه آمار تولید کارکنان», without management links or routes. Employee login
credentials are maintained through the management People add/edit screen.

```
src/index.jsx
  └ <SettingsProvider>            theme + currency (also themes the login screen)
      └ <BrowserRouter>
          └ <AuthProvider>        validates a stored token, exposes user/login/logout
              └ <App/>            if no user → <Login/>; else <AppShell/> (routes + nav)
```

- [`src/auth/AuthContext.jsx`](src/auth/AuthContext.jsx): on mount, validates the
  saved token via `GET /auth/me`; exposes `{ user, loading, login, logout }`. A
  global 401 (from the API client) forces logout.
- [`src/App.jsx`](src/App.jsx): shows a splash while validating, the **Login**
  screen when unauthenticated, otherwise the routed app. Calendar refresh and the
  temporary legacy-data cleanup run inside the authenticated management shell.

🤖 **Analogy:** `AuthProvider` ≈ a session manager; the login gate ≈ an auth
`NavGraph` start-destination guard.

---

## 3. The data layer

### 3.1 API client — [`src/api/client.js`](src/api/client.js)
A `fetch` wrapper that prefixes `VITE_API_URL`, attaches
`Authorization: Bearer <token>`, parses JSON, throws a typed `ApiError`
(`status: 0` means network/offline), and on `401` clears the token and notifies
listeners. It exports per-entity helpers: `authApi`, `usersApi`, `peopleApi`,
`ordersApi`, `markingsApi`, `expensesApi`, and `productionApi`.

🤖 **Analogy:** Retrofit interface + an OkHttp auth interceptor + a 401
authenticator, in one file.

### 3.2 Screen data — `src/hooks/useApiQuery.js`
`useApiQuery(loader, [routeId, filter])` owns request state in each mounted screen.
It exposes `data`, `loading`, `error`, `refresh` and `setData`, refreshes on
entry/focus/reconnect, and ignores responses superseded by another route/filter,
request, canonical write, or unmount. `ApiReadStatus` presents Persian loading,
error and retry UI. Do not hide failed requests behind empty-state messages.
Attendance reads are filtered by card/date on PHP; count-only reads avoid loading
scan history for the list header. Markings can be scoped to a customer.

### 3.3 Domain helpers — `src/domain.js`
`jalaliDateKey`, `deriveOrderStatus`, `computeWeights`, and `newUid` are pure
storage-neutral helpers. Person IDs and order numbers are assigned by the API;
order edits preserve item UIDs and server-owned workflow/weight fields.

### 3.4 The write pattern
```js
const { order } = await ordersApi.update(id, patch);
orderQuery.setData(order);
```
For a list, update/remove its row only after API confirmation, or call `refresh()`.
Surface failed writes; attendance has no local fallback. Keep calendar/theme/
currency preferences in localStorage, never business record mirrors. Optional
`updatedAfter` API support remains compatible with older deployed clients.

### 3.5 Cleanup release
The temporary `legacyDataCleanup.js` shim only inspects, exports, and deletes
`BusinessPlatformDB`. Device-only attendance, employee names and card links require
an exported backup acknowledged as saved before deletion. Counters are obsolete.
Other tabs can block deletion; close them and reload/retry. Only known mirror
cursor/revision preferences are removed. See [migration audit](docs/REMOVE-DEXIE-AUDIT.md).

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
- **Human Resources** (`HumanResources.jsx`) — pure calculator (results not persisted); Jalali
  working-day math; insurance only on the insured base; non-insured
  additions/deductions; copy-net (always Rial); A5 salary-slip PDF (plain
  download). Its tabs include attendance, payroll settings, and job applications.
  Currency comes from `SettingsContext`.
- **People** (`People.jsx`) — CRUD via `peopleApi` and screen state; available
  from the People tab in Settings & Information; opens
  **MarkingsManager** for customers.
- **MarkingsManager** (`components/`) — per-customer images; compresses
  (`utils/image.js`) and uploads via `markingsApi` (server saves a file, returns a
  URL).
- **Management** — `Management.jsx` (layout + segmented control + `<Outlet/>`),
  `SubmitOrder.jsx` (create/edit a multi-item order; server assigns id +
  `YYMMN`), `OrderList.jsx` (filterable), `OrderView.jsx` (per-item panels: state
  machine + timeline + weight reconciliation + pricing; **invoice PDF**), and
  the Inquiries tab (`Inquiries.jsx`).
- **Expenses** (`Expenses.jsx`) — add/edit/delete modal + filterable list
  (category/date/text) + total; amounts via `formatMoney`; shows "entered by".
- **Settings & Information** (`SettingsInfo.jsx`) — theme toggle, currency,
  logout, and **admin** user management + DB backup/restore; its People tab
  renders the people directory.

---

## 6. Domain rules cheat-sheet
- **Order item** (`orders.items[]`): `productName, quantity, material,
  thickness, diameter, markingId/markingName, platingColor, isHardened,
  hardeningIntensity, description, salePrice, unitCost, state, stateHistory[],
  weightOf10, producedTotalWeight, productionStopped`.
- **Workflow states** (`constants.js → ORDER_STATES`): ثبت شده → درحال ضرب → تولید تکمیل شد →
  ارسال/بازگشت سختکاری → ارسال/بازگشت آبکاری → آماده تحویل. Free-select; each
  change appends `{state, date, totalWeight}`. Order "done" when all items READY.
- **Production stop**: after production exceeds the order quantity, manager
  confirmation sets `productionStopped` and `PRODUCTION_COMPLETE`, then prevents
  further assignment and production entries for that item.
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
Plain CSS files imported per component (bundled globally by Vite). Tokens in
`:root`; dark overrides under `[data-theme="dark"]` (class-scoped — never bare
element selectors that would hit the PDF nodes). Native `<select>` dark mode:
paint `option { background-color; color }` explicitly (don't rely on
`color-scheme`, which broke Firefox/Zen). RTL: document is `dir="rtl"`; use
`dir="ltr"` locally on numeric fields and negative amounts.

---

## 9. Conventions & gotchas
- **Build:** `npm run build:platform` writes to `dist/platform/` and
  `npm run build:employee` writes to `dist/employee/`; `npm run build` aliases
  the platform build. Run `npm test` for Vitest checks.
- **Money in Rial**, **dates Jalali `YYYYMMDD`**, **server-assigned IDs/numbers**.
- **Immutable updates** — rebuild arrays/objects; editing an order rebuilds
  `items[]` but preserves each item's `state/stateHistory/weight`.
- **Images compressed** before upload (`utils/image.js`).
- **PWA caching** — hard-refresh after deploy.
- **Deploy is local** (`npm run deploy:web|api`); **adding a table needs a
  phpMyAdmin step**. See [MASTERCONTEXT.md](MASTERCONTEXT.md) / [DEPLOY.md](DEPLOY.md).

---

## 10. Add a server-backed feature (worked example)
Add a "delivery note" entity:
1. **Backend**: `server/schema.sql` table; `server/routes/notes.php` (copy
   `expenses.php`); register routes in `server/index.php`.
2. **DB (live)**: run the new `CREATE TABLE` in phpMyAdmin.
3. **Client**: add `notesApi` in `api/client.js`.
4. **UI**: read with `useApiQuery`, show loading/errors/empty state, write via
   `notesApi`, then use canonical state or refresh.
5. **Verify**: tests and both builds, followed by authorized deployment and
   cross-device entry/focus refresh checks.

🤖 **Analogy:** add a Retrofit endpoint and a Compose screen with request state.

---

## 11. File reference
| File | Responsibility |
| --- | --- |
| `src/index.jsx` | Mount + providers |
| `src/App.jsx` | Routes, login gate, calendar bootstrap |
| `src/domain.js` | Pure date, weight and order helpers |
| `src/constants.js` | Enums + Persian labels |
| `src/api/client.js` | HTTP + per-entity API objects + token |
| `src/auth/AuthContext.jsx` | Session/user, login/logout |
| `src/context/SettingsContext.jsx` | Theme + currency + money helpers |
| `src/hooks/useApiQuery.js` | Memory-only screen API state and refresh |
| `src/utils/image.js` | Image compression |
| `src/components/` | BottomNav, MarkingsManager |
| `src/pages/*` | One screen each (+ `.css`) |
| `server/` | PHP API (see server/DOC.md) |
| `scripts/deploy.mjs` | Local FTPS deploy |
| `todo/` | Open feature plans |
