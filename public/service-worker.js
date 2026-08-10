/* Minimal service worker — makes the app installable (Add to Home Screen,
 * standalone window) WITHOUT caching, so deploys are never served stale.
 * The fetch handler is a pass-through: requests go to the network as usual. */
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Present a fetch handler (required for installability) but don't intercept —
// letting the browser handle every request normally (always fresh).
self.addEventListener('fetch', () => {});
