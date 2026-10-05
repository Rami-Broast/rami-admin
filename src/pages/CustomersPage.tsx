import React, { useState } from 'react';

import { CustomerDetail, CustomerListItem } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { Modal } from '../components/Modal';
import { DataState, StatusChip } from '../components/ui';
import { useAsync } from '../hooks/useAsync';

/**
 * Staff customer directory (`customers:read`).
 *
 * Search is a case-insensitive substring on phone / email / name — a support
 * caller reading out the last four digits still finds the record. OWNER sees
 * every customer; a BRANCH_ADMIN sees only customers who have ordered from one
 * of their branches (enforced server-side, so this page shows whatever the
 * caller is entitled to). Opening a row loads the full record with saved
 * addresses.
 */
export function CustomersPage(): React.JSX.Element {
  const { api } = useAuth();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const customers = useAsync(
    () => api.listCustomers({ page, limit: 25, q: q || undefined }),
    [page, q],
  );

  const rows = customers.data?.data ?? [];
  const meta = customers.data?.meta;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, flex: 1 }}>Customers</h2>
        <input
          placeholder="Search phone, email or name…"
          value={q}
          onChange={(e) => {
            setPage(1);
            setQ(e.target.value);
          }}
          style={{ minWidth: 260 }}
        />
      </div>

      <DataState
        loading={customers.loading && rows.length === 0}
        error={customers.error?.message ?? null}
        empty={rows.length === 0}
        onRetry={customers.reload}
      >
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                <th style={th}>Name</th>
                <th style={th}>Phone</th>
                <th style={th}>Email</th>
                <th style={th}>Orders</th>
                <th style={th}>Addresses</th>
                <th style={th}>Status</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <CustomerRow key={c.id} c={c} onOpen={() => setOpenId(c.id)} />
              ))}
            </tbody>
          </table>
        </div>

        {meta ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
            <button
              className="btn btn-ghost"
              disabled={page <= 1 || customers.loading}
              onClick={() => setPage((n) => Math.max(1, n - 1))}
            >
              Previous
            </button>
            <span className="muted">
              Page {meta.page} of {Math.max(1, meta.totalPages)} · {meta.total} customers
            </span>
            <button
              className="btn btn-ghost"
              disabled={!meta.hasNextPage || customers.loading}
              onClick={() => setPage((n) => n + 1)}
            >
              Next
            </button>
          </div>
        ) : null}
      </DataState>

      <Modal open={openId !== null} onClose={() => setOpenId(null)} title="Customer">
        {openId ? <CustomerDetailView id={openId} /> : null}
      </Modal>
    </div>
  );
}

function CustomerRow({ c, onOpen }: { c: CustomerListItem; onOpen: () => void }): React.JSX.Element {
  return (
    <tr>
      <td style={td}>{c.fullName ?? <span className="muted">—</span>}</td>
      <td style={td}>{c.phone}</td>
      <td style={td}>{c.email ?? <span className="muted">—</span>}</td>
      <td style={td}>{c._count.orders}</td>
      <td style={td}>{c._count.addresses}</td>
      <td style={td}>
        <StatusChip label={c.isActive ? 'active' : 'blocked'} tone={c.isActive ? 'success' : 'danger'} />
      </td>
      <td style={td}>
        <button className="btn btn-ghost" style={{ padding: '4px 12px' }} onClick={onOpen}>
          View
        </button>
      </td>
    </tr>
  );
}

function CustomerDetailView({ id }: { id: string }): React.JSX.Element {
  const { api } = useAuth();
  const detail = useAsync<CustomerDetail>(() => api.getCustomer(id), [id]);

  return (
    <DataState loading={detail.loading} error={detail.error?.message ?? null} onRetry={detail.reload}>
      {detail.data ? (
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <h3 style={{ margin: 0 }}>{detail.data.fullName ?? 'Unnamed customer'}</h3>
            <StatusChip
              label={detail.data.isActive ? 'active' : 'blocked'}
              tone={detail.data.isActive ? 'success' : 'danger'}
            />
          </div>
          <dl style={grid}>
            <Row label="Phone" value={detail.data.phone} />
            <Row label="Email" value={detail.data.email ?? '—'} />
            <Row
              label="Phone verified"
              value={detail.data.phoneVerifiedAt ? new Date(detail.data.phoneVerifiedAt).toLocaleDateString() : 'no'}
            />
            <Row label="Total orders" value={String(detail.data._count.orders)} />
            <Row label="Joined" value={new Date(detail.data.createdAt).toLocaleDateString()} />
            <Row
              label="Last login"
              value={detail.data.lastLoginAt ? new Date(detail.data.lastLoginAt).toLocaleString() : 'never'}
            />
          </dl>

          <h4 style={{ margin: '18px 0 8px' }}>Saved addresses ({detail.data.addresses.length})</h4>
          {detail.data.addresses.length === 0 ? (
            <p className="muted" style={{ marginTop: 0 }}>No saved addresses.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
              {detail.data.addresses.map((a) => (
                <li key={a.id} className="card" style={{ padding: 12 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <strong>{a.label ?? 'Address'}</strong>
                    {a.isDefault ? <StatusChip label="default" tone="progress" /> : null}
                  </div>
                  <div className="muted" style={{ marginTop: 4, fontSize: 14 }}>
                    {[a.line1, a.line2, a.district, a.city, a.postalCode].filter(Boolean).join(', ')}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </DataState>
  );
}

function Row({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <>
      <dt className="muted" style={{ fontSize: 13 }}>{label}</dt>
      <dd style={{ margin: 0, fontWeight: 600 }}>{value}</dd>
    </>
  );
}

const th: React.CSSProperties = { padding: '10px 12px', borderBottom: '1px solid var(--border)', fontWeight: 600, whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '10px 12px', borderBottom: '1px solid var(--border)' };
const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 16px', marginTop: 12 };
