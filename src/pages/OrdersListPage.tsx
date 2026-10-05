import React, { useState } from 'react';

import { useAuth } from '../auth/AuthProvider';
import { BranchSelect } from '../components/BranchSelect';
import { DataState, StatusChip } from '../components/ui';
import { useAsync } from '../hooks/useAsync';
import { PrintButton } from '../print/PrintButton';
import { ordersListDocument, periodOf } from '../print/document';
import { usePrintContext } from '../print/usePrintContext';
import { formatSar } from '../util/money';

const ORDER_STATUSES = [
  '',
  'PENDING_PAYMENT',
  'AWAITING_ACCEPTANCE',
  'CONFIRMED',
  'PREPARING',
  'READY',
  'DRIVER_ASSIGNED',
  'PICKED_UP',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'PAYMENT_FAILED',
  'CANCELLED',
  'REFUND_PENDING',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
] as const;

function statusTone(s: string): 'progress' | 'success' | 'danger' | 'neutral' | 'warning' {
  if (s === 'DELIVERED') return 'success';
  if (s === 'CANCELLED' || s === 'PAYMENT_FAILED') return 'danger';
  if (s === 'REFUNDED' || s === 'PARTIALLY_REFUNDED') return 'warning';
  if (s === 'PENDING_PAYMENT' || s === 'CONFIRMED') return 'neutral';
  return 'progress';
}

/**
 * The full orders list. Every order across every branch the caller can see
 * (owner all; branch staff their branches). Filter by status/branch and click
 * through to a full order detail.
 */
export function OrdersListPage({ onOpen }: { onOpen: (id: string) => void }): React.JSX.Element {
  const { api } = useAuth();
  const [branchId, setBranchId] = useState('');
  const [status, setStatus] = useState<string>('');
  const [page, setPage] = useState(1);

  const orders = useAsync(
    () => api.listOrders({
      branchId: branchId || undefined,
      status: status || undefined,
      page,
      limit: 25,
    }),
    [branchId, status, page],
  );

  const rows = orders.data?.data ?? [];
  const meta = orders.data?.meta;
  const printContext = usePrintContext(branchId);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, flex: 1 }}>Orders</h2>
        <BranchSelect value={branchId} onChange={(v) => { setBranchId(v); setPage(1); }} allowAll width={220} />
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          style={{ width: 200 }}
        >
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>{s === '' ? 'All statuses' : s.replace(/_/g, ' ').toLowerCase()}</option>
          ))}
        </select>
        <PrintButton
          document={
            rows.length > 0
              ? ordersListDocument(
                  rows.map((o) => ({
                    orderNumber: o.orderNumber,
                    referenceId: o.referenceId,
                    placedAt: o.placedAt,
                    branchName: o.branch?.name,
                    type: o.type,
                    status: o.status,
                    paymentStatus: o.paymentStatus,
                    totalMinor: o.totalMinor,
                  })),
                  // The list is filtered, not date-ranged, so the printed
                  // period is the span the rows actually cover — a header
                  // claiming a range nobody chose would be a fabricated fact.
                  periodOf(rows.map((o) => o.placedAt)),
                  printContext,
                )
              : null
          }
          label="Print list"
        />
      </div>

      <DataState
        loading={orders.loading && rows.length === 0}
        error={orders.error?.message ?? null}
        empty={rows.length === 0}
        onRetry={orders.reload}
      >
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                <th style={th}>Order</th>
                <th style={th}>Reference</th>
                <th style={th}>Branch</th>
                <th style={th}>Type</th>
                <th style={th}>Customer</th>
                <th style={th}>Total</th>
                <th style={th}>Status</th>
                <th style={th}>Payment</th>
                <th style={th}>Placed</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr
                  key={o.id}
                  onClick={() => onOpen(o.id)}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-alt)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={td}><strong>{o.orderNumber}</strong></td>
                  <td style={td}>
                    <code style={{ fontSize: 13 }}>{o.referenceId ?? '—'}</code>
                  </td>
                  <td style={td}>{o.branch?.name ?? '—'}</td>
                  <td style={td}>{o.type.toLowerCase()}</td>
                  <td style={td}>{o.customer?.fullName ?? o.customer?.phone ?? '—'}</td>
                  <td style={td}>{formatSar(o.totalMinor)}</td>
                  <td style={td}>
                    <StatusChip label={o.status.replace(/_/g, ' ').toLowerCase()} tone={statusTone(o.status)} />
                  </td>
                  <td style={td}>{o.paymentStatus?.replace(/_/g, ' ').toLowerCase() ?? '—'}</td>
                  <td style={td}>{new Date(o.placedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {meta ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
            <button
              className="btn btn-ghost"
              disabled={page <= 1 || orders.loading}
              onClick={() => setPage((n) => Math.max(1, n - 1))}
            >
              Previous
            </button>
            <span className="muted">
              Page {meta.page} of {Math.max(1, meta.totalPages)} · {meta.total} orders
            </span>
            <button
              className="btn btn-ghost"
              disabled={!meta.hasNextPage || orders.loading}
              onClick={() => setPage((n) => n + 1)}
            >
              Next
            </button>
          </div>
        ) : null}
      </DataState>
    </div>
  );
}

const th: React.CSSProperties = { padding: '10px 12px', borderBottom: '1px solid var(--border)', fontWeight: 600, whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '10px 12px', borderBottom: '1px solid var(--border)' };
