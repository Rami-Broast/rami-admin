import React, { useMemo, useRef, useState } from 'react';

import { useAuth } from '../auth/AuthProvider';
import { BranchSelect } from '../components/BranchSelect';
import { MapPanel, MapPin } from '../components/MapPanel';
import { Driver } from '../api/types';
import { coordinate } from '../util/fleetMap';
import { driverOptionLabel, sortByAvailability } from '../util/driverPicker';
import { DataState, LiveBadge, StatusChip } from '../components/ui';
import { useAsync } from '../hooks/useAsync';
import { useRealtimeReload } from '../realtime/RealtimeProvider';

/** Coalesce bursty driver.location pings into at most one refresh per window. */
const REFRESH_THROTTLE_MS = 2000;

function tone(status: string): 'progress' | 'success' | 'danger' | 'neutral' {
  if (status === 'DELIVERED') return 'success';
  if (status === 'FAILED' || status === 'CANCELLED') return 'danger';
  if (status === 'PENDING_ASSIGNMENT') return 'neutral';
  return 'progress';
}

/** The live delivery board: map of drivers + destinations, and driver assignment. */
export function DeliveriesPage(): React.JSX.Element {
  const { api } = useAuth();
  const [branchId, setBranchId] = useState<string>('');
  const [tick, setTick] = useState(0);
  const [assigning, setAssigning] = useState<string | null>(null);

  const deliveries = useAsync(
    () => api.deliveries({ branchId: branchId || undefined }),
    [branchId, tick],
  );
  const drivers = useAsync(() => api.assignableDrivers(), [tick]);

  // Realtime: driver movement + assignment/transition events drive the refresh,
  // throttled so a burst of location pings can't hammer the API.
  const lastRefresh = useRef(0);
  const rtStatus = useRealtimeReload(
    // `driver.status` is what makes a driver appear in the picker the moment
    // they start their shift, rather than on whichever refresh happens next.
    ['driver.location', 'driver.status', 'delivery.assigned', 'order.transitioned'],
    () => {
      const now = Date.now();
      if (now - lastRefresh.current < REFRESH_THROTTLE_MS) return;
      lastRefresh.current = now;
      setTick((n) => n + 1);
    },
  );

  const list = useMemo(() => deliveries.data?.data ?? [], [deliveries.data]);
  const pins = useMemo<MapPin[]>(() => {
    const out: MapPin[] = [];
    for (const d of list) {
      // `coordinate` and not a `!= null` check: these arrive as strings from a
      // backend that has not converted its Decimal columns, and a string is not
      // a `LatLng`. See `util/fleetMap.ts`.
      const drvLat = coordinate(d.driver?.currentLatitude);
      const drvLng = coordinate(d.driver?.currentLongitude);
      if (drvLat !== null && drvLng !== null && d.driver) {
        out.push({ id: `drv-${d.id}`, lat: drvLat, lng: drvLng, tone: 'busy', title: `${d.driver.user.fullName} (driver)` });
      }
      const dstLat = coordinate(d.addressSnapshot?.latitude);
      const dstLng = coordinate(d.addressSnapshot?.longitude);
      if (dstLat !== null && dstLng !== null) {
        out.push({ id: `dst-${d.id}`, lat: dstLat, lng: dstLng, title: `${d.order.orderNumber} destination` });
      }
    }
    return out;
  }, [list]);

  const assign = async (deliveryId: string, driverId: string): Promise<void> => {
    if (!driverId) return;
    setAssigning(deliveryId);
    try {
      await api.assignDriver(deliveryId, driverId);
      setTick((n) => n + 1);
    } finally {
      setAssigning(null);
    }
  };

  const unassign = async (deliveryId: string): Promise<void> => {
    const reason = window.prompt('Why is this delivery coming back? (optional)') ?? undefined;
    setAssigning(deliveryId);
    try {
      await api.unassignDriver(deliveryId, reason || undefined);
      setTick((n) => n + 1);
    } finally {
      setAssigning(null);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <h2 style={{ margin: 0, flex: 1 }}>Deliveries</h2>
        <LiveBadge status={rtStatus} />
        <BranchSelect value={branchId} onChange={setBranchId} allowAll width={260} />
      </div>

      <div style={{ marginBottom: 16 }}>
        <MapPanel pins={pins} />
      </div>

      <DataState loading={deliveries.loading && list.length === 0} error={deliveries.error?.message ?? null} empty={list.length === 0} onRetry={deliveries.reload}>
        <div style={{ display: 'grid', gap: 10 }}>
          {list.map((d) => (
            <div key={d.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong>{d.order.orderNumber}</strong>
                <StatusChip label={d.status.replace(/_/g, ' ').toLowerCase()} tone={tone(d.status)} />
              </div>
              <p className="muted" style={{ margin: '6px 0' }}>
                {[d.addressSnapshot?.line1, d.addressSnapshot?.city].filter(Boolean).join(', ') || 'No address'}
              </p>
              {d.driver ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <p style={{ margin: 0 }}>
                    Driver: <strong>{d.driver.user.fullName}</strong>{' '}
                    <span className="muted">({d.driver.vehicleType.toLowerCase()})</span>
                  </p>
                  {/* Only before pickup: after that the food is in the car and
                      reassigning the record would misdescribe where it is. */}
                  {d.status === 'ASSIGNED' ? (
                    <button
                      className="btn btn-ghost"
                      disabled={assigning === d.id}
                      onClick={() => void unassign(d.id)}
                    >
                      Take back
                    </button>
                  ) : null}
                </div>
              ) : d.status === 'PENDING_ASSIGNMENT' ? (
                <AssignRow
                  deliveryId={d.id}
                  drivers={drivers.data?.data ?? []}
                  busy={assigning === d.id}
                  onAssign={assign}
                />
              ) : null}
            </div>
          ))}
        </div>
      </DataState>
    </div>
  );
}

/**
 * The picker, listing every driver on shift with what they are already
 * carrying.
 *
 * Free drivers come first, then the lightest load — the order somebody would
 * pick in anyway — and each busy one says how many drops they hold, because
 * "on a job" and "on three jobs" are a different decision and a bare name says
 * neither.
 */
function AssignRow({
  deliveryId,
  drivers,
  busy,
  onAssign,
}: {
  deliveryId: string;
  drivers: Driver[];
  busy: boolean;
  onAssign: (deliveryId: string, driverId: string) => void;
}): React.JSX.Element {
  const [driverId, setDriverId] = useState('');
  const ordered = useMemo(() => sortByAvailability(drivers), [drivers]);

  if (ordered.length === 0) {
    // Named as a cause, not an empty box: nobody is on shift. That is
    // actionable ("ring a driver") where "no drivers" is not.
    return <p className="muted" style={{ margin: 0 }}>No drivers are on shift right now.</p>;
  }
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
      <select value={driverId} onChange={(e) => setDriverId(e.target.value)} style={{ flex: 1 }}>
        <option value="">Choose a driver…</option>
        {ordered.map((d) => (
          <option key={d.id} value={d.id}>
            {driverOptionLabel(d)}
          </option>
        ))}
      </select>
      <button className="btn" disabled={busy || !driverId} onClick={() => onAssign(deliveryId, driverId)}>
        {busy ? 'Assigning…' : 'Assign'}
      </button>
    </div>
  );
}
