import React, { useState } from 'react';

import { ApiError } from '../api/http';
import {
  RefundApprovalOutcome,
  RefundRequest,
  RefundRequestStatus,
  RefundStatus,
} from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { BranchSelect } from '../components/BranchSelect';
import { Modal } from '../components/Modal';
import { DataState, OrderReference, StatusChip } from '../components/ui';
import { useAsync } from '../hooks/useAsync';
import { formatMinor, formatSar, parseSarToMinor } from '../util/money';

type Tone = 'progress' | 'success' | 'danger' | 'warning' | 'neutral';

const REQUEST_STATUSES: (RefundRequestStatus | '')[] = [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'WITHDRAWN',
  '',
];

function requestTone(status: RefundRequestStatus): Tone {
  if (status === 'APPROVED') return 'success';
  if (status === 'REJECTED') return 'danger';
  if (status === 'WITHDRAWN') return 'neutral';
  return 'warning';
}

function refundTone(status: RefundStatus): Tone {
  if (status === 'COMPLETED') return 'success';
  if (status === 'FAILED' || status === 'CANCELLED') return 'danger';
  return 'progress';
}

/**
 * What an approval actually did, said in the words of the thing that happened.
 *
 * None of these say "refunded", because none of them refunded anything.
 * Approving is a promise; the money leaves when the owner sends it in Tap and
 * records it here. Saying otherwise would close a job nobody has done.
 */
function outcomeMessage(outcome: RefundApprovalOutcome): string {
  switch (outcome) {
    case 'AWAITING_PAYOUT':
      return 'Approved. It’s now waiting to be paid out — the owner refunds it in the Tap dashboard and records it here.';
    case 'MANUAL_SETTLEMENT':
      return 'Approved. This order was paid in cash, so there’s nothing to refund online — the branch hands the money back in person.';
    case 'CANCELLED_NO_REFUND':
      return 'Approved and the order was cancelled. Nothing had been paid, so no money is owed.';
  }
}

/**
 * Refunds: what customers asked for, what is owed, and what has been paid.
 *
 * Three sections because the owner's flow has three steps and two people in it:
 *
 *   1. **Requests** — the branch works this queue. Approve or decline.
 *   2. **Waiting to be paid out** — approved, money still owed. The owner
 *      refunds each one in the Tap dashboard and records it here with the
 *      reference. **This section existing is the point**: without it, approving
 *      would be a promise nothing tracked, and the only record that a customer
 *      is owed money would be a row in a queue nobody filters.
 *   3. **Refunds issued** — money that has actually left.
 *
 * The permission split matches the acts, and each control is gated on the one
 * it needs rather than on a role:
 *
 * | Act | Permission | Who |
 * | --- | --- | --- |
 * | See any of it | `refunds:read` | Owner, branch admin |
 * | Approve / decline | `refund-requests:decide` | Owner, branch admin |
 * | Record a payout | `refunds:write` | Owner only |
 *
 * A control the signed-in account cannot use is not rendered, rather than
 * rendered and answering 403 — the failure the Branch POS spent a phase
 * removing.
 */
export function RefundsPage(): React.JSX.Element {
  const { api, hasPermission } = useAuth();
  const canDecide = hasPermission('refund-requests:decide');
  /** Moving money is the owner's act, and a separate permission from deciding. */
  const canPayOut = hasPermission('refunds:write');

  const [branchId, setBranchId] = useState('');
  const [status, setStatus] = useState<RefundRequestStatus | ''>('PENDING');
  const [tick, setTick] = useState(0);
  const [deciding, setDeciding] = useState<RefundRequest | null>(null);
  const [payingOut, setPayingOut] = useState<RefundRequest | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const requests = useAsync(
    () =>
      api.listRefundRequests({
        branchId: branchId || undefined,
        status: status || undefined,
        limit: 50,
      }),
    [branchId, status, tick],
  );

  /**
   * Approved, money not yet sent. Its own request rather than a filter over the
   * list above, because it must be visible whatever status filter someone has
   * left the queue on — an unpaid refund that hides behind a dropdown is a
   * customer waiting on money nobody can see they are owed.
   */
  const owing = useAsync(
    () => api.listRefundRequests({ branchId: branchId || undefined, awaitingPayout: true, limit: 50 }),
    [branchId, tick],
  );

  const refunds = useAsync(
    () => api.listRefunds({ branchId: branchId || undefined, limit: 25 }),
    [branchId, tick],
  );

  const rows = requests.data?.data ?? [];
  const owingRows = owing.data?.data ?? [];
  const refundRows = refunds.data?.data ?? [];

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: 8,
          flexWrap: 'wrap',
        }}
      >
        <h2 style={{ margin: 0, flex: 1 }}>Refunds</h2>
        <BranchSelect value={branchId} onChange={setBranchId} allowAll width={220} />
      </div>

      <p className="muted" style={{ marginTop: 0, maxWidth: 780 }}>
        A request is a customer asking. Approving it is the branch agreeing — it does <strong>not</strong>{' '}
        send any money. The refund is issued in the Tap dashboard and recorded here, and only then is
        the customer told it’s on its way.
      </p>

      {notice ? (
        <p role="status" className="card" style={{ padding: '10px 14px' }}>
          {notice}
        </p>
      ) : null}

      <section style={{ marginTop: 16 }}>
        <div
          style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}
        >
          <h3 style={{ margin: 0, flex: 1 }}>Requests</h3>
          <select
            aria-label="Request status"
            value={status}
            onChange={(e) => setStatus(e.target.value as RefundRequestStatus | '')}
            style={{ width: 180 }}
          >
            {REQUEST_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s === '' ? 'All requests' : s.toLowerCase()}
              </option>
            ))}
          </select>
        </div>

        <DataState
          loading={requests.loading && rows.length === 0}
          error={requests.error?.message ?? null}
          empty={rows.length === 0}
          onRetry={requests.reload}
        >
          <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                  <th style={th}>Asked</th>
                  <th style={th}>Order</th>
                  <th style={th}>Wants</th>
                  <th style={th}>Why</th>
                  <th style={th}>Order total</th>
                  <th style={th}>Status</th>
                  <th style={th}>Decided by</th>
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td style={td}>{new Date(r.createdAt).toLocaleString()}</td>
                    <td style={td}>
                      <div>{r.order?.orderNumber ?? '—'}</div>
                      <OrderReference referenceId={r.order?.referenceId} />
                    </td>
                    <td style={td}>
                      {r.type === 'CANCELLATION' ? 'To cancel it' : 'Money back'}
                    </td>
                    {/* The customer's own words, in full. It is the whole basis
                        on which somebody decides, so it is not truncated. */}
                    <td style={{ ...td, whiteSpace: 'normal', maxWidth: 320 }}>{r.reason}</td>
                    <td style={td}>
                      {r.order ? formatSar(r.order.totalMinor) : '—'}
                      {r.refund ? (
                        <div className="muted" style={{ fontSize: 12 }}>
                          refunded {formatSar(r.refund.amountMinor)}
                        </div>
                      ) : null}
                    </td>
                    <td style={td}>
                      <StatusChip label={r.status.toLowerCase()} tone={requestTone(r.status)} />
                      {/* Approved is not paid. Which of the three it is decides
                          whether anyone still has a job to do. */}
                      {r.status === 'APPROVED' && !r.refundIssuedAt ? (
                        <div style={{ fontSize: 12, color: 'var(--warning)' }}>
                          {r.approvedAmountMinor
                            ? `owed ${formatSar(r.approvedAmountMinor)}`
                            : 'settle at the branch'}
                        </div>
                      ) : null}
                      {r.refundIssuedAt ? (
                        <div className="muted" style={{ fontSize: 12 }}>
                          paid {new Date(r.refundIssuedAt).toLocaleDateString()}
                        </div>
                      ) : null}
                    </td>
                    <td style={td}>{r.reviewedByUser?.fullName ?? '—'}</td>
                    <td style={td}>
                      {r.status === 'PENDING' && canDecide ? (
                        <button
                          className="btn btn-ghost"
                          onClick={() => setDeciding(r)}
                          style={{ padding: '4px 12px' }}
                        >
                          Review
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DataState>

        {!canDecide ? (
          <p className="muted" style={{ marginTop: 8 }}>
            Deciding a refund request needs the <code>refunds:write</code> permission, which is held
            by the owner. You can see your branch&rsquo;s requests here.
          </p>
        ) : null}
      </section>

      <section style={{ marginTop: 28 }}>
        <h3 style={{ marginBottom: 4 }}>Waiting to be paid out</h3>
        <p className="muted" style={{ marginTop: 0, maxWidth: 780 }}>
          The branch has agreed these and the customer has been told to expect a refund.{' '}
          {canPayOut
            ? 'Refund each one in the Tap dashboard, then record it here with Tap’s reference — that’s what marks the order refunded and tells the customer it’s been sent.'
            : 'The owner issues these in the Tap dashboard.'}
        </p>

        <DataState
          loading={owing.loading && owingRows.length === 0}
          error={owing.error?.message ?? null}
          empty={owingRows.length === 0}
          onRetry={owing.reload}
        >
          <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                  <th style={th}>Approved</th>
                  <th style={th}>Order</th>
                  <th style={th}>Customer</th>
                  <th style={th}>Owed</th>
                  <th style={th}>Approved by</th>
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {owingRows.map((r) => (
                  <tr key={r.id}>
                    <td style={td}>
                      {r.reviewedAt ? new Date(r.reviewedAt).toLocaleString() : '—'}
                    </td>
                    <td style={td}>
                      <div>{r.order?.orderNumber ?? '—'}</div>
                      <OrderReference referenceId={r.order?.referenceId} />
                    </td>
                    <td style={td}>{r.customer?.fullName ?? r.customer?.phone ?? '—'}</td>
                    <td style={{ ...td, fontWeight: 700 }}>
                      {r.approvedAmountMinor !== null
                        ? formatSar(r.approvedAmountMinor)
                        : // Nothing was captured online — there is no payout to
                          // make here, and offering one would be wrong.
                          'cash — settle at the branch'}
                    </td>
                    <td style={td}>{r.reviewedByUser?.fullName ?? '—'}</td>
                    <td style={td}>
                      {canPayOut && r.approvedAmountMinor !== null ? (
                        <button
                          className="btn btn-ghost"
                          onClick={() => setPayingOut(r)}
                          style={{ padding: '4px 12px' }}
                        >
                          Record refund
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DataState>
      </section>

      <section style={{ marginTop: 28 }}>
        <h3 style={{ marginBottom: 8 }}>Refunds issued</h3>
        <DataState
          loading={refunds.loading && refundRows.length === 0}
          error={refunds.error?.message ?? null}
          empty={refundRows.length === 0}
          onRetry={refunds.reload}
        >
          <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                  <th style={th}>Requested</th>
                  <th style={th}>Order</th>
                  <th style={th}>Amount</th>
                  <th style={th}>Reason</th>
                  <th style={th}>Reference</th>
                  <th style={th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {refundRows.map((r) => (
                  <tr key={r.id}>
                    <td style={td}>{new Date(r.requestedAt).toLocaleString()}</td>
                    <td style={td}>
                      <OrderReference referenceId={r.order?.referenceId} />
                    </td>
                    <td style={td}>{formatSar(r.amountMinor)}</td>
                    <td style={{ ...td, whiteSpace: 'normal', maxWidth: 320 }}>{r.reason}</td>
                    <td style={td}>
                      {/* Tap's own reference for a refund issued by hand — the
                          thing that ties this row to its payout line. */}
                      <code style={{ fontSize: 12 }}>{r.gatewayReference ?? '—'}</code>
                    </td>
                    <td style={td}>
                      <StatusChip label={r.status.toLowerCase()} tone={refundTone(r.status)} />
                      {r.issuedManually ? (
                        <div className="muted" style={{ fontSize: 12 }}>
                          issued in Tap
                        </div>
                      ) : null}
                      {r.failureReason ? (
                        <div className="muted" style={{ fontSize: 12 }}>
                          {r.failureReason}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DataState>
      </section>

      <Modal
        open={payingOut !== null}
        onClose={() => setPayingOut(null)}
        title={payingOut ? `Record refund · order ${payingOut.order?.orderNumber ?? ''}` : ''}
      >
        {payingOut ? (
          <RecordPayoutForm
            request={payingOut}
            onSubmit={(body) => api.recordRefundIssued(payingOut.id, body)}
            onDone={(message) => {
              setPayingOut(null);
              setNotice(message);
              setTick((n) => n + 1);
            }}
          />
        ) : null}
      </Modal>

      <Modal
        open={deciding !== null}
        onClose={() => setDeciding(null)}
        title={deciding ? `Order ${deciding.order?.orderNumber ?? ''}` : ''}
      >
        {deciding ? (
          <DecisionForm
            request={deciding}
            onApprove={(body) => api.approveRefundRequest(deciding.id, body)}
            onReject={(body) => api.rejectRefundRequest(deciding.id, body)}
            onDone={(message) => {
              setDeciding(null);
              setNotice(message);
              setTick((n) => n + 1);
            }}
          />
        ) : null}
      </Modal>
    </div>
  );
}

/**
 * Exported for tests. This form both cancels an order and pays money out, and
 * neither is visible from a mounted page — what the body says is the whole
 * behaviour.
 */
export function DecisionForm({
  request,
  onApprove,
  onReject,
  onDone,
}: {
  request: RefundRequest;
  onApprove: (body: {
    amountMinor?: number;
    note?: string;
    cancelOrder?: boolean;
  }) => Promise<{ outcome: RefundApprovalOutcome }>;
  onReject: (body: { note: string }) => Promise<unknown>;
  onDone: (message: string) => void;
}): React.JSX.Element {
  const total = request.order?.totalMinor ?? 0;
  const [full, setFull] = useState(true);
  const [amount, setAmount] = useState(formatMinor(total));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Cancelling and refunding are separate decisions, and the server will only
   * accept one of them on an order past pickup. The default follows what the
   * customer asked for; the checkbox is here because a branch sometimes wants
   * the other one.
   */
  const [cancelOrder, setCancelOrder] = useState(request.type === 'CANCELLATION');

  const run = async (action: 'approve' | 'reject'): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      if (action === 'reject') {
        if (!note.trim()) {
          setError('Tell the customer why. They read this.');
          setBusy(false);
          return;
        }
        await onReject({ note: note.trim() });
        onDone('Declined. The customer has been told why.');
        return;
      }

      let amountMinor: number | undefined;
      if (!full) {
        amountMinor = parseSarToMinor(amount);
        if (!Number.isFinite(amountMinor) || amountMinor <= 0 || amountMinor > total) {
          setError(`Amount must be between 0.01 and ${formatSar(total)}.`);
          setBusy(false);
          return;
        }
      }

      const { outcome } = await onApprove({
        amountMinor,
        note: note.trim() || undefined,
        cancelOrder,
      });
      onDone(outcomeMessage(outcome));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save that decision.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <p style={{ marginTop: 0 }}>
        <strong>
          {request.customer?.fullName ?? request.customer?.phone ?? 'The customer'}
        </strong>{' '}
        asked {request.type === 'CANCELLATION' ? 'to cancel this order' : 'for money back'}:
      </p>
      <blockquote
        style={{
          margin: '0 0 12px',
          padding: '8px 12px',
          borderLeft: '3px solid var(--border)',
          whiteSpace: 'pre-wrap',
        }}
      >
        {request.reason}
      </blockquote>

      <p className="muted" style={{ marginTop: 0 }}>
        Order total <strong>{formatSar(total)}</strong>. A refund can never exceed what is still
        refundable on the payment — the server caps it.
      </p>

      <label style={{ display: 'flex', gap: 6, alignItems: 'center', margin: '8px 0' }}>
        <input
          type="radio"
          checked={full}
          onChange={() => setFull(true)}
          style={{ width: 'auto' }}
        />
        Refund everything still refundable
      </label>
      <label style={{ display: 'flex', gap: 6, alignItems: 'center', margin: '8px 0' }}>
        <input
          type="radio"
          checked={!full}
          onChange={() => setFull(false)}
          style={{ width: 'auto' }}
        />
        Refund part of it
      </label>
      {!full ? (
        <label style={{ display: 'block', marginTop: 4 }}>
          <span className="muted" style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>
            Amount (SAR)
          </span>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
        </label>
      ) : null}

      <label style={{ display: 'flex', gap: 6, alignItems: 'center', margin: '12px 0' }}>
        <input
          type="checkbox"
          checked={cancelOrder}
          onChange={(e) => setCancelOrder(e.target.checked)}
          style={{ width: 'auto' }}
        />
        Cancel the order as well
      </label>
      <p className="muted" style={{ marginTop: -6, fontSize: 12 }}>
        An order that has already been handed over cannot be cancelled — refunding one leaves it
        delivered, which is what happened.
      </p>

      <label style={{ display: 'block', marginTop: 12 }}>
        <span className="muted" style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>
          Note to the customer (required to decline)
        </span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
      </label>

      {error ? (
        <p role="alert" style={{ color: 'var(--danger)' }}>
          {error}
        </p>
      ) : null}

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button className="btn" disabled={busy} onClick={() => void run('approve')}>
          {busy ? 'Saving…' : 'Approve'}
        </button>
        <button className="btn btn-ghost" disabled={busy} onClick={() => void run('reject')}>
          Decline
        </button>
      </div>
    </div>
  );
}

/**
 * Exported for tests. The owner recording a refund they have already sent in
 * the Tap dashboard.
 *
 * Two things make this worth asserting rather than eyeballing. The reference is
 * **required** — a refund recorded with nothing to match it against cannot be
 * tied to a payout line at reconciliation, and the person who could have pasted
 * it is gone by the time anyone notices. And the amount defaults to what the
 * branch approved and is not re-entered: retyping a figure that is already
 * agreed is how the customer's refund and the branch's promise drift apart.
 */
export function RecordPayoutForm({
  request,
  onSubmit,
  onDone,
}: {
  request: RefundRequest;
  onSubmit: (body: {
    gatewayReference: string;
    amountMinor?: number;
    note?: string;
  }) => Promise<unknown>;
  onDone: (message: string) => void;
}): React.JSX.Element {
  const approved = request.approvedAmountMinor ?? 0;
  const [gatewayReference, setGatewayReference] = useState('');
  const [amount, setAmount] = useState(formatMinor(approved));
  const [differs, setDiffers] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!gatewayReference.trim()) {
      setError('Paste the reference Tap gave the refund.');
      return;
    }

    let amountMinor: number | undefined;
    if (differs) {
      amountMinor = parseSarToMinor(amount);
      if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
        setError('Enter the amount you actually refunded.');
        return;
      }
    }

    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        gatewayReference: gatewayReference.trim(),
        amountMinor,
        note: note.trim() || undefined,
      });
      onDone('Recorded. The order now shows as refunded and the customer has been told.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not record that refund.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <p style={{ marginTop: 0 }}>
        Refund <strong>{formatSar(approved)}</strong> in the Tap dashboard first, then record it
        here.
      </p>
      <p className="muted" style={{ marginTop: 0 }}>
        This is what marks the order refunded and tells the customer their money has been sent — so
        only press it once the money has actually left.
      </p>

      <label style={{ display: 'block', marginTop: 12 }}>
        <span className="muted" style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>
          Tap reference
        </span>
        {/* Deliberately not `required`: the browser's own validation cancels
            the submit and shows a generic bubble, so the sentence explaining
            *why* this reference matters would never be reached. */}
        <input
          value={gatewayReference}
          onChange={(e) => setGatewayReference(e.target.value)}
          placeholder="e.g. re_TS0123..."
        />
      </label>

      <label style={{ display: 'flex', gap: 6, alignItems: 'center', margin: '12px 0' }}>
        <input
          type="checkbox"
          checked={differs}
          onChange={(e) => setDiffers(e.target.checked)}
          style={{ width: 'auto' }}
        />
        I refunded a different amount
      </label>
      {differs ? (
        <label style={{ display: 'block' }}>
          <span className="muted" style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>
            Amount actually refunded (SAR)
          </span>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
        </label>
      ) : null}

      <label style={{ display: 'block', marginTop: 12 }}>
        <span className="muted" style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>
          Note (kept on the refund record)
        </span>
        <input value={note} onChange={(e) => setNote(e.target.value)} />
      </label>

      {error ? (
        <p role="alert" style={{ color: 'var(--danger)' }}>
          {error}
        </p>
      ) : null}

      <button className="btn" disabled={busy} style={{ width: '100%', marginTop: 12 }}>
        {busy ? 'Recording…' : 'Record refund'}
      </button>
    </form>
  );
}

const th: React.CSSProperties = {
  padding: '10px 12px',
  borderBottom: '1px solid var(--border)',
  fontWeight: 600,
  whiteSpace: 'nowrap',
};
const td: React.CSSProperties = {
  padding: '10px 12px',
  borderBottom: '1px solid var(--border)',
  whiteSpace: 'nowrap',
  verticalAlign: 'top',
};
