import React, { useState } from 'react';

import { AuditLogEntry, AuditOutcome } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { DataState, StatusChip } from '../components/ui';
import { useAsync } from '../hooks/useAsync';

const OUTCOMES: AuditOutcome[] = ['SUCCESS', 'FAILURE', 'DENIED'];

interface Filters {
  action: string;
  entityType: string;
  outcome: string;
  correlationId: string;
  from: string;
  to: string;
}

const EMPTY: Filters = { action: '', entityType: '', outcome: '', correlationId: '', from: '', to: '' };

/**
 * Read-only viewer over the append-only audit log (`audit:read`, owner-only).
 *
 * The log is written by every module through the correlation-id middleware;
 * this page is a search over it — filter by action, entity, outcome, date
 * window or correlation id (trace one request end to end). Each row can expand
 * its before/after snapshot for incident review.
 */
export function AuditLogPage(): React.JSX.Element {
  const { api } = useAuth();
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [applied, setApplied] = useState<Filters>(EMPTY);

  const audit = useAsync(
    () =>
      api.listAudit({
        page,
        limit: 25,
        action: applied.action || undefined,
        entityType: applied.entityType || undefined,
        outcome: applied.outcome || undefined,
        correlationId: applied.correlationId || undefined,
        from: applied.from ? new Date(applied.from).toISOString() : undefined,
        to: applied.to ? new Date(applied.to).toISOString() : undefined,
      }),
    [page, applied],
  );

  const rows = audit.data?.data ?? [];
  const meta = audit.data?.meta;

  const apply = (): void => {
    setPage(1);
    setApplied(draft);
  };
  const clear = (): void => {
    setDraft(EMPTY);
    setApplied(EMPTY);
    setPage(1);
  };

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Audit log</h2>

      <div className="card" style={{ marginBottom: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
        <Field label="Action">
          <input value={draft.action} onChange={(e) => setDraft({ ...draft, action: e.target.value })} placeholder="e.g. order.create" />
        </Field>
        <Field label="Entity type">
          <input value={draft.entityType} onChange={(e) => setDraft({ ...draft, entityType: e.target.value })} placeholder="e.g. Order" />
        </Field>
        <Field label="Outcome">
          <select value={draft.outcome} onChange={(e) => setDraft({ ...draft, outcome: e.target.value })}>
            <option value="">Any</option>
            {OUTCOMES.map((o) => (
              <option key={o} value={o}>{o.toLowerCase()}</option>
            ))}
          </select>
        </Field>
        <Field label="Correlation id">
          <input value={draft.correlationId} onChange={(e) => setDraft({ ...draft, correlationId: e.target.value })} placeholder="trace one request" />
        </Field>
        <Field label="From">
          <input type="datetime-local" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />
        </Field>
        <Field label="To">
          <input type="datetime-local" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
        </Field>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <button className="btn" onClick={apply}>Search</button>
          <button className="btn btn-ghost" onClick={clear}>Clear</button>
        </div>
      </div>

      <DataState
        loading={audit.loading && rows.length === 0}
        error={audit.error?.message ?? null}
        empty={rows.length === 0}
        onRetry={audit.reload}
      >
        <div style={{ display: 'grid', gap: 8 }}>
          {rows.map((row) => (
            <AuditRow key={row.id} row={row} />
          ))}
        </div>

        {meta ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
            <button className="btn btn-ghost" disabled={page <= 1 || audit.loading} onClick={() => setPage((n) => Math.max(1, n - 1))}>
              Previous
            </button>
            <span className="muted">
              Page {meta.page} of {Math.max(1, meta.totalPages)} · {meta.total} entries
            </span>
            <button className="btn btn-ghost" disabled={!meta.hasNextPage || audit.loading} onClick={() => setPage((n) => n + 1)}>
              Next
            </button>
          </div>
        ) : null}
      </DataState>
    </div>
  );
}

function AuditRow({ row }: { row: AuditLogEntry }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const tone = row.outcome === 'SUCCESS' ? 'success' : row.outcome === 'DENIED' ? 'warning' : 'danger';
  const actor =
    row.actorUser?.fullName ??
    row.actorUser?.email ??
    row.actorCustomer?.fullName ??
    row.actorCustomer?.phone ??
    row.actorType ??
    'system';
  const hasSnapshot = row.before != null || row.after != null;

  return (
    <div className="card" style={{ padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <StatusChip label={row.outcome.toLowerCase()} tone={tone} />
        <strong>{row.action}</strong>
        {row.entityType ? (
          <span className="muted" style={{ fontSize: 13 }}>
            {row.entityType}
            {row.entityId ? ` · ${row.entityId.slice(0, 8)}…` : ''}
          </span>
        ) : null}
        <span style={{ flex: 1 }} />
        <span className="muted" style={{ fontSize: 13 }}>{new Date(row.createdAt).toLocaleString()}</span>
      </div>
      <div className="muted" style={{ fontSize: 13, marginTop: 6, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <span>by {actor}</span>
        {row.branch ? <span>branch {row.branch.code}</span> : null}
        {row.ipAddress ? <span>ip {row.ipAddress}</span> : null}
        {row.correlationId ? <span>cid {row.correlationId}</span> : null}
      </div>
      {row.reason ? <div style={{ fontSize: 14, marginTop: 6 }}>{row.reason}</div> : null}
      {hasSnapshot ? (
        <div style={{ marginTop: 8 }}>
          <button className="btn btn-ghost" style={{ padding: '2px 10px', fontSize: 13 }} onClick={() => setOpen((o) => !o)}>
            {open ? 'Hide changes' : 'Show changes'}
          </button>
          {open ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8, marginTop: 8 }}>
              <Snapshot label="Before" value={row.before} />
              <Snapshot label="After" value={row.after} />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Snapshot({ label, value }: { label: string; value: unknown }): React.JSX.Element {
  return (
    <div>
      <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>{label}</div>
      <pre style={{ margin: 0, padding: 10, background: 'var(--surface)', borderRadius: 8, overflowX: 'auto', fontSize: 12, maxHeight: 240 }}>
        {value == null ? '—' : JSON.stringify(value, null, 2)}
      </pre>
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
