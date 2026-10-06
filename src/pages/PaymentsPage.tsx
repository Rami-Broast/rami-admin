import React, { useState } from 'react';

import { ApiError } from '../api/http';
import { Payment, PaymentStatus } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { BranchSelect } from '../components/BranchSelect';
import { Modal } from '../components/Modal';
import { DataState, StatusChip } from '../components/ui';
import { useAsync } from '../hooks/useAsync';
import { PrintButton } from '../print/PrintButton';
import { periodOf, transactionsDocument } from '../print/document';
import { usePrintContext } from '../print/usePrintContext';
import { formatMinor, formatSar, parseSarToMinor, paymentMethodLabel } from '../util/money';

const STATUS_OPTIONS: (PaymentStatus | '')[] = [
  '',
  'PENDING',
  'AUTHORIZED',
  'PAID',
  'FAILED',
  'CANCELLED',
  'REFUND_PENDING',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
];

function tone(status: PaymentStatus): 'progress' | 'success' | 'danger' | 'neutral' | 'warning' {
  if (status === 'PAID') return 'success';
  if (status === 'FAILED' || status === 'CANCELLED') return 'danger';
  if (status === 'REFUNDED') return 'neutral';
  if (status === 'REFUND_PENDING' || status === 'PARTIALLY_REFUNDED') return 'warning';
  return 'progress';
}

/**
 * Payment lookup for staff, with a refund action for eligible payments.
 * Branch isolation is enforced server-side; branch admins only see theirs.
 */
export function PaymentsPage(): React.JSX.Element {
  const { api } = useAuth();
  const [branchId, setBranchId] = useState('');
  const [status, setStatus] = useState<PaymentStatus | ''>('');
  const [page, setPage] = useState(1);
  const [tick, setTick] = useState(0);
  const [refunding, setRefunding] = useState<Payment | null>(null);

  const payments = useAsync(
    () =>
      api.listPayments({
        branchId: branchId || undefined,
        status: status || undefined,
        page,
        limit: 25,
      }),
    [branchId, status, page, tick],
  );

  const rows = payments.data?.data ?? [];
  const meta = payments.data?.meta;
  const printContext = usePrintContext(branchId);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, flex: 1 }}>Payments</h2>
        <BranchSelect value={branchId} onChange={(v) => { setBranchId(v); setPage(1); }} allowAll width={220} />
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value as PaymentStatus | ''); setPage(1); }}
          style={{ width: 180 }}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s === '' ? 'All statuses' : s.replace(/_/g, ' ').toLowerCase()}
            </option>
          ))}
        </select>
        <PrintButton
          document={
            rows.length > 0
              ? transactionsDocument(
                  // Captured, not requested: a payment that was authorised but
                  // never captured moved no money, and printing its face value
                  // in a transactions total would overstate takings.
                  rows.map((p) => ({
                    at: p.createdAt,
                    orderNumber: p.order?.orderNumber,
                    referenceId: p.order?.referenceId,
                    kind: 'PAYMENT' as const,
                    method: p.method,
                    status: p.status,
                    amountMinor: p.capturedAmountMinor,
                  })),
                  periodOf(rows.map((p) => p.createdAt)),
                  printContext,
                )
              : null
          }
          label="Print transactions"
        />
      </div>

      <DataState
        loading={payments.loading && rows.length === 0}
        error={payments.error?.message ?? null}
        empty={rows.length === 0}
        onRetry={payments.reload}
      >
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                <th style={th}>Order</th>
                <th style={th}>Reference</th>
                <th style={th}>Method</th>
                <th style={th}>Gateway</th>
                <th style={th}>Amount</th>
                <th style={th}>Captured</th>
                <th style={th}>Refunded</th>
                <th style={th}>Status</th>
                <th style={th}>When</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const refundable =
                  (p.status === 'PAID' || p.status === 'PARTIALLY_REFUNDED') &&
                  p.capturedAmountMinor > p.refundedAmountMinor;
                return (
                  <tr key={p.id}>
                    <td style={td}>{p.order?.orderNumber ?? '—'}</td>
                    {/* Order numbers repeat across branches, so a payment is
                        matched to its order by this reference. */}
                    <td style={td}>
                      <code style={{ fontSize: 13 }}>{p.order?.referenceId ?? '—'}</code>
                    </td>
                    <td style={td}>{paymentMethodLabel(p.method)}</td>
                    <td style={td}>{p.gatewayName}</td>
                    <td style={td}>{formatSar(p.amountMinor)}</td>
                    <td style={td}>{formatSar(p.capturedAmountMinor)}</td>
                    <td style={td}>{formatSar(p.refundedAmountMinor)}</td>
                    <td style={td}>
                      <StatusChip label={p.status.replace(/_/g, ' ').toLowerCase()} tone={tone(p.status)} />
                    </td>
                    <td style={td}>{new Date(p.createdAt).toLocaleString()}</td>
                    <td style={td}>
                      {refundable ? (
                        <button
                          className="btn btn-ghost"
                          onClick={() => setRefunding(p)}
                          style={{ padding: '4px 12px' }}
                        >
                          Refund
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {meta ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
            <button
              className="btn btn-ghost"
              disabled={page <= 1 || payments.loading}
              onClick={() => setPage((n) => Math.max(1, n - 1))}
            >
              Previous
            </button>
            <span className="muted">
              Page {meta.page} of {Math.max(1, meta.totalPages)} · {meta.total} payments
            </span>
            <button
              className="btn btn-ghost"
              disabled={!meta.hasNextPage || payments.loading}
              onClick={() => setPage((n) => n + 1)}
            >
              Next
            </button>
          </div>
        ) : null}
      </DataState>

      <Modal
        open={refunding !== null}
        onClose={() => setRefunding(null)}
        title={refunding ? `Refund ${refunding.order?.orderNumber ?? refunding.id}` : ''}
      >
        {refunding ? (
          <RefundForm
            payment={refunding}
            onDone={() => {
              setRefunding(null);
              setTick((n) => n + 1);
            }}
            onSubmit={(body) => api.createRefund(body)}
          />
        ) : null}
      </Modal>
    </div>
  );
}

/**
 * Exported for tests. This is where money leaves the business, and the two
 * things most worth holding — that a partial refund cannot exceed what is
 * refundable, and that retrying does not refund twice — are only observable
 * from the form itself.
 */
export function RefundForm({
  payment,
  onSubmit,
  onDone,
}: {
  payment: Payment;
  onSubmit: (body: { paymentId: string; amountMinor?: number; reason: string; idempotencyKey?: string }) => Promise<unknown>;
  onDone: () => void;
}): React.JSX.Element {
  const remaining = payment.capturedAmountMinor - payment.refundedAmountMinor;
  const [amount, setAmount] = useState(formatMinor(remaining));
  /**
   * One key per refund *attempt*, fixed when the form opens.
   *
   * It used to carry `Date.now()`, so every submit generated a new one — which
   * is not idempotency, it is the opposite. A refund request that times out
   * has still very possibly been accepted by the gateway; retrying it under a
   * fresh key issues a **second real refund** and the money leaves twice. With
   * the key held, the backend recognises the retry and replays the first
   * result. Deliberately not regenerated on failure, for the same reason: a
   * failure the client saw is not proof the server did not act. A genuinely
   * separate second refund comes from closing and reopening this form, which
   * mounts a new one.
   */
  const [idempotencyKey] = useState(
    () => `admin-${payment.id}-${Math.random().toString(16).slice(2)}`,
  );
  const [reason, setReason] = useState('');
  const [full, setFull] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const amountMinor = full ? undefined : parseSarToMinor(amount);
      if (amountMinor !== undefined && (amountMinor <= 0 || amountMinor > remaining)) {
        setError(`Amount must be between 0.01 and ${formatSar(remaining)}.`);
        setBusy(false);
        return;
      }
      await onSubmit({
        paymentId: payment.id,
        amountMinor,
        reason: reason.trim(),
        idempotencyKey,
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to refund.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <p className="muted" style={{ marginTop: 0 }}>
        Refundable: <strong>{formatSar(remaining)}</strong>. Completion is asynchronous — the refund
        will show as processing until the gateway confirms.
      </p>
      <label style={{ display: 'flex', gap: 6, alignItems: 'center', margin: '8px 0' }}>
        <input type="radio" checked={full} onChange={() => setFull(true)} style={{ width: 'auto' }} />
        Full refund
      </label>
      <label style={{ display: 'flex', gap: 6, alignItems: 'center', margin: '8px 0' }}>
        <input type="radio" checked={!full} onChange={() => setFull(false)} style={{ width: 'auto' }} />
        Partial refund
      </label>
      {!full ? (
        <label style={{ display: 'block', marginTop: 4 }}>
          <span className="muted" style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>
            Amount (SAR)
          </span>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
        </label>
      ) : null}
      <label style={{ display: 'block', marginTop: 12 }}>
        <span className="muted" style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>
          Reason (recorded and audited)
        </span>
        <input value={reason} onChange={(e) => setReason(e.target.value)} required />
      </label>
      {error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : null}
      <button className="btn" disabled={busy || !reason.trim()} style={{ width: '100%', marginTop: 12 }}>
        {busy ? 'Refunding…' : 'Issue refund'}
      </button>
    </form>
  );
}

const th: React.CSSProperties = { padding: '10px 12px', borderBottom: '1px solid var(--border)', fontWeight: 600, whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '10px 12px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' };
