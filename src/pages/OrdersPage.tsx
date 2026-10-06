import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '../auth/AuthProvider';
import { DataState, StatusChip } from '../components/ui';
import { useAsync } from '../hooks/useAsync';
import { formatSar } from '../util/money';

const POLL_MS = 8000;

function tone(status: string): 'progress' | 'success' | 'neutral' {
  if (status === 'READY') return 'success';
  if (status === 'CONFIRMED') return 'neutral';
  return 'progress';
}

/** The live kitchen queue for a branch, with the two staff advance actions. */
export function OrdersPage(): React.JSX.Element {
  const { api } = useAuth();
  const branches = useAsync(() => api.branches(), []);
  const [branchId, setBranchId] = useState<string>('');
  const [tick, setTick] = useState(0);
  const [acting, setActing] = useState<string | null>(null);

  useEffect(() => {
    if (!branchId && branches.data && branches.data.length > 0) {
      setBranchId(branches.data[0]?.id ?? '');
    }
  }, [branches.data, branchId]);

  const queue = useAsync(() => (branchId ? api.kitchenQueue(branchId) : Promise.resolve([])), [branchId, tick]);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), POLL_MS);
    return () => clearInterval(t);
  }, []);

  const act = async (fn: () => Promise<unknown>, id: string): Promise<void> => {
    setActing(id);
    try {
      await fn();
      setTick((n) => n + 1);
    } finally {
      setActing(null);
    }
  };

  const orders = queue.data ?? [];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <h2 style={{ margin: 0, flex: 1 }}>Kitchen queue</h2>
        <select value={branchId} onChange={(e) => setBranchId(e.target.value)} style={{ width: 260 }}>
          {(branches.data ?? []).map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      <DataState loading={queue.loading && orders.length === 0} error={queue.error?.message ?? null} empty={orders.length === 0} onRetry={queue.reload}>
        <div style={{ display: 'grid', gap: 10 }}>
          {orders.map((o) => (
            <div key={o.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <strong>{o.orderNumber}</strong>
                <span className="muted" style={{ marginLeft: 8 }}>{formatSar(o.totalMinor)} · {o.type.toLowerCase()}</span>
              </div>
              <StatusChip label={o.status.toLowerCase()} tone={tone(o.status)} />
              {o.status === 'CONFIRMED' ? (
                <button className="btn" disabled={acting === o.id} onClick={() => act(() => api.markPreparing(o.id), o.id)}>
                  Start preparing
                </button>
              ) : o.status === 'PREPARING' ? (
                <button className="btn" disabled={acting === o.id} onClick={() => act(() => api.markReady(o.id), o.id)}>
                  Mark ready
                </button>
              ) : o.status === 'READY' && o.type === 'DELIVERY' ? (
                <Link to="/deliveries" className="btn" style={{ textDecoration: 'none' }}>
                  Dispatch delivery
                </Link>
              ) : o.status === 'READY' && o.type === 'PICKUP' ? (
                <button className="btn" disabled={acting === o.id} onClick={() => act(() => api.completePickup(o.id), o.id)}>
                  Complete pickup
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </DataState>
    </div>
  );
}
