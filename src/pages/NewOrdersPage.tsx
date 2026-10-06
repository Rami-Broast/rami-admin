import React, { useEffect, useMemo, useRef, useState } from 'react';

import { ApiError } from '../api/http';
import { OrderDetail } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { BranchSelect } from '../components/BranchSelect';
import { Modal } from '../components/Modal';
import { DataState, LiveBadge, OrderReference } from '../components/ui';
import { useAsync } from '../hooks/useAsync';
import { useRealtimeReload } from '../realtime/RealtimeProvider';
import { formatSar } from '../util/money';

/**
 * Rejection reasons the spec (§7) canned. Server takes free text, but the
 * client offers these first so a rejection is one tap plus a confirm.
 */
const REJECTION_REASONS = [
  'Restaurant too busy',
  'Item unavailable',
  'Branch closed',
  'Delivery unavailable',
  'Other',
] as const;

/**
 * The branch's "new orders" tray, for branches with autoAcceptOrders=false.
 * Driven by the realtime socket — the tray refreshes the instant an order
 * lands or moves — and beeps once when a fresh order appears.
 */
export function NewOrdersPage(): React.JSX.Element {
  const { api } = useAuth();
  const [branchId, setBranchId] = useState('');
  const [tick, setTick] = useState(0);
  const [acting, setActing] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<OrderDetail | null>(null);
  const seenIds = useRef<Set<string>>(new Set());

  const queue = useAsync(
    () => (branchId ? api.awaitingAcceptanceQueue(branchId) : Promise.resolve([])),
    [branchId, tick],
  );

  // Realtime: refresh the tray the instant an order lands or moves, instead of
  // the old 5-second poll. Also catches up on (re)connect.
  const rtStatus = useRealtimeReload(
    ['order.awaiting', 'order.transitioned'],
    () => setTick((n) => n + 1),
  );

  // Beep on the first appearance of an order id we hadn't seen. Silenced on
  // the very first load so switching branches isn't a beep-a-thon.
  // Memoised for the effect below: a fresh `[]` each render would re-run the
  // new-order check on every render rather than when the queue actually changes.
  const orders = useMemo<OrderDetail[]>(() => queue.data ?? [], [queue.data]);
  useEffect(() => {
    if (!orders.length) return;
    const wasEmpty = seenIds.current.size === 0;
    let fresh = false;
    for (const o of orders) {
      if (!seenIds.current.has(o.id)) {
        seenIds.current.add(o.id);
        if (!wasEmpty) fresh = true;
      }
    }
    if (fresh) beep();
  }, [orders]);

  const accept = async (o: OrderDetail): Promise<void> => {
    setActing(o.id);
    try {
      await api.acceptOrder(o.id);
      setTick((n) => n + 1);
    } finally {
      setActing(null);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <h2 style={{ margin: 0, flex: 1 }}>New orders</h2>
        <LiveBadge status={rtStatus} />
        <BranchSelect value={branchId} onChange={setBranchId} width={240} />
      </div>

      <DataState
        loading={queue.loading && orders.length === 0}
        error={queue.error?.message ?? null}
        empty={orders.length === 0}
        onRetry={queue.reload}
      >
        <div style={{ display: 'grid', gap: 12 }}>
          {orders.map((o) => (
            <div
              key={o.id}
              className="card"
              style={{ borderColor: 'var(--magenta)', borderWidth: 2, padding: 16 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <div style={{ flex: 1 }}>
                  <strong style={{ fontSize: 18 }}>{o.orderNumber}</strong>
                  <div style={{ marginTop: 2 }}>
                    <OrderReference referenceId={o.referenceId} />
                  </div>
                </div>
                <span className="muted">{new Date(o.placedAt).toLocaleTimeString()}</span>
                <span style={{ fontWeight: 700, fontSize: 18 }}>{formatSar(o.totalMinor)}</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <p className="muted" style={{ margin: 0, fontSize: 12, textTransform: 'uppercase' }}>Customer</p>
                  <p style={{ margin: '2px 0 0' }}>{o.customer?.fullName ?? '—'}</p>
                  <p className="muted" style={{ margin: 0, fontSize: 12 }}>{o.customer?.phone}</p>
                </div>
                <div>
                  <p className="muted" style={{ margin: 0, fontSize: 12, textTransform: 'uppercase' }}>Type · Payment</p>
                  <p style={{ margin: '2px 0 0' }}>
                    {o.type.toLowerCase()} · {o.paymentStatus === 'PAID' ? 'PAID' : o.paymentStatus.toLowerCase()}
                  </p>
                </div>
              </div>

              <div style={{ marginTop: 10 }}>
                <p className="muted" style={{ margin: 0, fontSize: 12, textTransform: 'uppercase' }}>Items</p>
                <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
                  {o.items.map((it) => (
                    <li key={it.id}>
                      <strong>{it.quantity} × {it.productName}</strong>
                      {it.modifiers.length > 0
                        ? ` — ${it.modifiers.map((m) => m.addonName).join(', ')}`
                        : ''}
                    </li>
                  ))}
                </ul>
                {o.customerNotes ? (
                  <p style={{ margin: '8px 0 0' }}>
                    <strong>Note:</strong> {o.customerNotes}
                  </p>
                ) : null}
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button
                  className="btn"
                  disabled={acting === o.id}
                  onClick={() => accept(o)}
                  style={{ flex: 1, padding: '12px 24px', fontSize: 16 }}
                >
                  {acting === o.id ? 'Accepting…' : 'ACCEPT'}
                </button>
                <button
                  className="btn btn-ghost"
                  disabled={acting === o.id}
                  onClick={() => setRejecting(o)}
                  style={{
                    flex: 1,
                    padding: '12px 24px',
                    fontSize: 16,
                    color: 'var(--danger)',
                    borderColor: 'var(--danger)',
                  }}
                >
                  REJECT
                </button>
              </div>
            </div>
          ))}
        </div>
      </DataState>

      <Modal
        open={rejecting !== null}
        onClose={() => setRejecting(null)}
        title={rejecting ? `Reject ${rejecting.orderNumber}?` : ''}
      >
        {rejecting ? (
          <RejectForm
            onCancel={() => setRejecting(null)}
            onSubmit={async (reason) => {
              await api.rejectOrder(rejecting.id, reason);
              setRejecting(null);
              setTick((n) => n + 1);
            }}
          />
        ) : null}
      </Modal>
    </div>
  );
}

function RejectForm({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (reason: string) => Promise<void>;
}): React.JSX.Element {
  const [choice, setChoice] = useState<string>(REJECTION_REASONS[0]);
  const [other, setOther] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    const reason = choice === 'Other' ? other.trim() : choice;
    if (!reason) {
      setError('Please enter a reason.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(reason);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to reject.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={send}>
      <p className="muted" style={{ marginTop: 0 }}>
        The customer will be notified. If online payment was taken, a refund will be issued via
        the existing cancellation flow.
      </p>
      {REJECTION_REASONS.map((r) => (
        <label key={r} style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '6px 0' }}>
          <input
            type="radio"
            checked={choice === r}
            onChange={() => setChoice(r)}
            style={{ width: 'auto' }}
          />
          {r}
        </label>
      ))}
      {choice === 'Other' ? (
        <input
          value={other}
          onChange={(e) => setOther(e.target.value)}
          placeholder="Describe the reason"
          autoFocus
          style={{ marginTop: 8 }}
        />
      ) : null}
      {error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : null}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={onCancel}
          disabled={busy}
          style={{ flex: 1 }}
        >
          Cancel
        </button>
        <button
          className="btn"
          disabled={busy}
          style={{
            flex: 1,
            background: 'var(--danger)',
          }}
        >
          {busy ? 'Rejecting…' : 'Confirm reject'}
        </button>
      </div>
    </form>
  );
}

// A very short square-wave chirp, no external file. Guarded so a browser
// without WebAudio silently skips it rather than throwing.
function beep(): void {
  try {
    const w = window as unknown as {
      AudioContext?: typeof AudioContext;
      webkitAudioContext?: typeof AudioContext;
    };
    const Ctx = w.AudioContext ?? w.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'square';
    o.frequency.value = 880;
    o.connect(g);
    g.connect(ctx.destination);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    o.start();
    o.stop(ctx.currentTime + 0.4);
  } catch {
    // Silent — audio is a nice-to-have.
  }
}
