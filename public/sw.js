/**
 * Service worker for the admin panel.
 *
 * It exists for **installability**, not for offline. Chrome will not offer
 * "Install" without a registered service worker that has a fetch handler, and
 * an installed panel is the point: an owner or a branch pins it to the taskbar
 * and opens it like an application rather than hunting for a tab.
 *
 * ## It caches nothing that can go stale, and that is the whole design
 *
 * This panel shows live orders. A branch reading a cached order queue mid-service
 * is worse than one that fails to load: a failure is obvious and someone
 * refreshes, whereas a stale queue looks exactly like a quiet evening. The same
 * reasoning the Branch POS applies to its polling floor applies here — so:
 *
 * - **API requests are never intercepted.** Anything that is not a same-origin
 *   GET falls straight through to the network, untouched. There is no code path
 *   in this file that can serve an order, a report or a total from a cache.
 * - **Documents are network-first.** This is a Vite SPA whose asset filenames
 *   carry content hashes, so a cached `index.html` would keep pointing at
 *   bundles that no longer exist after a deploy — a white screen that a reload
 *   cannot fix. The network answers, or the offline page does.
 * - **The only cached thing is the offline page and the icons**, which are
 *   static and carry no data.
 *
 * ## Updates take effect immediately
 *
 * `skipWaiting` + `clients.claim` mean a new deploy takes over on the next load
 * rather than waiting for every window to close. A panel pinned to a month-old
 * bundle, reporting a stale commit in its own build marker, is the support call
 * this avoids. The trade — a reload mid-session if a deploy lands while someone
 * is working — is the safer side for a tool whose numbers have to be current.
 */

const VERSION = 'admin-shell-v1';
const OFFLINE_URL = '/offline.html';

// Static, dataless, and safe to hold: the offline page and what it renders.
const SHELL = [OFFLINE_URL, '/icon-192.png', '/favicon-32.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      // Individually, so one 404 during a partial deploy cannot fail the whole
      // install and leave the panel with no service worker at all.
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Navigations: always the network. On failure, the offline page — so an
  // installed window shows our own message rather than the browser's error,
  // which in a standalone window has no address bar to explain itself.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_URL).then((cached) => cached ?? Response.error()),
      ),
    );
    return;
  }

  // Everything else — including every API call — is left alone. Returning
  // without calling respondWith hands the request back to the browser
  // untouched, which is exactly what a panel showing live money should do.
});
