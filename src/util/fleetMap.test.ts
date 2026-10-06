import { describe, expect, it } from 'vitest';

import {
  FALLBACK_CENTER,
  boundsOf,
  centerOf,
  coordinate,
  driverPinState,
  hasPosition,
  pinIcon,
  pinSetKey,
  relativeAge,
  STALE_AFTER_MS,
  zoomForBounds,
} from './fleetMap';

const NOW = new Date('2026-09-04T12:00:00.000Z').getTime();
const ago = (ms: number) => new Date(NOW - ms).toISOString();

const driver = (overrides: Partial<Parameters<typeof driverPinState>[0]> = {}) => ({
  isAvailable: true,
  currentLatitude: 24.71,
  currentLongitude: 46.67,
  lastLocationAt: ago(20_000),
  ...overrides,
});

describe('driverPinState', () => {
  it('separates a free driver from one on a job', () => {
    expect(driverPinState(driver({ isAvailable: true }), NOW).tone).toBe('free');
    expect(driverPinState(driver({ isAvailable: false }), NOW).tone).toBe('busy');
    expect(driverPinState(driver({ isAvailable: false }), NOW).statusLabel).toBe('On a job');
  });

  it('greys out a position we have not heard about in minutes', () => {
    // The failure this prevents: an owner dispatching the nearest dot on the
    // screen to a job the driver left the area ten minutes ago.
    const stale = driverPinState(driver({ lastLocationAt: ago(STALE_AFTER_MS + 60_000) }), NOW);

    expect(stale.tone).toBe('stale');
    expect(stale.live).toBe(false);
    expect(stale.seenLabel).toBe('6 min ago');
  });

  it('lets staleness outrank the job, not the other way round', () => {
    // A driver still marked "on a job" whose last ping was half an hour ago is
    // not somewhere to reason from, however busy the record says they are.
    const state = driverPinState(
      { isAvailable: false, currentLatitude: 24.7, currentLongitude: 46.6, lastLocationAt: ago(30 * 60_000) },
      NOW,
    );

    expect(state.tone).toBe('stale');
    expect(state.statusLabel).toBe('On a job');
  });

  it('treats a driver who has never reported as stale, not as live at 0,0', () => {
    const state = driverPinState(driver({ lastLocationAt: null }), NOW);

    expect(state.tone).toBe('stale');
    expect(state.seenLabel).toBeNull();
  });
});

describe('hasPosition', () => {
  it('rejects a missing position and the 0,0 default', () => {
    expect(hasPosition(driver())).toBe(true);
    expect(hasPosition(driver({ currentLatitude: null }))).toBe(false);
    expect(hasPosition(driver({ currentLatitude: 0, currentLongitude: 0 }))).toBe(false);
  });
});

describe('relativeAge', () => {
  it('reads the way someone would say it', () => {
    expect(relativeAge(10_000)).toBe('just now');
    expect(relativeAge(7 * 60_000)).toBe('7 min ago');
    expect(relativeAge(3 * 3_600_000)).toBe('3 h ago');
    expect(relativeAge(50 * 3_600_000)).toBe('2 d ago');
    expect(relativeAge(null)).toBeNull();
  });
});

describe('pinIcon', () => {
  it('gives every state its own colour', () => {
    const colours = (['free', 'busy', 'stale', 'destination', 'branch'] as const).map((tone) =>
      pinIcon(tone),
    );

    expect(new Set(colours).size).toBe(colours.length);
    for (const icon of colours) {
      expect(icon.startsWith('data:image/svg+xml')).toBe(true);
    }
  });

  it('widens the pill to fit its label, within bounds', () => {
    const short = pinIcon('busy', '1000001');
    const long = pinIcon('busy', 'Mohammed Al-Harbi · 1000001');

    expect(widthOf(long)).toBeGreaterThan(widthOf(short));
    // Capped: a label long enough to cover half the city helps nobody.
    expect(widthOf(pinIcon('busy', 'x'.repeat(200)))).toBeLessThanOrEqual(190);
  });
});

function widthOf(dataUri: string): number {
  const svg = decodeURIComponent(dataUri.replace('data:image/svg+xml;charset=UTF-8,', ''));
  const match = /width="(\d+)"/.exec(svg);
  return match ? Number(match[1]) : 0;
}

describe('coordinate', () => {
  it('reads the Decimal string a backend may still be sending', () => {
    // `Prisma.Decimal` serialises to a JSON string, so `/drivers` shipped
    // `"24.72"` where the type said `number`. Google Maps does not accept a
    // string as a LatLng — the pin never landed and the map stayed on its
    // fallback centre, which is what "the map opens somewhere random" was.
    expect(coordinate('24.7241234')).toBeCloseTo(24.7241234, 7);
    expect(coordinate(46.68)).toBe(46.68);
  });

  it('refuses anything that is not a number, rather than yielding NaN', () => {
    expect(coordinate(null)).toBeNull();
    expect(coordinate(undefined)).toBeNull();
    expect(coordinate('')).toBeNull();
    expect(coordinate('not a coordinate')).toBeNull();
  });

  it('treats a stringly-typed 0,0 as no position, same as the numeric one', () => {
    expect(
      hasPosition({ isAvailable: true, currentLatitude: '0', currentLongitude: '0' }),
    ).toBe(false);
    expect(
      hasPosition({ isAvailable: true, currentLatitude: '24.72', currentLongitude: '46.68' }),
    ).toBe(true);
  });
});

describe('where the map looks', () => {
  const riyadh = { lat: 24.7136, lng: 46.6753 };
  const jeddah = { lat: 21.4858, lng: 39.1925 };

  it('has no bounds for no points', () => {
    expect(boundsOf([])).toBeNull();
    expect(centerOf([])).toEqual(FALLBACK_CENTER);
  });

  it('covers every point', () => {
    expect(boundsOf([riyadh, jeddah])).toEqual({
      north: riyadh.lat,
      south: jeddah.lat,
      east: riyadh.lng,
      west: jeddah.lng,
    });
  });

  it('centres between them, not on the first one', () => {
    const c = centerOf([riyadh, jeddah]);
    expect(c.lat).toBeCloseTo((riyadh.lat + jeddah.lat) / 2, 6);
    expect(c.lng).toBeCloseTo((riyadh.lng + jeddah.lng) / 2, 6);
  });

  it('zooms out for a wide span and in for a tight one', () => {
    const wide = boundsOf([riyadh, jeddah])!;
    const tight = boundsOf([riyadh, { lat: 24.72, lng: 46.68 }])!;
    expect(zoomForBounds(wide)).toBeLessThan(zoomForBounds(tight));
  });

  it('never returns a zoom outside what a street map can use', () => {
    const single = boundsOf([riyadh])!;
    const zoom = zoomForBounds(single);
    expect(zoom).toBeGreaterThanOrEqual(3);
    expect(zoom).toBeLessThanOrEqual(16);
  });

  it('changes its key only when the set of pins changes, not their order', () => {
    // This is what stops the map re-framing itself every eight seconds while
    // someone is trying to look at a street.
    expect(pinSetKey(['a', 'b'])).toBe(pinSetKey(['b', 'a']));
    expect(pinSetKey(['a', 'b'])).not.toBe(pinSetKey(['a', 'b', 'c']));
  });
});
