import React, { useState } from 'react';

import { Settlement, SettlementMatchStatus, SettlementStatus } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { BranchSelect } from '../components/BranchSelect';
import { Modal } from '../components/Modal';
import { DataState, StatusChip } from '../components/ui';
import { useAsync } from '../hooks/useAsync';
import { formatSar } from '../util/money';

const STATUSES: (SettlementStatus | '')[] = ['', 'EXPECTED', 'RECEIVED', 'MATCHED', 'DISCREPANCY'];

function statusTone(s: SettlementStatus): 'progress' | 'success' | 'danger' | 'neutral' | 'warning' {
  if (s === 'MATCHED') return 'success';
  if (s === 'DISCREPANCY') return 'danger';
  if (s === 'RECEIVED') return 'warning';
  return 'neutral';
}

function matchTone(m: SettlementMatchStatus): 'success' | 'danger' | 'warning' | 'neutral' {
  if (m === 'MATCHED') return 'success';
  if (m === 'MISSING' || m === 'UNMATCHED') return 'danger';
  if (m === 'UNEXPECTED' || m === 'DUPLICATE') return 'warning';
  return 'neutral';
}

/** List gateway settlements + drill into their reconciliation lines. */
export function SettlementsPage(): React.JSX.Element {
  const { api } = useAuth();
  const [branchId, setBranchId] = useState('');
  const [status, setStatus] = useState<SettlementStatus | ''>('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<Settlement | null>(null);

  const list = useAsync(
    () => api.listSettlements({
      branchId: branchId || undefined,
      status: status || undefined,
      page,
      limit: 25,
    }),
    [branchId, status, page],
  );

  const rows = list.data?.data ?? [];
  const meta = list.data?.meta;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, flex: 1 }}>Settlements</h2>
        <BranchSelect value={branchId} onChange={(v) => { setBranchId(v); setPage(1); }} allowAll width={220} />
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value as SettlementStatus | ''); setPage(1); }}
          style={{ width: 180 }}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s === '' ? 'All statuses' : s.toLowerCase()}</option>
          ))}
        </select>
      </div>

      <DataState
        loading={list.loading && rows.length === 0}
        error={list.error?.message ?? null}
        empty={rows.length === 0}
        onRetry={list.reload}
      >
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                <th style={th}>Gateway</th>
                <th style={th}>Reference</th>
                <th style={th}>Period</th>
                <th style={th}>Expected net</th>
                <th style={th}>Actual net</th>
                <th style={th}>Variance</th>
                <th style={th}>Status</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td style={td}>{s.gatewayName}</td>
                  <td style={td}>{s.settlementReference}</td>
                  <td style={td}>
                    {new Date(s.periodStart).toLocaleDateString()} –{' '}
                    {new Date(s.periodEnd).toLocaleDateString()}
                  </td>
                  <td style={td}>{formatSar(s.expectedNetMinor)}</td>
                  <td style={td}>{formatSar(s.actualNetMinor)}</td>
                  <td style={{ ...td, color: Number(s.varianceMinor) === 0 ? 'inherit' : 'var(--danger)' }}>
                    {formatSar(s.varianceMinor)}
                  </td>
                  <td style={td}>
                    <StatusChip label={s.status.toLowerCase()} tone={statusTone(s.status)} />
                  </td>
                  <td style={td}>
                    <button
                      className="btn btn-ghost"
                      style={{ padding: '4px 12px' }}
                      onClick={async () => setOpen(await api.getSettlement(s.id))}
                    >
                      Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {meta ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
            <button
              className="btn btn-ghost"
              disabled={page <= 1 || list.loading}
              onClick={() => setPage((n) => Math.max(1, n - 1))}
            >
              Previous
            </button>
            <span className="muted">
              Page {meta.page} of {Math.max(1, meta.totalPages)} · {meta.total} settlements
            </span>
            <button
              className="btn btn-ghost"
              disabled={!meta.hasNextPage || list.loading}
              onClick={() => setPage((n) => n + 1)}
            >
              Next
            </button>
          </div>
        ) : null}
      </DataState>

      <Modal
        open={open !== null}
        onClose={() => setOpen(null)}
        title={open ? `${open.gatewayName} · ${open.settlementReference}` : ''}
        width={760}
      >
        {open ? (
          <div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
              <Kv k="Expected net" v={formatSar(open.expectedNetMinor)} />
              <Kv k="Actual net" v={formatSar(open.actualNetMinor)} />
              <Kv k="Variance" v={formatSar(open.varianceMinor)} />
              <Kv k="Payout" v={open.payoutDate ? new Date(open.payoutDate).toLocaleDateString() : '—'} />
            </div>
            {open.notes ? <p className="muted">{open.notes}</p> : null}
            <h4>Reconciliation lines ({open.transactions?.length ?? 0})</h4>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                    <th style={th}>Reference</th>
                    <th style={th}>Type</th>
                    <th style={th}>Amount</th>
                    <th style={th}>Fee</th>
                    <th style={th}>Match</th>
                    <th style={th}>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {(open.transactions ?? []).map((t) => (
                    <tr key={t.id}>
                      <td style={td}>{t.gatewayReference}</td>
                      <td style={td}>{t.type}</td>
                      <td style={td}>{formatSar(t.amountMinor)}</td>
                      <td style={td}>{formatSar(t.feeMinor)}</td>
                      <td style={td}>
                        <StatusChip label={t.matchStatus.toLowerCase()} tone={matchTone(t.matchStatus)} />
                      </td>
                      <td style={td}>{t.note ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function Kv({ k, v }: { k: string; v: string }): React.JSX.Element {
  return (
    <div>
      <p className="muted" style={{ margin: 0, fontSize: 11, textTransform: 'uppercase' }}>{k}</p>
      <p style={{ margin: 0, fontWeight: 600 }}>{v}</p>
    </div>
  );
}

const th: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid var(--border)', fontWeight: 600, whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' };
