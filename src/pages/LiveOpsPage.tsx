import React, { useMemo, useRef, useState } from 'react';

import { Delivery, Driver } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { BranchSelect } from '../components/BranchSelect';
import { MapPanel, MapPin } from '../components/MapPanel';
import { coordinate, driverPinState, hasPosition } from '../util/fleetMap';
import { loadLabel } from '../util/driverPicker';
import { DataState, LiveBadge, StatusChip } from '../components/ui';
import { useAsync } from '../hooks/useAsync';
import { useRealtimeReload } from '../realtime/RealtimeProvider';

/** Coalesce bursty driver.location pings into at most one refresh per window. */
const REFRESH_THROTTLE_MS = 2000;

const ACTIVE_STATUSES = [
  'PENDING_ASSIGNMENT',
  'ASSIGNED',
  'PICKED_UP',
  'OUT_FOR_DELIVERY',
] as const;

function statusTone(s: string): 'progress' | 'success' | 'danger' | 'neutral' | 'warning' {
  if (s === 'DELIVERED') return 'success';
  if (s === 'FAILED' || s === 'CANCELLED') return 'danger';
  if (s === 'PENDING_ASSIGNMENT') return 'warning';
  return 'progress';
}

/**
 * Live operations view. Owner-wide by default: every online driver plus every
 * in-flight delivery across all branches, refreshed every few seconds. This is
 * what the person running the business watches while service is on.
 */
export function LiveOpsPage(): React.JSX.Element {
  const { api } = useAuth();
  const [tick, setTick] = useState(0);
  const [branchId, setBranchId] = useState('');
  const [selectedPin, setSelectedPin] = useState<string | null>(null);

  // Drivers are org-wide (a driver can be assigned from any branch), so we
  // always list all of them. Deliveries are branch-filterable.
  const drivers = useAsync(() => api.listAllDrivers({ isOnline: true, limit: 100 }), [tick]);

  const active = useAsync(
    async () => {
      const results = await Promise.all(
        ACTIVE_STATUSES.map((s) =>
          api.deliveries({ status: s, branchId: branchId || undefined, limit: 100 }),
        ),
      );
      return results.flatMap((r) => r.data);
    },
    [tick, branchId],
  );

  // Realtime: driver movement and delivery/order transitions drive the refresh,
  // throttled so a stream of location pings can't hammer the API.
  const lastRefresh = useRef(0);
  const rtStatus = useRealtimeReload(
    [
      'driver.location',
      'driver.status',
      'delivery.assigned',
      'delivery.unassigned',
      'order.transitioned',
      'order.awaiting',
    ],
    () => {
      const now = Date.now();
      if (now - lastRefresh.current < REFRESH_THROTTLE_MS) return;
      lastRefresh.current = now;
      setTick((n) => n + 1);
    },
  );

  // Memoised so the fallback `[]` is not a new array on every render. Without
  // it the pin `useMemo` below recomputes every render regardless of whether
  // anything moved — and on a page that polls every 8 seconds and re-pins a
  // whole fleet, that is work nobody asked for.
  const driverList = useMemo<Driver[]>(() => drivers.data?.data ?? [], [drivers.data]);
  const deliveryList = useMemo<Delivery[]>(() => active.data ?? [], [active.data]);

  const pins = useMemo<MapPin[]>(() => {
    const out: MapPin[] = [];
    for (const d of driverList) {
      if (!hasPosition(d)) {
        // No position at all — they are in the list beside the map with
        // "no location yet", which is the truth. A pin at 0,0 would put them
        // in the Atlantic.
        continue;
      }
      const lat = coordinate(d.currentLatitude);
      const lng = coordinate(d.currentLongitude);
      if (lat === null || lng === null) {
        continue;
      }
      const state = driverPinState(d);
      const job = deliveryList.find((dv) => dv.driverId === d.id);
      out.push({
        id: `driver-${d.id}`,
        lat,
        lng,
        tone: state.tone,
        // Only a driver mid-job carries a label. Every pin labelled reads well
        // with five drivers and becomes overlapping clutter with twenty; the
        // one an owner needs to identify without tapping is the one carrying
        // an order.
        label: state.tone === 'busy' && job ? job.order.orderNumber : undefined,
        title: `${d.user.fullName} · ${state.statusLabel}${
          state.seenLabel ? ` · seen ${state.seenLabel}` : ''
        }`,
      });
    }
    for (const dv of deliveryList) {
      const a = dv.addressSnapshot;
      const destLat = coordinate(a?.latitude);
      const destLng = coordinate(a?.longitude);
      if (destLat !== null && destLng !== null) {
        out.push({
          id: `dest-${dv.id}`,
          lat: destLat,
          lng: destLng,
          tone: 'destination',
          title: `${dv.order.orderNumber} → ${a?.city ?? 'destination'}`,
        });
      }
    }
    return out;
  }, [driverList, deliveryList]);

  const online = driverList.length;
  const busy = driverList.filter((d) => !d.isAvailable).length;
  // Drivers whose pin can be trusted right now. A driver only reports position
  // while carrying an order (spec §24), so this is deliberately lower than
  // "online" and the owner should be able to see the difference.
  const live = driverList.filter((d) => hasPosition(d) && driverPinState(d).live).length;
  const unassigned = deliveryList.filter((d) => d.status === 'PENDING_ASSIGNMENT').length;
  const inFlight = deliveryList.length - unassigned;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <h2 style={{ margin: 0, flex: 1 }}>Live operations</h2>
        <LiveBadge status={rtStatus} />
        <BranchSelect value={branchId} onChange={setBranchId} allowAll width={220} />
        <span className="muted" style={{ fontSize: 12 }}>Refreshes every 8s</span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 12,
          marginBottom: 12,
        }}
      >
        <Kpi label="Drivers online" value={String(online)} />
        <Kpi label="Drivers on a job" value={String(busy)} />
        <Kpi label="Live on the map" value={`${live} of ${online}`} />
        <Kpi label="Deliveries in flight" value={String(inFlight)} />
        <Kpi label="Waiting to assign" value={String(unassigned)} highlight={unassigned > 0} />
      </div>

      <div style={{ marginBottom: 16, position: 'relative' }}>
        <MapPanel pins={pins} height={480} onPinClick={setSelectedPin} legend />
        {selectedPin ? (
          <SelectedPinCard
            id={selectedPin}
            drivers={driverList}
            deliveries={deliveryList}
            onClose={() => setSelectedPin(null)}
          />
        ) : null}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <section>
          <h3 style={{ marginTop: 0 }}>Active deliveries</h3>
          <DataState
            loading={active.loading && deliveryList.length === 0}
            error={active.error?.message ?? null}
            empty={deliveryList.length === 0}
            onRetry={active.reload}
          >
            <div style={{ display: 'grid', gap: 8 }}>
              {deliveryList.map((d) => (
                <div key={d.id} className="card" style={{ padding: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <strong style={{ flex: 1 }}>{d.order.orderNumber}</strong>
                    <StatusChip label={d.status.replace(/_/g, ' ').toLowerCase()} tone={statusTone(d.status)} />
                  </div>
                  <p className="muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
                    {[d.addressSnapshot?.line1, d.addressSnapshot?.city].filter(Boolean).join(', ') || 'No address'}
                  </p>
                  <p style={{ margin: '4px 0 0', fontSize: 13 }}>
                    Driver: {d.driver ? d.driver.user.fullName : <em className="muted">unassigned</em>}
                  </p>
                </div>
              ))}
            </div>
          </DataState>
        </section>

        <section>
          <h3 style={{ marginTop: 0 }}>Online drivers</h3>
          <DataState
            loading={drivers.loading && driverList.length === 0}
            error={drivers.error?.message ?? null}
            empty={driverList.length === 0}
            onRetry={drivers.reload}
          >
            <div style={{ display: 'grid', gap: 8 }}>
              {driverList.map((d) => (
                <div key={d.id} className="card" style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <strong>{d.user.fullName}</strong>
                    <p className="muted" style={{ margin: '2px 0 0', fontSize: 12 }}>
                      {d.vehicleType.replace(/_/g, ' ').toLowerCase()}
                      {d.vehiclePlate ? ` · ${d.vehiclePlate}` : ''}
                      {hasPosition(d)
                        ? ` · seen ${driverPinState(d).seenLabel ?? 'a while ago'}`
                        : ' · no location yet'}
                    </p>
                  </div>
                  <StatusChip
                    label={loadLabel(d) ?? 'free'}
                    tone={d.isAvailable ? 'success' : 'warning'}
                  />
                </div>
              ))}
            </div>
          </DataState>
        </section>
      </div>
    </div>
  );
}

/**
 * Overlay for a clicked pin — driver or destination — pulling from the lists
 * already loaded, so there's no round-trip to open one.
 */
function SelectedPinCard({
  id,
  drivers,
  deliveries,
  onClose,
}: {
  id: string;
  drivers: Driver[];
  deliveries: Delivery[];
  onClose: () => void;
}): React.JSX.Element | null {
  const wrap = (children: React.ReactNode): React.JSX.Element => (
    <div
      className="card"
      style={{
        position: 'absolute',
        top: 12,
        right: 12,
        width: 300,
        boxShadow: '0 6px 24px rgba(0,0,0,0.15)',
        zIndex: 20,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
        <strong style={{ flex: 1 }}>{children ? 'Details' : ''}</strong>
        <button className="btn btn-ghost" onClick={onClose} style={{ padding: '2px 8px' }} aria-label="Close">×</button>
      </div>
      {children}
    </div>
  );

  if (id.startsWith('driver-')) {
    const driver = drivers.find((d) => `driver-${d.id}` === id);
    if (!driver) return wrap(<p className="muted">Driver no longer online.</p>);
    // A driver may be carrying more than one drop now, and showing only the
    // first would understate what they are holding on the one card an owner
    // opens to decide whether to give them another.
    const currentJobs = deliveries.filter((dv) => dv.driverId === driver.id);
    const state = driverPinState(driver);
    return wrap(
      <div>
        <p style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{driver.user.fullName}</p>
        <p className="muted" style={{ margin: '2px 0 8px', fontSize: 12 }}>
          {driver.vehicleType.replace(/_/g, ' ').toLowerCase()}
          {driver.vehiclePlate ? ` · ${driver.vehiclePlate}` : ''}
        </p>
        <p style={{ margin: 0 }}>
          <StatusChip
            label={loadLabel(driver) ?? 'free'}
            tone={driver.isAvailable ? 'success' : 'warning'}
          />
        </p>
        {currentJobs.length > 0 ? (
          <div style={{ margin: '8px 0 0' }}>
            <strong>{currentJobs.length === 1 ? 'Current:' : `Carrying ${currentJobs.length}:`}</strong>
            {currentJobs.map((job) => (
              <p key={job.id} style={{ margin: '2px 0 0', fontSize: 13 }}>
                {job.order.orderNumber} — {job.status.replace(/_/g, ' ').toLowerCase()}
              </p>
            ))}
          </div>
        ) : null}
        <p className="muted" style={{ margin: '8px 0 0', fontSize: 12 }}>
          {state.seenLabel ? `Position from ${state.seenLabel}` : 'No position reported yet'}
        </p>
        {!state.live ? (
          // Said plainly, because this pin is the one an owner is most likely
          // to act on wrongly: a driver only reports while carrying an order,
          // so a free driver's pin is wherever their last delivery left them.
          <p className="muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
            Drivers report their position only while carrying an order, so this is where they
            were last seen — not necessarily where they are now.
          </p>
        ) : null}
      </div>,
    );
  }

  const dv = deliveries.find((d) => `dest-${d.id}` === id);
  if (!dv) return wrap(<p className="muted">Delivery no longer active.</p>);
  return wrap(
    <div>
      <p style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{dv.order.orderNumber}</p>
      <p style={{ margin: '2px 0 0' }}>
        <StatusChip label={dv.status.replace(/_/g, ' ').toLowerCase()} tone="progress" />
      </p>
      <p style={{ margin: '8px 0 0' }}>
        {[dv.addressSnapshot?.line1, dv.addressSnapshot?.city].filter(Boolean).join(', ') || '—'}
      </p>
      <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
        Driver: {dv.driver?.user.fullName ?? 'unassigned'}
      </p>
    </div>,
  );
}

function Kpi({ label, value, highlight }: { label: string; value: string; highlight?: boolean }): React.JSX.Element {
  return (
    <div className="card" style={{ padding: 14, borderColor: highlight ? 'var(--warning)' : undefined }}>
      <p className="muted" style={{ margin: 0, fontSize: 11, textTransform: 'uppercase' }}>{label}</p>
      <p
        style={{
          margin: 0,
          fontSize: 22,
          fontWeight: 700,
          color: highlight ? 'var(--warning)' : undefined,
        }}
      >
        {value}
      </p>
    </div>
  );
}
