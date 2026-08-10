# Landing site — samanpoolak.ir

A standalone, static marketing page for **سامان پولک** (Saman Poolak), the
metal-stamping workshop that produces پولک / درپوش فلزی for vehicles. It is
**separate from the platform app** (`platform.samanpoolak.ir`) and the API
(`api.samanpoolak.ir`); it lives at the bare **samanpoolak.ir** domain.

- Pure HTML/CSS/JS — no build step and no framework. The quote form can submit
  directly to `api.samanpoolak.ir` or prepare WhatsApp/Telegram messages.
- **Bilingual** فارسی (RTL) + English, toggled client-side (the EN/فا button).
  Persian is the default and is baked into the HTML for SEO and no-JS visitors.
- Industrial/blueprint visual theme matching the brand blue + the product's
  white-zinc / yellow-zinc finishes.
- SEO: title/description/keywords, Open Graph + Twitter card, canonical,
  `robots.txt`, `sitemap.xml`, and JSON-LD (Organization + product list).

## Files

```
landing/
  index.html      markup + meta + JSON-LD (visible copy uses data-i18n keys)
  styles.css      the whole design system + animations + responsive rules
  script.js       contact config, shared copy, language toggle, quote sending
  robots.txt      search-engine directives
  sitemap.xml     single-page sitemap
  .htaccess       optional gzip/cache rules (NOT auto-deployed — merge by hand)
  assets/
    logo.png, favicon*           brand marks (copied from the app)
    fonts/Vazirmatn-*.ttf        bundled font (Regular/Medium/Bold)
    img/                         optimized product + machine imagery (webp)
```

## ⚠️ Before going live — fill in the real details

1. **Contact info** — edit the single `CONFIG` block at the top of
   [`script.js`](script.js): manager, technical SMS, office/WhatsApp number,
   Telegram handle, map link, and API URL.
2. **Address** — set the workshop address in the `TEXT` map in
   [`script.js`](script.js) and in the Organization JSON-LD in
   [`index.html`](index.html).
3. **Stats** — the numbers in the "stats" section (`data-count` / the Persian
   text) are reasonable placeholders (e.g. "۲M+ parts"); adjust to real figures.
4. **Social URLs** — also listed in the JSON-LD `sameAs` array.

Most visible user-facing copy lives once in the `TEXT` map in
[`script.js`](script.js). HTML elements reference it with `data-i18n` or
`data-i18n-placeholder`, so repeated labels stay easy to edit.

## Swapping in different product photos

The images in `assets/img/` were generated from the originals in
`Desktop/Samples/` and optimized (resized + compressed; the drawn product
render had its light background knocked out to transparent). To regenerate after
adding new source images, re-run the one-off script in the scratchpad
(`imgproc/process.mjs`, uses `sharp`). Keep the same output filenames and the
page picks them up with no other change. Target keeping each image well under
~350 KB.

## Deploying

From the project root (needs `deploy.env`, same as the app):

```bash
npm run deploy:landing   # uploads landing/ → samanpoolak.ir doc root over FTPS
```

- It uploads everything **except** `*.md` (this README) and `.htaccess`.
- Confirm `FTP_LANDING_DIR` in `deploy.env` matches the real doc-root dir of the
  samanpoolak.ir domain (default `samanpoolak.ir`). Check it in cPanel → Domains
  if unsure.
- After deploy, open `https://samanpoolak.ir/` and hard-refresh.

See the root [`DEPLOY.md`](../DEPLOY.md) for the hosting overview.
