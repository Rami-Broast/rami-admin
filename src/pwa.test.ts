import { describe, expect, it } from 'vitest';

// Read through Vite rather than Node's filesystem. This repo deliberately has
// no `@types/node` — `vite.config.ts` declares the one global it needs rather
// than pulling in the package — and `?raw` / `?url` need neither. They also buy
// something a filesystem read would not: Vite resolves these at transform time,
// so a manifest naming an icon that does not exist fails to compile the test
// rather than failing an assertion inside it.
import swSource from '../public/sw.js?raw';
import manifestRaw from '../public/manifest.webmanifest?raw';
import icon192 from '../public/icon-192.png?url';
import icon512 from '../public/icon-512.png?url';
import maskable192 from '../public/icon-maskable-192.png?url';
import maskable512 from '../public/icon-maskable-512.png?url';

/**
 * The install button is the feature, and losing it is silent.
 *
 * Nothing about a broken manifest produces an error: no build fails, no page
 * blanks, no request 404s where anyone is looking. Chrome simply stops offering
 * "Install", and the only person who finds out is an owner who tried to pin the
 * panel to their taskbar and could not — with no way to connect it to the commit
 * that renamed an icon.
 *
 * So these assert the specific facts Chrome's installability check reads.
 *
 * What they do **not** check is that each PNG is the pixel size it claims —
 * that needs the file's bytes, and the value was not worth a types package for
 * the whole of Node. `scripts/generate-icons.py` emits the sizes from one list
 * and prints what it wrote, which is where a wrong size would show.
 */

const manifest = JSON.parse(manifestRaw) as {
  name: string;
  short_name: string;
  start_url: string;
  display: string;
  theme_color: string;
  icons: { src: string; sizes: string; type: string; purpose: string }[];
  shortcuts: { name: string; url: string }[];
};

describe('the web app manifest', () => {
  it('carries the fields Chrome requires before it offers Install', () => {
    expect(manifest.name).toBeTruthy();
    expect(manifest.short_name).toBeTruthy();
    expect(manifest.start_url).toBe('/');
    // Anything other than standalone/fullscreen and it opens as a tab, which is
    // the whole thing installing was meant to avoid.
    expect(['standalone', 'fullscreen']).toContain(manifest.display);
    expect(manifest.theme_color).toBe('#752E2A');
  });

  it('declares both required icon sizes, at both purposes', () => {
    const any = manifest.icons.filter((i) => i.purpose === 'any');
    const maskable = manifest.icons.filter((i) => i.purpose === 'maskable');

    for (const set of [any, maskable]) {
      expect(set.map((i) => i.sizes).sort()).toEqual(['192x192', '512x512']);
    }
    // A maskable icon is not optional dressing: without one, Android and Chrome
    // letterbox the "any" icon into a white pillbox inside the mask.
    expect(maskable).toHaveLength(2);
  });

  it('names icons that resolve — the imports above fail the build otherwise', () => {
    // Each import is a real file lookup. Listing them against the manifest is
    // what ties the two together: rename an icon and either the import breaks
    // or this comparison does.
    const resolved = [icon192, icon512, maskable192, maskable512];
    for (const url of resolved) {
      expect(url).toBeTruthy();
    }
    expect(manifest.icons.map((i) => i.src).sort()).toEqual([
      '/icon-192.png',
      '/icon-512.png',
      '/icon-maskable-192.png',
      '/icon-maskable-512.png',
    ]);
  });

  it('only offers shortcuts both roles can actually open', () => {
    // Shortcuts are static in the manifest and cannot know who is signed in, so
    // an owner-only route here sends every branch admin who uses it to the
    // <OwnerOnly> explainer. These three sit outside <OwnerOnly> in App.tsx.
    expect(manifest.shortcuts.map((s) => s.url)).toEqual([
      '/new-orders',
      '/kitchen',
      '/orders',
    ]);
  });
});

describe('the service worker', () => {
  it('has a fetch handler, which is what makes the app installable at all', () => {
    expect(swSource).toMatch(/addEventListener\(\s*'fetch'/);
  });

  it('never caches an API response', () => {
    // The rule this file exists to protect: a branch reading a cached order
    // queue mid-service is worse than one that fails to load, because a failure
    // is obvious and a stale queue looks like a quiet evening.
    //
    // The only thing read back out of a cache is the offline page.
    const cachedReads = swSource.match(/caches\.match\(([^)]*)\)/g) ?? [];
    expect(cachedReads).toEqual(['caches.match(OFFLINE_URL)']);

    expect(swSource).toContain('const SHELL = [OFFLINE_URL');
    // Non-navigation requests must fall through untouched, so there is exactly
    // one call — the navigate branch. Matched on the call rather than the bare
    // word, which also appears in the comment explaining the rule.
    expect(swSource.match(/event\.respondWith\(/g) ?? []).toHaveLength(1);
  });

  it('takes over immediately on a new deploy', () => {
    // A panel pinned to a stale bundle would report a stale commit in its own
    // build marker — the one signal meant to settle "is this the fixed build?".
    expect(swSource).toContain('skipWaiting');
    expect(swSource).toContain('clients.claim');
  });
});
