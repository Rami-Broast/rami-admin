import { APIProvider, Map, Marker, useMap } from '@vis.gl/react-google-maps';
import React from 'react';

import { GOOGLE_MAPS_API_KEY } from '../api/config';
import {
  FALLBACK_CENTER,
  PinTone,
  boundsOf,
  centerOf,
  pinIcon,
  pinSetKey,
  zoomForBounds,
} from '../util/fleetMap';

export interface MapPin {
  id: string;
  lat: number;
  lng: number;
  title?: string;
  /** Decides the pin's colour. Defaults to a destination pin. */
  tone?: PinTone;
  /** Drawn on the pin itself. Reserve it for what the owner needs at a glance. */
  label?: string;
}

/**
 * The live fleet map: who is out, where, and how fresh that is.
 *
 * Every pin used to be the same red Google marker, so a free driver, a driver
 * mid-delivery, a position from twenty minutes ago and a customer's front door
 * were indistinguishable until you clicked each one. On a screen whose whole
 * job is "tell me the state of the fleet at a glance", that is no better than
 * a list.
 *
 * Pins are now coloured by state and the busy ones carry a label, so the map
 * answers the question before anyone taps anything. The colour rule itself is
 * pure and tested in `util/fleetMap.ts`.
 *
 * **Cost note.** Google bills the Maps JavaScript API per *map load*, not per
 * marker or per refresh — so this component must stay mounted while Live Ops
 * polls. Re-mounting it on every refresh would turn one billed load into one
 * every eight seconds.
 *
 * **It opens where the fleet is.** The map used to take a `defaultCenter` — and
 * `defaultCenter` is read once, at mount. Pins arrive from an API call that
 * resolves *after* that, so the map opened on a hard-coded Riyadh city centre
 * and stayed there: an owner watching drivers in one district saw an empty
 * street map somewhere else and had to find their own fleet by hand, every
 * time the page loaded. `<FitToPins>` frames the pins instead, and re-frames
 * only when the *set* of pins changes — never on a position nudge, or the
 * eight-second poll would yank the view out from under anyone who had zoomed
 * in.
 *
 * Requires `VITE_GOOGLE_MAPS_API_KEY` (never committed). Without one it renders
 * a clear notice rather than a broken map, so the rest of the app is usable
 * while the key is being arranged.
 */
export function MapPanel({
  pins,
  center,
  height = 360,
  onPinClick,
  legend,
}: {
  pins: MapPin[];
  center?: { lat: number; lng: number };
  height?: number;
  onPinClick?: (id: string) => void;
  /** Shows the colour key. On for the fleet map, off for a single-address map. */
  legend?: boolean;
}): React.JSX.Element {
  // Only the first paint, before the map object exists. `FitToPins` takes over
  // the moment there is anything to frame.
  const initialCenter = center ?? (pins.length > 0 ? centerOf(pins) : FALLBACK_CENTER);

  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <div
        className="card"
        style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}
      >
        <div>
          <p style={{ fontWeight: 700, marginBottom: 6 }}>Map unavailable</p>
          <p className="muted" style={{ maxWidth: 320 }}>
            Set <code>VITE_GOOGLE_MAPS_API_KEY</code> to show the live driver map. Everything else
            works without it.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ height, borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
          <Map
            defaultCenter={{ lat: initialCenter.lat, lng: initialCenter.lng }}
            defaultZoom={12}
            gestureHandling="greedy"
            disableDefaultUI={false}
          >
            <FitToPins pins={pins} pinned={center !== undefined} />
            {pins.map((p) => (
              <Marker
                key={p.id}
                position={{ lat: p.lat, lng: p.lng }}
                title={p.title}
                icon={pinIcon(p.tone ?? 'destination', p.label)}
                label={
                  p.label
                    ? { text: p.label, color: '#1D2939', fontSize: '11px', fontWeight: '700' }
                    : undefined
                }
                onClick={onPinClick ? () => onPinClick(p.id) : undefined}
                // A live driver sits above a static destination when they
                // overlap, which they do constantly at the moment of arrival —
                // the one moment someone is watching this map.
                zIndex={p.tone === 'busy' || p.tone === 'free' ? 3 : 1}
              />
            ))}
          </Map>
        </APIProvider>
      </div>
      {legend ? <Legend /> : null}
    </div>
  );
}

/**
 * Moves the map to cover the pins.
 *
 * Two rules, and both are about not fighting the person using it:
 *
 *  - **It moves only when the set of pins changes** — a driver coming on shift,
 *    a delivery dispatched, one finishing. Live Ops refreshes every eight
 *    seconds and a driver's coordinates change on most of those; re-framing on
 *    every one would make the map unusable for anybody trying to look closely
 *    at a street.
 *  - **A single pin is not zoomed to the maximum.** `fitBounds` on one point
 *    zooms as far as it goes, which puts a driver under a magnifying glass with
 *    no city around them. An owner needs to know roughly *where* someone is, so
 *    one pin gets a neighbourhood-level zoom.
 *
 * A caller that passes an explicit `center` has said where it wants to look
 * (the single-address maps do), so this stands down entirely.
 */
function FitToPins({ pins, pinned }: { pins: MapPin[]; pinned: boolean }): null {
  const map = useMap();
  const key = pinSetKey(pins.map((p) => p.id));
  const lastFitted = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!map || pinned || pins.length === 0 || lastFitted.current === key) {
      return;
    }
    lastFitted.current = key;

    const bounds = boundsOf(pins);
    if (!bounds) {
      return;
    }

    const only = pins.length === 1 ? pins[0] : undefined;
    if (only) {
      map.setCenter({ lat: only.lat, lng: only.lng });
      map.setZoom(14);
      return;
    }

    map.fitBounds(
      { north: bounds.north, south: bounds.south, east: bounds.east, west: bounds.west },
      // Padding, so a pin on the edge of the fleet is not half under the map's
      // own controls or behind the legend card.
      64,
    );
    // `fitBounds` is asynchronous about applying zoom; clamping afterwards would
    // race it. The cap is instead expressed by never letting the computed fit
    // exceed what `zoomForBounds` says is sensible for the span.
    const cap = zoomForBounds(bounds);
    const current = map.getZoom();
    if (current !== undefined && current > cap) {
      map.setZoom(cap);
    }
  }, [map, key, pinned, pins]);

  return null;
}

function Legend(): React.JSX.Element {
  const items: { tone: PinTone; label: string }[] = [
    { tone: 'free', label: 'Free' },
    { tone: 'busy', label: 'On a job' },
    { tone: 'stale', label: 'No recent position' },
    { tone: 'destination', label: 'Drop-off' },
  ];

  return (
    <div
      className="card"
      style={{
        position: 'absolute',
        left: 12,
        bottom: 12,
        padding: '8px 12px',
        display: 'flex',
        gap: 14,
        flexWrap: 'wrap',
        alignItems: 'center',
        fontSize: 12,
        boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        zIndex: 10,
      }}
    >
      {items.map((item) => (
        <span key={item.tone} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <img src={pinIcon(item.tone)} alt="" width={14} height={14} />
          <span className="muted">{item.label}</span>
        </span>
      ))}
    </div>
  );
}
