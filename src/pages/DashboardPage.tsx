import React, { useState } from 'react';

import { useAuth } from '../auth/AuthProvider';
import { BranchSelect } from '../components/BranchSelect';
import { DatePresets, DateRange, defaultRange } from '../components/DateRange';
import { DataState } from '../components/ui';
import { useAsync } from '../hooks/useAsync';
import { formatSar } from '../util/money';

/**
 * KPIs for the current staff (owner spans all branches, branch admin sees
 * only their scope). Reads the sales + payments reports for a window.
 */
export function DashboardPage(): React.JSX.Element {
  const { api } = useAuth();
  const [{ from, to }, setRange] = useState(defaultRange);
  const [branchId, setBranchId] = useState('');

  const sales = useAsync(() => api.salesReport({ from, to, branchId: branchId || undefined }), [from, to, branchId]);
  const payments = useAsync(
    () => api.paymentsReport({ from, to, branchId: branchId || undefined }),
    [from, to, branchId],
  );
  const kpis = useAsync(
    () => api.dashboardKpis({ from, to, branchId: branchId || undefined }),
    [from, to, branchId],
  );
  // Fleet snapshot — org-wide, no window (a driver "online now" is a now question).
  const onlineDrivers = useAsync(() => api.listAllDrivers({ isOnline: true, limit: 100 }), []);
  const freeDrivers = useAsync(() => api.listAllDrivers({ isAvailable: true, limit: 100 }), []);

  const s = sales.data;
  const p = payments.data;
  const k = kpis.data;
  // `?.data?.length`, not `?.data.length`. The `?? ` fallback exists precisely
  // for a response that arrived without `meta` — and in that case `data.data`
  // is exactly what may be missing too, so the guard has to cover it or the
  // fallback throws instead of falling back, blanking the dashboard.
  const onlineCount = onlineDrivers.data?.meta?.total ?? onlineDrivers.data?.data?.length;
  const freeCount = freeDrivers.data?.meta?.total ?? freeDrivers.data?.data?.length;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'end', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, flex: 1 }}>Dashboard</h2>
        <BranchSelect value={branchId} onChange={setBranchId} allowAll width={220} />
        <DateRange from={from} to={to} onChange={(f, t) => setRange({ from: f, to: t })} />
      </div>
      <div style={{ marginBottom: 16 }}>
        <DatePresets onPick={setRange} />
      </div>

      <DataState
        loading={(sales.loading || payments.loading) && !s && !p}
        error={sales.error?.message ?? payments.error?.message ?? null}
        onRetry={() => {
          sales.reload();
          payments.reload();
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 12,
            marginBottom: 20,
          }}
        >
          <Kpi label="Realised orders" value={s ? s.realised.orders.toString() : '—'} />
          <Kpi label="Revenue" value={s ? formatSar(s.realised.totalMinor) : '—'} />
          <Kpi label="VAT collected" value={s ? formatSar(s.realised.vatMinor) : '—'} />
          <Kpi label="Discounts" value={s ? formatSar(s.realised.discountMinor) : '—'} />
          <Kpi label="Delivery fees" value={s ? formatSar(s.realised.deliveryFeeMinor) : '—'} />
          <Kpi label="Charges" value={s ? formatSar(s.realised.chargesMinor) : '—'} />
          <Kpi label="Net captured" value={p ? formatSar(p.totals.netCapturedMinor) : '—'} />
          <Kpi label="Refunded" value={p ? formatSar(p.totals.refundedMinor) : '—'} />
          <Kpi label="Gateway fees" value={p ? formatSar(p.totals.gatewayFeesMinor) : '—'} />
          <Kpi label="Drivers online" value={onlineCount === undefined ? '—' : String(onlineCount)} />
          <Kpi label="Drivers free" value={freeCount === undefined ? '—' : String(freeCount)} />
          <Kpi
            label="Avg prep time"
            value={k ? fmtDuration(k.avgPrepTimeSeconds) : '—'}
            sub={k && k.prepTimeSamples ? `${k.prepTimeSamples} orders` : undefined}
          />
          <Kpi
            label="Avg delivery time"
            value={k ? fmtDuration(k.avgDeliveryTimeSeconds) : '—'}
            sub={k && k.deliveryTimeSamples ? `${k.deliveryTimeSamples} deliveries` : undefined}
          />
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>Orders by status</h3>
          {s && s.statusBreakdown.length > 0 ? (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                  <th style={cellHead}>Status</th>
                  <th style={cellHead}>Orders</th>
                  <th style={cellHead}>Total</th>
                </tr>
              </thead>
              <tbody>
                {s.statusBreakdown.map((row) => (
                  <tr key={row.status}>
                    <td style={cell}>{row.status.replace(/_/g, ' ').toLowerCase()}</td>
                    <td style={cell}>{row.orders}</td>
                    <td style={cell}>{formatSar(row.totalMinor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted" style={{ margin: 0 }}>No orders in this window.</p>
          )}
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Payments by method</h3>
          {p && p.byMethod.length > 0 ? (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                  <th style={cellHead}>Method</th>
                  <th style={cellHead}>Payments</th>
                  <th style={cellHead}>Captured</th>
                  <th style={cellHead}>Refunded</th>
                </tr>
              </thead>
              <tbody>
                {p.byMethod.map((row) => (
                  <tr key={row.method ?? 'none'}>
                    <td style={cell}>{row.method ?? '—'}</td>
                    <td style={cell}>{row.payments}</td>
                    <td style={cell}>{formatSar(row.capturedMinor)}</td>
                    <td style={cell}>{formatSar(row.refundedMinor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted" style={{ margin: 0 }}>No payments in this window.</p>
          )}
        </div>
      </DataState>
    </div>
  );
}

const cellHead: React.CSSProperties = { padding: '8px 6px', borderBottom: '1px solid var(--border)', fontWeight: 600 };
const cell: React.CSSProperties = { padding: '8px 6px', borderBottom: '1px solid var(--border)' };

/** Human-readable duration from a nullable seconds count. */
function fmtDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  if (m < 60) return `${m}m ${s}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }): React.JSX.Element {
  return (
    <div className="card" style={{ padding: 14 }}>
      <p className="muted" style={{ margin: 0, fontSize: 12, textTransform: 'uppercase' }}>{label}</p>
      <p style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{value}</p>
      {sub ? <p className="muted" style={{ margin: 0, fontSize: 11 }}>{sub}</p> : null}
    </div>
  );
}
