/**
 * Registers the service worker that makes this panel installable.
 *
 * Chrome will not offer "Install" without one that has a fetch handler, and an
 * installed panel is the point: pinned to a taskbar, opened like an application,
 * distinguishable from the customer app by its own icon.
 *
 * Three deliberate limits:
 *
 * - **Production only.** A service worker in front of the Vite dev server
 *   intercepts module requests and turns hot reload into a debugging session
 *   about caching.
 * - **After `load`.** Registration competes with the app's first data fetches
 *   otherwise, and the panel's first paint matters more than installability.
 * - **A failure is swallowed.** Unsupported browser, an insecure origin, a
 *   blocked scope — none of it should reach a user, because none of it affects
 *   the panel working. The only thing lost is the install button.
 *
 * `public/sw.js` documents what it does and does not cache. The short version:
 * it never touches an API response, because a stale order queue is worse than
 * one that fails to load.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) {
    return;
  }
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Deliberately silent — see above.
    });
  });
}
