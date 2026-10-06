import React, { useState } from 'react';

import { CashCollection } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { DataState, StatusChip } from '../components/ui';
import { useAsync } from '../hooks/useAsync';
import { formatSar } from '../util/money';

/**
 * Cash-on-delivery reconciliation (`deliveries:read`).
 *
 * One row per delivery: what we expected (snapshotted from the COD payment),
 * what the driver reported collecting, and the variance. The backend computes
 * the variance and the window totals — this page only displays them and lets
 * staff narrow by driver, branch and date. Rows are immutable by design; a
 * mistyped amount is corrected with a paper trail, not an edit.
 */
export function CashReconciliationPage(): React.JSX.Element {
  const { api } = useAuth();
  const [page, setPage] = useState(1);
  const [branchId, setBranchId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [applied, setApplied] = useState({ branchId: '', driverId: '', from: '', to: '' });

  const branches = useAsync(() => api.branches(), []);
  const drivers = useAsync(() => api.listDrivers({ limit: 100 }), []);

  const cash = useAsync(
    () =>
      api.cashCollections({
        page,
        limit: 50,
        branchId: applied.branchId || undefined,
        driverId: applied.driverId || undefined,
        from: applied.from ? new Date(applied.from).toISOString() : undefined,
        to: applied.to ? new Date(applied.to).toISOString() : undefined,
      }),
    [page, applied],
  );

  const rows = cash.data?.data ?? [];
  const meta = cash.data?.meta;
  const totals = cash.data?.totals;

  const apply = (): void => {
    setPage(1);
    setApplied({ branchId, driverId, from, to });
  };

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Cash reconciliation</h2>
      <p className="muted" style={{ marginTop: -4 }}>
        Driver-reported cash-on-delivery collections against the amount expected per order.
      </p>

      <div className="card" style={{ marginBottom: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
        <Field label="Branch">
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">All branches</option>
            {(branches.data ?? []).map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Driver">
          <select value={driverId} onChange={(e) => setDriverId(e.target.value)}>
            <option value="">All drivers</option>
            {(drivers.data?.data ?? []).map((d) => (
              <option key={d.id} value={d.id}>{d.user.fullName}</option>
            ))}
          </select>
        </Field>
        <Field label="From">
          <input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To">
          <input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <button className="btn" onClick={apply}>Apply</button>
        </div>
      </div>

      {totals ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
          <Tile label="Expected" value={formatSar(totals.expectedMinor)} />
          <Tile label="Collected" value={formatSar(totals.collectedMinor)} />
          <Tile
            label="Variance"
            value={formatSar(totals.varianceMinor)}
            tone={totals.varianceMinor === 0 ? 'neutral' : totals.varianceMinor > 0 ? 'success' : 'danger'}
          />
        </div>
      ) : null}

      <DataState
        loading={cash.loading && rows.length === 0}
        error={cash.error?.message ?? null}
        empty={rows.length === 0}
        onRetry={cash.reload}
      >
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                <th style={th}>Order</th>
                <th style={th}>Driver</th>
                <th style={th}>Branch</th>
                <th style={{ ...th, textAlign: 'right' }}>Expected</th>
                <th style={{ ...th, textAlign: 'right' }}>Collected</th>
                <th style={{ ...th, textAlign: 'right' }}>Variance</th>
                <th style={th}>When</th>
                <th style={th}>Note</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <CashRow key={r.id} r={r} />
              ))}
            </tbody>
          </table>
        </div>

        {meta ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
            <button className="btn btn-ghost" disabled={page <= 1 || cash.loading} onClick={() => setPage((n) => Math.max(1, n - 1))}>
              Previous
            </button>
            <span className="muted">
              Page {meta.page} of {Math.max(1, meta.totalPages)} · {meta.total} collections
            </span>
            <button className="btn btn-ghost" disabled={!meta.hasNextPage || cash.loading} onClick={() => setPage((n) => n + 1)}>
              Next
            </button>
          </div>
        ) : null}
      </DataState>
    </div>
  );
}

function CashRow({ r }: { r: CashCollection }): React.JSX.Element {
  const vTone = r.varianceMinor === 0 ? 'neutral' : r.varianceMinor > 0 ? 'success' : 'danger';
  return (
    <tr>
      <td style={td}>{r.delivery?.order.orderNumber ?? '—'}</td>
      <td style={td}>{r.driver?.user.fullName ?? '—'}</td>
      <td style={td}>{r.branch?.code ?? '—'}</td>
      <td style={{ ...td, textAlign: 'right' }}>{formatSar(r.expectedMinor)}</td>
      <td style={{ ...td, textAlign: 'right' }}>{formatSar(r.collectedMinor)}</td>
      <td style={{ ...td, textAlign: 'right' }}>
        <StatusChip label={formatSar(r.varianceMinor)} tone={vTone} />
      </td>
      <td style={td}>{new Date(r.createdAt).toLocaleString()}</td>
      <td style={td}>{r.note ?? <span className="muted">—</span>}</td>
    </tr>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: 'neutral' | 'success' | 'danger' }): React.JSX.Element {
  const color = tone === 'success' ? 'var(--success)' : tone === 'danger' ? 'var(--danger)' : 'var(--text)';
  return (
    <div className="card">
      <div className="muted" style={{ fontSize: 13 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, color }}>{value}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <label style={{ display: 'block' }}>
      <span className="muted" style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>{label}</span>
      {children}
    </label>
  );
}

const th: React.CSSProperties = { padding: '10px 12px', borderBottom: '1px solid var(--border)', fontWeight: 600, whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '10px 12px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' };
