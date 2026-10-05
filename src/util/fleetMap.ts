/**
 * How a driver reads on the owner's live map.
 *
 * Two facts decide it and they are easy to conflate: **what the driver is
 * doing** (free, or on a job) and **how long ago we heard from them**. A pin is
 * a claim about where someone is right now, so a position from twenty minutes
 * ago has to look different from one from twenty seconds ago — otherwise the
 * owner dispatches the nearest dot on the screen to a job the person left the
 * area ten minutes ago.
 *
 * This matters more here than on most maps because of a deliberate platform
 * rule: **the driver app only reports position while carrying an order**, in
 * the foreground (spec §24). A driver who is online and free is not being
 * tracked at all — what we have is wherever their last delivery left them. So
 * "free" pins are almost always stale by design, and the map says so rather
 * than implying a live fleet we do not have.
 *
 * Pure so the colour and the wording are testable without a map, a key, or a
 * driver on the road.
 */

export type PinTone = 'free' | 'busy' | 'stale' | 'destination' | 'branch';

/**
 * How old a driver's last ping may be and still count as live.
 *
 * The app pings every 30 seconds while carrying an order, so five minutes is
 * ten missed ones — a lost signal, a backgrounded app, a flat battery — not
 * ordinary jitter.
 */
export const STALE_AFTER_MS = 5 * 60 * 1000;

export interface DriverPinInput {
  isAvailable: boolean;
  currentLatitude: number | string | null;
  currentLongitude: number | string | null;
  lastLocationAt?: string | null;
}

/**
 * A coordinate as a number, whatever shape it arrived in.
 *
 * The backend stores latitude and longitude as `Decimal` columns, and
 * **`Prisma.Decimal` serialises to a JSON string** — so `/drivers` shipped
 * `"24.72"` where this app's type said `number`. Google Maps does not accept a
 * string as a `LatLng`: the pin never landed, and the map sat on its
 * hard-coded fallback centre. That is what "the map opens somewhere random"
 * was, and it is fixed at the source (`backend/src/common/geo.ts`).
 *
 * This stays as well, deliberately. A browser already open on a counter is
 * running whatever bundle it loaded, and it has to survive both the old
 * backend and the new one — the same reason every read of the tracking payload
 * in the customer app is guarded rather than asserted.
 */
export function coordinate(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export interface DriverPinState {
  tone: PinTone;
  /** True when the last fix is recent enough to treat the pin as where they are. */
  live: boolean;
  /** "just now", "6 min ago", or null when they have never reported one. */
  seenLabel: string | null;
  /** What the owner should read off the pin without tapping it. */
  statusLabel: string;
}

export function driverPinState(driver: DriverPinInput, now: number = Date.now()): DriverPinState {
  const ageMs = ageOf(driver.lastLocationAt, now);
  const live = ageMs !== null && ageMs <= STALE_AFTER_MS;
  const seenLabel = relativeAge(ageMs);

  // Staleness outranks the job: a driver marked "on a job" whose last ping was
  // half an hour ago is not somewhere the owner should be reasoning about, and
  // colouring that pin the same as a live one is the whole failure mode.
  const tone: PinTone = !live ? 'stale' : driver.isAvailable ? 'free' : 'busy';

  const statusLabel = driver.isAvailable ? 'Free' : 'On a job';

  return { tone, live, seenLabel, statusLabel };
}

/** True when there is a real point to plot. `0,0` is the Atlantic, never Riyadh. */
export function hasPosition(driver: DriverPinInput): boolean {
  const lat = coordinate(driver.currentLatitude);
  const lng = coordinate(driver.currentLongitude);
  return lat !== null && lng !== null && !(lat === 0 && lng === 0);
}

/** "just now" · "6 min ago" · "2 h ago". Null when there is nothing to date. */
export function relativeAge(ageMs: number | null): string | null {
  if (ageMs === null || ageMs < 0) {
    return null;
  }
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 1) {
    return 'just now';
  }
  if (minutes < 60) {
    return `${minutes} min ago`;
  }
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours} h ago` : `${Math.floor(hours / 24)} d ago`;
}

const TONE_COLOURS: Record<PinTone, string> = {
  // Green reads "available" the world over; amber is a driver mid-job, which is
  // information rather than a warning; grey is deliberately quiet, because a
  // stale pin is the one the owner should trust least.
  free: '#2E9E5B',
  busy: '#F4701F',
  stale: '#98A2B3',
  destination: '#E5178B',
  branch: '#3D78C0',
};

/**
 * The marker graphic, as a data URI.
 *
 * A data URI rather than a hosted image or an `AdvancedMarker`: it needs no
 * Map ID, no extra network fetch and no Google namespace at render time, so the
 * map keeps working the moment a key is dropped in and nothing else has to be
 * configured in the cloud console first.
 *
 * With a label it draws a pill wide enough for the text, because a label is
 * only worth having if it is readable over a busy street map — dark text on a
 * white pill, not text laid straight onto the roads.
 */
export function pinIcon(tone: PinTone, label?: string): string {
  const colour = TONE_COLOURS[tone];

  if (!label) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22"><circle cx="11" cy="11" r="8" fill="${colour}" stroke="#fff" stroke-width="3"/></svg>`;
    return toDataUri(svg);
  }

  // ~6.5px per character at 11px semibold, plus room for the dot and padding.
  const width = Math.min(190, Math.max(64, Math.round(label.length * 6.5) + 34));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="26" viewBox="0 0 ${width} 26"><rect x="0.75" y="0.75" width="${width - 1.5}" height="24.5" rx="12.25" fill="#fff" stroke="${colour}" stroke-width="1.5"/><circle cx="14" cy="13" r="6" fill="${colour}"/></svg>`;
  return toDataUri(svg);
}

/** Encoded, not base64: an SVG data URI stays readable in a devtools panel. */
function toDataUri(svg: string): string {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function ageOf(iso: string | null | undefined, now: number): number | null {
  if (!iso) {
    return null;
  }
  const at = new Date(iso).getTime();
  return Number.isNaN(at) ? null : Math.max(0, now - at);
}


// ---------------------------------------------------------------------------
// Where the map should be looking
// ---------------------------------------------------------------------------

export interface LatLng {
  lat: number;
  lng: number;
}

export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

/** Riyadh. The only sensible guess when there is nothing at all to show. */
export const FALLBACK_CENTER: LatLng = { lat: 24.7136, lng: 46.6753 };

/**
 * The rectangle containing every point, or null when there are none.
 *
 * Deliberately does **not** handle the antimeridian. This platform operates in
 * one country; code for a wrap-around that cannot occur here would be untested
 * by anything real and is a worse liability than its absence.
 */
export function boundsOf(points: readonly LatLng[]): MapBounds | null {
  const first = points[0];
  if (!first) {
    return null;
  }
  return points.reduce<MapBounds>(
    (acc, p) => ({
      north: Math.max(acc.north, p.lat),
      south: Math.min(acc.south, p.lat),
      east: Math.max(acc.east, p.lng),
      west: Math.min(acc.west, p.lng),
    }),
    { north: first.lat, south: first.lat, east: first.lng, west: first.lng },
  );
}

/** The middle of the rectangle every point sits in. */
export function centerOf(points: readonly LatLng[]): LatLng {
  const b = boundsOf(points);
  if (!b) {
    return FALLBACK_CENTER;
  }
  return { lat: (b.north + b.south) / 2, lng: (b.east + b.west) / 2 };
}

/**
 * A zoom level that fits `bounds` in a viewport `heightPx` tall.
 *
 * Used for the **single-point** case and as the cap on a fit, because
 * `fitBounds` on one pin zooms to the maximum and puts a driver's street under
 * a magnifying glass with no context around it — an owner needs to see roughly
 * *where in the city* somebody is.
 *
 * The formula is the standard Web Mercator one: the world is 256px at zoom 0
 * and doubles per level, so the zoom that makes a span fill the viewport is
 * `log2(worldPx / spanPx)`. Latitude is projected first; longitude is linear.
 */
export function zoomForBounds(bounds: MapBounds, widthPx = 900, heightPx = 480): number {
  const WORLD_PX = 256;
  const MAX_ZOOM = 16;
  const MIN_ZOOM = 3;

  const latFraction = (mercatorY(bounds.north) - mercatorY(bounds.south)) / Math.PI;
  const lngFraction = (bounds.east - bounds.west) / 360;

  const latZoom = latFraction > 0 ? Math.log2(heightPx / WORLD_PX / latFraction) : MAX_ZOOM;
  const lngZoom = lngFraction > 0 ? Math.log2(widthPx / WORLD_PX / lngFraction) : MAX_ZOOM;

  const zoom = Math.floor(Math.min(latZoom, lngZoom));
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Number.isFinite(zoom) ? zoom : MAX_ZOOM));
}

function mercatorY(lat: number): number {
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const sin = Math.sin((clamped * Math.PI) / 180);
  return Math.log((1 + sin) / (1 - sin)) / 2;
}

/**
 * A stable fingerprint of *which* things are on the map, ignoring where they
 * are.
 *
 * This is what decides when the map is allowed to move itself. Refitting on
 * every poll would yank the view out from under an owner who had just zoomed
 * into a street — the page refreshes every eight seconds and a driver's
 * position changes on most of them. Refitting only when the set of pins changes
 * (someone came on shift, a delivery was dispatched, one finished) means the
 * map re-frames when there is genuinely something new to frame and holds still
 * the rest of the time.
 */
export function pinSetKey(ids: readonly string[]): string {
  return [...ids].sort().join('|');
}
