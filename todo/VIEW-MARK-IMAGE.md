# View marking image (lightbox)

## Goal
Let users open a marking's image full-size to inspect it. Small, standalone —
can ship anytime.

> Context: markings have an image `src` (URL). Thumbnails appear in
> [src/components/MarkingsManager.jsx](../src/components/MarkingsManager.jsx),
> the marking picker in [src/pages/SubmitOrder.jsx](../src/pages/SubmitOrder.jsx),
> and the marking detail in [src/pages/OrderView.jsx](../src/pages/OrderView.jsx).

## Tasks
- [ ] A simple image lightbox/modal: tap a marking thumbnail → overlay shows the full image (with the mark name); tap/Esc to close.
- [ ] Wire it where marks are shown: MarkingsManager tiles, the SubmitOrder marking picker, and the OrderView marking detail.
- [ ] Reuse the same lightbox for the new **product photo** ([`todo/ORDER-PRODUCTION-DETAILS.md`](./ORDER-PRODUCTION-DETAILS.md)) so both open the same way.
- **Files:** new `src/components/ImageLightbox.jsx` (+ small CSS), `src/components/MarkingsManager.jsx`, `src/pages/SubmitOrder.jsx`, `src/pages/OrderView.jsx`
- **Acceptance:** tapping a mark thumbnail opens the full image; closing returns to the page; works on mobile and in dark mode.
- **Status:** TODO
