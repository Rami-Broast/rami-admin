import React, { useState } from 'react';

import { ApiError } from '../api/http';
import { LoyaltyLedger } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { Modal } from '../components/Modal';
import { DataState } from '../components/ui';

/**
 * Look up a customer's loyalty ledger by customer ID and adjust their balance.
 * A customer directory endpoint doesn't exist yet, so lookup is by ID today.
 */
export function LoyaltyPage(): React.JSX.Element {
  const { api } = useAuth();
  const [customerId, setCustomerId] = useState('');
  const [submittedId, setSubmittedId] = useState('');
  const [ledger, setLedger] = useState<LoyaltyLedger | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adjusting, setAdjusting] = useState(false);

  const load = async (id: string): Promise<void> => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.customerLedger(id, { page: 1, limit: 50 });
      setLedger(result);
      setSubmittedId(id);
    } catch (err) {
      setLedger(null);
      setError(err instanceof ApiError ? err.message : 'Lookup failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <h2 style={{ margin: 0, flex: 1 }}>Loyalty</h2>
        {submittedId ? (
          <button className="btn" onClick={() => setAdjusting(true)}>Adjust points</button>
        ) : null}
      </div>

      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          load(customerId.trim());
        }}
        style={{ display: 'flex', gap: 8, marginBottom: 16 }}
      >
        <input
          value={customerId}
          onChange={(e) => setCustomerId(e.target.value)}
          placeholder="Customer ID (UUID)"
          style={{ flex: 1 }}
        />
        <button className="btn" disabled={loading || !customerId.trim()}>
          {loading ? 'Loading…' : 'Look up'}
        </button>
      </form>

      {error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : null}

      {ledger ? (
        <div>
          <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
            <div style={{ flex: 1 }}>
              <p className="muted" style={{ margin: 0, fontSize: 12, textTransform: 'uppercase' }}>Balance</p>
              <p style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>{ledger.balance} pts</p>
            </div>
            <div className="muted" style={{ fontSize: 12 }}>Customer {submittedId.slice(0, 8)}…</div>
          </div>

          <DataState loading={false} error={null} empty={ledger.data.length === 0}>
            <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                    <th style={th}>When</th>
                    <th style={th}>Type</th>
                    <th style={th}>Points</th>
                    <th style={th}>Reason</th>
                    <th style={th}>Order</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.data.map((row) => (
                    <tr key={row.id}>
                      <td style={td}>{new Date(row.createdAt).toLocaleString()}</td>
                      <td style={td}>{row.type}</td>
                      <td style={{ ...td, fontWeight: 700, color: row.points >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                        {row.points >= 0 ? `+${row.points}` : row.points}
                      </td>
                      <td style={td}>{row.reason ?? '—'}</td>
                      <td style={td}>{row.orderId ? row.orderId.slice(0, 8) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DataState>
        </div>
      ) : null}

      <Modal open={adjusting} onClose={() => setAdjusting(false)} title="Adjust loyalty points">
        <AdjustForm
          customerId={submittedId}
          onDone={() => {
            setAdjusting(false);
            load(submittedId);
          }}
          submit={(body) => api.adjustLoyalty(body)}
        />
      </Modal>
    </div>
  );
}

function AdjustForm({
  customerId,
  onDone,
  submit,
}: {
  customerId: string;
  onDone: () => void;
  submit: (body: { customerId: string; points: number; reason: string }) => Promise<unknown>;
}): React.JSX.Element {
  const [points, setPoints] = useState('100');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const n = parseInt(points, 10);
      if (!Number.isFinite(n) || n === 0) {
        setError('Points must be a non-zero integer.');
        setBusy(false);
        return;
      }
      await submit({ customerId, points: n, reason: reason.trim() });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to adjust.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={send}>
      <p className="muted" style={{ marginTop: 0 }}>
        Positive to credit, negative to debit. This creates a new signed ledger entry — history is
        never rewritten.
      </p>
      <label style={{ display: 'block', marginTop: 8 }}>
        <span className="muted" style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>Points</span>
        <input value={points} onChange={(e) => setPoints(e.target.value)} inputMode="numeric" />
      </label>
      <label style={{ display: 'block', marginTop: 8 }}>
        <span className="muted" style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>Reason (audited)</span>
        <input value={reason} onChange={(e) => setReason(e.target.value)} required />
      </label>
      {error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : null}
      <button className="btn" disabled={busy || !reason.trim()} style={{ width: '100%', marginTop: 12 }}>
        {busy ? 'Saving…' : 'Apply adjustment'}
      </button>
    </form>
  );
}

const th: React.CSSProperties = { padding: '10px 12px', borderBottom: '1px solid var(--border)', fontWeight: 600, whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '10px 12px', borderBottom: '1px solid var(--border)' };
