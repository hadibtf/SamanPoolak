# Order production details: photo, packaging, double-sack

## Goal
Capture the real-world production details the workshop needs on an order item:
a photo of the finished product, packaging quantity with an auto weight
estimate, and the optional "double-sack" (جفت گونی) flag for out-of-town
shipments. Depends on the kg/weight work in
[`todo/ORDER-WEIGHT-STATES.md`](./ORDER-WEIGHT-STATES.md) for unit weight.

> Context: items carry `weightOf10` → unit weight = `weightOf10/10` (grams),
> already computed by `computeWeights` in [src/db.js](../src/db.js). Image
> upload already exists for markings (base64 → file on server, returns URL):
> see [server/routes/markings.php](../server/routes/markings.php) and
> [src/components/MarkingsManager.jsx](../src/components/MarkingsManager.jsx).

## Tasks

### 1. Product photo after production
- [ ] Add a per-item **product image** (the finished piece), uploaded the same way markings are: compress client-side ([src/utils/image.js](../src/utils/image.js)) → send base64 → server saves a file under `/uploads` → store the returned URL on `item.productImage`.
- [ ] Add a generic `POST /upload` route (or reuse the marking image saver factored out of [server/routes/markings.php](../server/routes/markings.php)) so it isn't tied to a customer.
- [ ] Show the photo in [src/pages/OrderView.jsx](../src/pages/OrderView.jsx) (and a thumbnail on the item card); the upload control lives in [src/pages/SubmitOrder.jsx](../src/pages/SubmitOrder.jsx) and/or the item panel in OrderView (since the photo is taken *after* production).
- **Files:** `server/routes/orders.php`/`upload.php`, `server/index.php`, `src/api/client.js`, `src/utils/image.js`, `src/pages/SubmitOrder.jsx`, `src/pages/OrderView.jsx`
- **Acceptance:** attach a photo to a produced item → it uploads, the URL persists in `items[]`, and the image shows on every device after sync.
- **Status:** TODO
> OPEN: is the product photo best added on the OrderView item panel (post-production) rather than the create form? Recommended: both, but primary entry on OrderView.

### 2. Packaging quantity + expected package weight
- [ ] Per item: `packagingSize` (default **1000**) with an option to enter a **custom** quantity (e.g. 750).
- [ ] Compute and display **expected weight per package** = `packagingSize × unitWeight` (unit weight from `weightOf10/10`), shown in kg. Also show number of full packages for the order quantity.
- [ ] Surface this in OrderView (and optionally SubmitOrder) near the weight reconciliation.
- **Files:** `src/db.js` (extend `computeWeights` or a new `computePackaging` helper), `src/pages/OrderView.jsx`, `src/pages/SubmitOrder.jsx`
- **Acceptance:** with unit weight known, setting packaging to 750 shows the expected kg of a 750-piece bag; default is 1000.
- **Status:** TODO

### 3. جفت گونی (double-sack) flag
- [ ] Optional **order-level** boolean, **off by default**, for out-of-town shipments. iOS-style toggle on the order header in [src/pages/SubmitOrder.jsx](../src/pages/SubmitOrder.jsx).
- [ ] Show it on OrderView; include it where relevant (e.g. packaging summary / future shipping note).
- **Files:** `src/pages/SubmitOrder.jsx`, `src/pages/OrderView.jsx`, `server/routes/orders.php` (add `jaftGooni` to the order header wire/columns)
- **Acceptance:** the flag defaults off, can be toggled on, and persists/syncs.
- **Status:** TODO
> DECIDED: جفت گونی is per-order (whole shipment).

## Verification
On a produced order: attach a product photo, set packaging to 750 and confirm the expected bag weight, toggle جفت گونی on → all persist and appear on a second device.
