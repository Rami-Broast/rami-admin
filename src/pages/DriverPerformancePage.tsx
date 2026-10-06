import React, { useState } from 'react';

import { useAuth } from '../auth/AuthProvider';
import { BranchSelect } from '../components/BranchSelect';
import { DatePresets, DateRange, defaultRange } from '../components/DateRange';
import { DataState } from '../components/ui';
import { useAsync } from '../hooks/useAsync';

/** Human-readable duration from a seconds count (e.g. 754 -> "12m 34s"). */
function fmtDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

/**
 * Driver performance report (`reports:read`).
 *
 * Per-driver averages over a window — time-to-pickup, delivery time and
 * throughput — read from completed-delivery timestamps, the same source the
 * dashboard KPIs and the delivery state machine use. Branch-isolated: OWNER
 * spans branches, branch staff see only their own.
 */
export function DriverPerformancePage(): React.JSX.Element {
  const { api, isOwner } = useAuth();
  const [range, setRange] = useState(defaultRange());
  const [branchId, setBranchId] = useState('');

  const report = useAsync(
    () => api.driverPerformanceReport({ from: range.from, to: range.to, branchId: branchId || undefined }),
    [range, branchId],
  );

  const rows = report.data?.drivers ?? [];
  const totals = report.data?.totals;

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Driver performance</h2>

      <div className="card" style={{ marginBottom: 16, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <DateRange from={range.from} to={range.to} onChange={(from, to) => setRange({ from, to })} />
        <DatePresets onPick={setRange} />
        {isOwner ? (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span className="muted" style={{ fontSize: 12 }}>Branch</span>
            <BranchSelect value={branchId} onChange={setBranchId} allowAll />
          </label>
        ) : null}
      </div>

      {totals ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 16 }}>
          <Tile label="Completed deliveries" value={String(totals.deliveries)} />
          <Tile label="Avg time to pickup" value={fmtDuration(totals.avgTimeToPickupSeconds)} />
          <Tile label="Avg delivery time" value={fmtDuration(totals.avgDeliveryTimeSeconds)} />
        </div>
      ) : null}

      <DataState
        loading={report.loading && rows.length === 0}
        error={report.error?.message ?? null}
        empty={rows.length === 0}
        onRetry={report.reload}
      >
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 780 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                <th style={th}>Driver</th>
                {isOwner ? <th style={th}>Branch</th> : null}
                <th style={{ ...th, textAlign: 'right' }}>Deliveries</th>
                <th style={{ ...th, textAlign: 'right' }}>Avg to pickup</th>
                <th style={{ ...th, textAlign: 'right' }}>Avg delivery</th>
                <th style={{ ...th, textAlign: 'right' }}>Active days</th>
                <th style={{ ...th, textAlign: 'right' }}>Per active day</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.driverId}>
                  <td style={td}>
                    {r.driverName ?? r.driverEmail}
                    {r.driverName ? <div className="muted" style={{ fontSize: 12 }}>{r.driverEmail}</div> : null}
                  </td>
                  {isOwner ? <td style={td}>{r.branch?.code ?? '—'}</td> : null}
                  <td style={{ ...td, textAlign: 'right' }}>{r.deliveries}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{fmtDuration(r.avgTimeToPickupSeconds)}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{fmtDuration(r.avgDeliveryTimeSeconds)}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{r.activeDays}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{r.deliveriesPerActiveDay}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          Completed deliveries only — cancelled or failed jobs never move an average.
        </p>
      </DataState>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="card">
      <div className="muted" style={{ fontSize: 13 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{value}</div>
    </div>
  );
}

const th: React.CSSProperties = { padding: '10px 12px', borderBottom: '1px solid var(--border)', fontWeight: 600, whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '10px 12px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' };
