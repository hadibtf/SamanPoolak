# Invoice: pre-invoice vs. produced-quantity invoice

## Goal
The exported invoice should reflect reality: if an order isn't finished, offer
a **pre-invoice** (پیش‌فاکتور); once produced, invoice the **actual produced
quantity** (the workshop usually makes slightly more than ordered), not the
ordered quantity. Depends on produced data from
[`todo/ORDER-WEIGHT-STATES.md`](./ORDER-WEIGHT-STATES.md).

> Context: invoice export lives in [src/pages/OrderView.jsx](../src/pages/OrderView.jsx)
> (`handleExportInvoice`, off-screen `.invoice-sheet`). Produced quantity is
> derivable: `producedTotalWeight / unitWeight` (already returned as
> `producedQuantity` by `computeWeights` in [src/db.js](../src/db.js)).

## Tasks

### 1. Completion check on export
- [ ] On "export invoice", determine if **every** item is produced/ready (state is READY or a later delivery/packaging state, and has a produced weight).
- [ ] If not complete: show a confirm — *"سفارش هنوز کامل تولید نشده. می‌خواهید پیش‌فاکتور صادر کنید؟"* — and if yes, export a clearly-marked **پیش‌فاکتور** (watermark/header label) using **ordered** quantities.
- [ ] Remind the user they can export again as the final invoice once items reach آماده تحویل.
- **Files:** `src/pages/OrderView.jsx`
- **Acceptance:** exporting an unfinished order prompts and produces a document headed «پیش‌فاکتور»; a finished order exports «فاکتور فروش» with no prompt.
- **Status:** TODO

### 2. Invoice the produced quantity
- [ ] For a produced item, use the **produced quantity** (rounded `producedTotalWeight / unitWeight`) as the invoice line quantity instead of the ordered quantity; line total = produced qty × unit price.
- [ ] If unit weight or produced weight is missing for an item, fall back to ordered quantity and note it (so it never silently shows 0).
- [ ] Keep amounts in **Rial** with no «ریال» labels (as already done).
- **Files:** `src/pages/OrderView.jsx`, `src/db.js` (`computeWeights` reused per item)
- **Acceptance:** an item ordered 1000 but produced 1030 (by weight) invoices 1030 × unit price; the grand total reflects produced quantities.
- **Status:** TODO
> OPEN: round produced quantity to the nearest piece (recommended) vs. floor. Confirm.

## Verification
1. Export before production → پیش‌فاکتور with ordered quantities.
2. Enter produced weights, set items READY → export → فاکتور فروش with produced quantities and matching totals.
