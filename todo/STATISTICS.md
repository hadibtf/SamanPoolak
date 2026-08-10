# Statistics & reports page

## Goal
A dedicated **آمار** screen (its own bottom-nav tab) summarising production,
shipments, and sales, with drill-down detail lists and a customer pie chart.
Builds on the weight/state data captured in
[`todo/ORDER-WEIGHT-STATES.md`](./ORDER-WEIGHT-STATES.md), so it ships after it.

> Context: all orders are mirrored locally in Dexie (`db.orders`), synced from
> the server, so stats can be computed client-side over `items[].stateHistory`
> (state, date, totalWeight) and item pricing. Jalali months via
> `react-date-object`. Bottom nav: [src/components/BottomNav.jsx](../src/components/BottomNav.jsx).

## Tasks

### 1. Route + entry point (via Settings, not the bottom nav for now)
- [ ] Add a `/stats` route in [src/App.js](../src/App.js) → new `src/pages/Stats.jsx` + `Stats.css`.
- [ ] **Do not add a bottom-nav tab yet.** Instead, add an **«آمار و گزارش‌ها»** button in [src/pages/Settings.jsx](../src/pages/Settings.jsx) that navigates to `/stats`. (A dedicated nav slot / better placement is a later design decision.)
- **Files:** `src/App.js`, `src/pages/Settings.jsx`, `src/pages/Stats.jsx`, `src/pages/Stats.css`
- **Status:** TODO
> DECIDED: reached from a button in Settings for now; no new bottom-nav tab.

### 2. Shipment totals (plating / hardening) with drill-down
- [ ] Card: **مجموع ارسال به آبکاری (وزن)** = sum of `totalWeight` over all items' history entries with state `SENT_PLATING`. Tapping it opens a list: date, customer, product, weight.
- [ ] Same card for **سختکاری** (`SENT_HARDENING`).
- [ ] Weights shown in kg.
- **Files:** `src/pages/Stats.jsx`
- **Acceptance:** totals equal the sum of recorded send-weights; the detail list matches individual history entries.
- **Status:** TODO

### 3. Monthly production
- [ ] Group produced output by Jalali month, using **the date the item reached آماده تحویل (READY)** (the timestamp of that `stateHistory` entry) — totals by weight and quantity, with a per-month detail list.
- **Files:** `src/pages/Stats.jsx`
- **Status:** TODO
> DECIDED: "produced in month X" = the date the item hit READY.

### 4. Monthly sales + customer pie chart
- [ ] Monthly sales total (Σ produced/ordered qty × unit price, Rial) with a detail list of orders.
- [ ] **Pie chart** of orders per customer (to see the biggest customer) — by order count and/or sales value. Rendered as a **hand-rolled SVG** (no charting dependency).
- **Files:** `src/pages/Stats.jsx`
- **Status:** TODO
> DECIDED: hand-rolled SVG pie, no chart library.

### 5. Monthly report summary
- [ ] A month picker producing a one-screen summary: produced weight/qty, sent-to-plating/hardening weight, sales total, top customer, order count.
- **Files:** `src/pages/Stats.jsx`
- **Status:** TODO

### Possible additions (suggestions)
- Material breakdown (آهن vs استیل) by weight/qty.
- Plating breakdown (زرد/سفید/بدون).
- Average production "shrinkage" — produced vs. expected quantity from weight.
- Outstanding orders (not yet delivered) and their value.
- Per-employee «ثبت‌کننده» order counts.

## Verification
With several orders across months and recorded send/produce weights, the totals on آمار match manual sums; tapping a total shows the matching detail rows; the pie chart proportions match per-customer order counts.
