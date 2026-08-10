# Order workflow: kilogram weights + new states + state notes

## Goal
Make production weights read in **kilograms** (with decimals), extend the
per-item workflow with the real delivery/packaging states the workshop uses,
and let each state change carry a free-text note. This is the data foundation
the Statistics page ([`todo/STATISTICS.md`](./STATISTICS.md)) and the
produced-quantity invoice ([`todo/INVOICE-PRODUCED.md`](./INVOICE-PRODUCED.md))
build on, so it ships first.

> Context: an order is a header + `items[]`; each item has `state`,
> `stateHistory[{state, date, totalWeight}]`, `weightOf10`, `producedTotalWeight`.
> See [src/pages/OrderView.jsx](../src/pages/OrderView.jsx),
> [src/db.js](../src/db.js) (`computeWeights`), [src/constants.js](../src/constants.js).

## Tasks

### 1. Kilogram input/display for batch weights
- [ ] In [src/pages/OrderView.jsx](../src/pages/OrderView.jsx): the **produced total weight** input and the **stage weight** input (on a state change) accept **kg with decimals** (`step="0.1"`, e.g. `0.5` = 500g). `weightOf10` stays in **grams** (a 10-piece sample is well under 1 kg).
- [ ] Keep storing all batch weights **canonically in grams** (multiply the kg input ×1000 on save, divide ÷1000 for display). This leaves `computeWeights` and existing records unchanged.
- [ ] `formatWeight` already shows kg ≥ 1000g — keep it for display everywhere (timeline, reconciliation).
- **Files:** `src/pages/OrderView.jsx` (and any weight display helper)
- **Acceptance:** entering `0.5` produced weight stores 500g and shows "۵۰۰ گرم"; entering `12` stores 12000g and shows "۱۲ کیلوگرم"; `weightOf10` is still grams.
- **Status:** TODO
> ASSUMPTION: storage stays grams (no migration). OPEN: confirm `weightOf10` truly stays grams while everything else is kg.

### 2. New workflow states
- [ ] Add to `ORDER_STATES` in [src/constants.js](../src/constants.js), after آماده تحویل:
  `PACKAGED` بسته‌بندی شده, `SENT_FREIGHT` تحویل به باربری, `DELIVERED_WORKSHOP` تحویل به مشتری از کارگاه, `DELIVERED_PLATING` تحویل به مشتری از آبکاری.
- [ ] `deriveOrderStatus` in [src/db.js](../src/db.js): an item counts as **done** once it reaches **READY or any later state** (packaged / freight / delivered are all "done" — READY and delivery are treated the same). So order done = every item's state index ≥ READY. Keep the existing pill wording.
- **Files:** `src/constants.js`, `src/db.js`, `src/pages/OrderList.jsx`, `src/pages/OrderView.jsx`
- **Acceptance:** the state dropdown offers all states; an order whose items are all READY-or-later shows as done.
- **Status:** TODO
> DECIDED: READY and the delivery states all count as "done" (treated the same).

### 3. Custom note on a state change
- [ ] Add an optional **note** input to the state-change form; store it on the history entry as `stateHistory[].note`.
- [ ] Show the note in the timeline under each entry.
- **Files:** `src/pages/OrderView.jsx` (items JSON already free-form; no backend change)
- **Acceptance:** changing a state with a note persists it and shows it in the item's timeline on all devices after sync.
- **Status:** TODO

## Verification
Create an order, set states through packaging + a delivery state with notes, enter produced weight in kg → reopen on another device and confirm states, notes, and kg weights match.
