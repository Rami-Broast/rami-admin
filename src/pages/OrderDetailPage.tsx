import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { ApiError } from '../api/http';
import { useAuth } from '../auth/AuthProvider';
import { DataState, OrderReference, StatusChip } from '../components/ui';
import { OrderBreakdown } from '../components/OrderBreakdown';
import { useAsync } from '../hooks/useAsync';
import { PrintButton } from '../print/PrintButton';
import { orderDocument } from '../print/document';
import { usePrintContext } from '../print/usePrintContext';
import { formatSar } from '../util/money';

function statusTone(s: string): 'progress' | 'success' | 'danger' | 'neutral' | 'warning' {
  if (s === 'DELIVERED') return 'success';
  if (s === 'CANCELLED' || s === 'PAYMENT_FAILED') return 'danger';
  if (s === 'REFUNDED' || s === 'PARTIALLY_REFUNDED') return 'warning';
  return 'progress';
}

/**
 * A full order: items with modifiers, snapshotted totals, status timeline,
 * customer, plus the staff transitions the current status allows.
 */
export function OrderDetailPage(): React.JSX.Element {
  const { id = '' } = useParams<{ id: string }>();
  const nav = useNavigate();
  const { api } = useAuth();
  const [tick, setTick] = useState(0);
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const order = useAsync(() => api.getOrder(id), [id, tick]);
  const payments = useAsync(() => api.listPayments({ orderId: id, limit: 10 }), [id, tick]);
  const edits = useAsync(() => api.orderEdits(id), [id, tick]);
  const o = order.data;
  const p = payments.data?.data?.[0];
  const printContext = usePrintContext(o?.branchId ?? '');

  const act = async (label: string, fn: () => Promise<unknown>): Promise<void> => {
    setActing(label);
    setError(null);
    try {
      await fn();
      setTick((n) => n + 1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action failed.');
    } finally {
      setActing(null);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <button className="btn btn-ghost" onClick={() => nav(-1)} style={{ padding: '4px 12px' }}>
          ← Back
        </button>
        <h2 style={{ margin: 0 }}>Order {o?.orderNumber ?? ''}</h2>
        {/* The order number repeats across branches; this reference does not,
            so it is what staff quote when checking one specific order. */}
        <div style={{ flex: 1 }}>{o ? <OrderReference referenceId={o.referenceId} /> : null}</div>
        <PrintButton
          document={o ? orderDocument(o, printContext) : null}
          label="Print order"
        />
      </div>

      <DataState
        loading={order.loading && !o}
        error={order.error?.message ?? null}
        onRetry={order.reload}
      >
        {o ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>
            <div>
              <div className="card" style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <StatusChip label={o.status.replace(/_/g, ' ').toLowerCase()} tone={statusTone(o.status)} />
                  <StatusChip
                    label={`payment: ${o.paymentStatus.replace(/_/g, ' ').toLowerCase()}`}
                    tone={o.paymentStatus === 'PAID' ? 'success' : o.paymentStatus === 'FAILED' ? 'danger' : 'progress'}
                  />
                  <span className="muted">{o.type.toLowerCase()} · {o.branch?.name}</span>
                </div>
                {o.customerNotes ? (
                  <p style={{ marginBottom: 0 }}>
                    <strong>Customer note:</strong> {o.customerNotes}
                  </p>
                ) : null}

                <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                  {o.status === 'AWAITING_ACCEPTANCE' ? (
                    <>
                      <button className="btn" disabled={acting !== null} onClick={() => act('accept', () => api.acceptOrder(o.id))}>
                        {acting === 'accept' ? 'Accepting…' : 'Accept order'}
                      </button>
                      <button
                        className="btn btn-ghost"
                        style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
                        disabled={acting !== null}
                        onClick={() => {
                          const reason = prompt('Rejection reason?');
                          if (reason && reason.trim()) {
                            act('reject', () => api.rejectOrder(o.id, reason.trim()));
                          }
                        }}
                      >
                        Reject order
                      </button>
                    </>
                  ) : null}
                  {o.status === 'CONFIRMED' ? (
                    <button className="btn" disabled={acting !== null} onClick={() => act('preparing', () => api.markPreparing(o.id))}>
                      {acting === 'preparing' ? 'Starting…' : 'Start preparing'}
                    </button>
                  ) : null}
                  {o.status === 'PREPARING' ? (
                    <button className="btn" disabled={acting !== null} onClick={() => act('ready', () => api.markReady(o.id))}>
                      {acting === 'ready' ? 'Marking…' : 'Mark ready'}
                    </button>
                  ) : null}
                  {o.status === 'READY' && o.type === 'PICKUP' ? (
                    <button className="btn" disabled={acting !== null} onClick={() => act('pickup', () => api.completePickup(o.id))}>
                      {acting === 'pickup' ? 'Completing…' : 'Complete pickup'}
                    </button>
                  ) : null}
                  {(o.status === 'PENDING_PAYMENT' || o.status === 'CONFIRMED' || o.status === 'PREPARING' || o.status === 'READY' || o.status === 'DRIVER_ASSIGNED') ? (
                    <button
                      className="btn btn-ghost"
                      style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
                      disabled={acting !== null}
                      onClick={() => {
                        const reason = prompt('Cancellation reason? (audited)');
                        if (reason && reason.trim()) {
                          act('cancel', () => api.cancelOrder(o.id, reason.trim()));
                        }
                      }}
                    >
                      Cancel order
                    </button>
                  ) : null}
                </div>
                {error ? <p style={{ color: 'var(--danger)', marginBottom: 0 }}>{error}</p> : null}
              </div>

              <div className="card" style={{ marginBottom: 12 }}>
                <h3 style={{ marginTop: 0 }}>Items</h3>
                <div style={{ display: 'grid', gap: 10 }}>
                  {o.items.map((it) => (
                    <div key={it.id} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <span style={{ flex: 1 }}>
                          <strong>{it.quantity} × {it.productName}</strong>
                        </span>
                        <span>{formatSar(it.totalMinor)}</span>
                      </div>
                      {it.modifiers.length > 0 ? (
                        <ul className="muted" style={{ margin: '4px 0 0 20px', fontSize: 13 }}>
                          {it.modifiers.map((m) => (
                            <li key={m.id}>
                              {m.addonName}
                              {m.priceDeltaMinor > 0 ? ` (+${formatSar(m.priceDeltaMinor)})` : ''}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {it.notes ? <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>Note: {it.notes}</p> : null}
                    </div>
                  ))}
                </div>
              </div>

              <div className="card">
                <h3 style={{ marginTop: 0 }}>Totals</h3>
                {/* The backend's own itemised list, snapshotted at placement —
                    so this view, the customer's summary and the Branch POS
                    cannot disagree about what an order was charged. */}
                <OrderBreakdown order={o} />
              </div>
            </div>

            <aside>
              <div className="card" style={{ marginBottom: 12 }}>
                <h3 style={{ marginTop: 0 }}>Customer</h3>
                <p style={{ margin: 0 }}>{o.customer?.fullName ?? '—'}</p>
                <p className="muted" style={{ margin: '4px 0 0' }}>{o.customer?.phone}</p>
              </div>

              {p ? (
                <div className="card" style={{ marginBottom: 12 }}>
                  <h3 style={{ marginTop: 0 }}>Payment</h3>
                  <p style={{ margin: 0 }}>
                    <strong>{p.status.replace(/_/g, ' ').toLowerCase()}</strong>
                    {p.method ? ` · ${p.method}` : ''} · {p.gatewayName}
                  </p>
                  <p className="muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
                    Amount {formatSar(p.amountMinor)}
                    {p.capturedAmountMinor ? ` · Captured ${formatSar(p.capturedAmountMinor)}` : ''}
                    {p.refundedAmountMinor ? ` · Refunded ${formatSar(p.refundedAmountMinor)}` : ''}
                  </p>
                  {p.gatewayReference || p.gatewayPaymentId ? (
                    <p className="muted" style={{ margin: '4px 0 0', fontSize: 12, wordBreak: 'break-all' }}>
                      Txn: {p.gatewayReference ?? p.gatewayPaymentId}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div className="card">
                <h3 style={{ marginTop: 0 }}>Timeline</h3>
                <ol style={{ margin: 0, paddingLeft: 18 }}>
                  {o.statusHistory.map((h) => (
                    <li key={h.id} style={{ marginBottom: 8 }}>
                      <strong>{h.status.replace(/_/g, ' ').toLowerCase()}</strong>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {new Date(h.createdAt).toLocaleString()}
                        {h.reason ? ` — ${h.reason}` : ''}
                      </div>
                    </li>
                  ))}
                </ol>
              </div>

              {edits.data && edits.data.length > 0 ? (
                <div className="card" style={{ marginTop: 12 }}>
                  <h3 style={{ marginTop: 0 }}>Edit history</h3>
                  <ol style={{ margin: 0, paddingLeft: 18 }}>
                    {edits.data.map((e) => (
                      <li key={e.id} style={{ marginBottom: 10 }}>
                        <strong>{e.action.replace(/_/g, ' ').toLowerCase()}</strong>
                        <div className="muted" style={{ fontSize: 12 }}>
                          {new Date(e.createdAt).toLocaleString()}
                          {e.editedByUser ? ` — ${e.editedByUser.fullName}` : ''}
                        </div>
                        {e.reason ? <div style={{ fontSize: 13, marginTop: 2 }}>{e.reason}</div> : null}
                        {snapshotDiff(e.snapshotBefore, e.snapshotAfter)}
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}
            </aside>
          </div>
        ) : null}
      </DataState>
    </div>
  );
}

/** Renders the fields that changed between two snapshot objects, compactly. */
function snapshotDiff(before: unknown, after: unknown): React.JSX.Element | null {
  const b = (before && typeof before === 'object' ? before : {}) as Record<string, unknown>;
  const a = (after && typeof after === 'object' ? after : {}) as Record<string, unknown>;
  const keys = Array.from(new Set([...Object.keys(b), ...Object.keys(a)]));
  const changed = keys.filter((k) => JSON.stringify(b[k]) !== JSON.stringify(a[k]));
  if (changed.length === 0) return null;
  const show = (v: unknown): string => (v === undefined || v === null ? '—' : String(v));
  return (
    <div style={{ marginTop: 4, fontSize: 12 }}>
      {changed.map((k) => (
        <div key={k} className="muted">
          {k}: <span style={{ textDecoration: 'line-through' }}>{show(b[k])}</span> → <strong>{show(a[k])}</strong>
        </div>
      ))}
    </div>
  );
}

