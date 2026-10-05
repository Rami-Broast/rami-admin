import React, { useState } from 'react';

import { ApiError } from '../api/http';
import { Branch, StaffUser, SystemRole } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { Modal } from '../components/Modal';
import { DataState, StatusChip } from '../components/ui';
import { useAsync } from '../hooks/useAsync';

const ROLES: SystemRole[] = ['OWNER', 'BRANCH_ADMIN', 'KITCHEN', 'DRIVER'];
const MIN_PASSWORD = 12;

/**
 * Staff-user administration (owner-only; gated by `users:*` in the seed).
 *
 * Fills the gap the Drivers page flagged: staff users used to be creatable only
 * via `npm run staff:create`. This page lists/searches them, creates accounts,
 * edits name + active flag, resets passwords and grants/revokes role scopes —
 * all against /users. The backend still enforces every rule (last-owner guard,
 * self-deactivation refusal, branch requirement per role).
 */
export function UsersPage(): React.JSX.Element {
  const { api } = useAuth();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [tick, setTick] = useState(0);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<StaffUser | null>(null);

  const branches = useAsync(() => api.branches(), []);
  const users = useAsync(
    () => api.listUsers({ page, limit: 25, q: q || undefined, role: roleFilter || undefined }),
    [page, tick, q, roleFilter],
  );
  const reload = (): void => setTick((n) => n + 1);

  const rows = users.data?.data ?? [];
  const meta = users.data?.meta;
  const branchList = branches.data ?? [];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, flex: 1 }}>Staff users</h2>
        <input
          placeholder="Search name or email…"
          value={q}
          onChange={(e) => {
            setPage(1);
            setQ(e.target.value);
          }}
          style={{ minWidth: 220 }}
        />
        <select
          value={roleFilter}
          onChange={(e) => {
            setPage(1);
            setRoleFilter(e.target.value);
          }}
        >
          <option value="">All roles</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r.replace(/_/g, ' ').toLowerCase()}
            </option>
          ))}
        </select>
        <button className="btn" onClick={() => setCreating(true)}>
          + New user
        </button>
      </div>

      <DataState
        loading={users.loading && rows.length === 0}
        error={users.error?.message ?? null}
        empty={rows.length === 0}
        onRetry={users.reload}
      >
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                <th style={th}>Name</th>
                <th style={th}>Email</th>
                <th style={th}>Roles</th>
                <th style={th}>Status</th>
                <th style={th}>Last login</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id}>
                  <td style={td}>{u.fullName}</td>
                  <td style={td}>{u.email}</td>
                  <td style={td}>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {u.roles.length === 0 ? (
                        <span className="muted">—</span>
                      ) : (
                        u.roles.map((r) => (
                          <StatusChip
                            key={r.id}
                            label={
                              r.branch
                                ? `${r.role.name.toLowerCase()} · ${r.branch.code}`
                                : r.role.name.toLowerCase()
                            }
                            tone="neutral"
                          />
                        ))
                      )}
                    </div>
                  </td>
                  <td style={td}>
                    <StatusChip
                      label={u.isActive ? 'active' : 'disabled'}
                      tone={u.isActive ? 'success' : 'danger'}
                    />
                  </td>
                  <td style={td}>{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'never'}</td>
                  <td style={td}>
                    <button
                      className="btn btn-ghost"
                      style={{ padding: '4px 12px' }}
                      onClick={() => setEditing(u)}
                    >
                      Manage
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
              disabled={page <= 1 || users.loading}
              onClick={() => setPage((n) => Math.max(1, n - 1))}
            >
              Previous
            </button>
            <span className="muted">
              Page {meta.page} of {Math.max(1, meta.totalPages)} · {meta.total} users
            </span>
            <button
              className="btn btn-ghost"
              disabled={!meta.hasNextPage || users.loading}
              onClick={() => setPage((n) => n + 1)}
            >
              Next
            </button>
          </div>
        ) : null}
      </DataState>

      <Modal open={creating} onClose={() => setCreating(false)} title="New staff user">
        <CreateForm
          branches={branchList}
          onSave={async (body) => {
            await api.createUser(body);
            setCreating(false);
            reload();
          }}
        />
      </Modal>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing ? `Manage ${editing.fullName}` : ''}
      >
        {editing ? (
          <ManageForm
            key={editing.id}
            user={editing}
            branches={branchList}
            api={api}
            onChanged={(fresh) => {
              setEditing(fresh);
              reload();
            }}
            onClose={() => setEditing(null)}
          />
        ) : null}
      </Modal>
    </div>
  );
}

/**
 * Exported for tests. Creating a staff account is one of the two writes in
 * this app with real consequences, and what it sends — a role only when one
 * was chosen, a branch only when the role needs one — is only visible here.
 */
export function CreateForm({
  branches,
  onSave,
}: {
  branches: Branch[];
  onSave: (body: {
    email: string;
    password: string;
    fullName: string;
    role?: string;
    branchId?: string;
  }) => Promise<void>;
}): React.JSX.Element {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('');
  const [branchId, setBranchId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsBranch = role !== '' && role !== 'OWNER';

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSave({
        email: email.trim(),
        password,
        fullName: fullName.trim(),
        role: role || undefined,
        branchId: needsBranch ? branchId : undefined,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <Field label="Full name">
        <input value={fullName} onChange={(e) => setFullName(e.target.value)} required autoFocus />
      </Field>
      <Field label="Email">
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </Field>
      <Field label={`Password (min ${MIN_PASSWORD} chars)`}>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={MIN_PASSWORD}
          required
        />
      </Field>
      <Field label="Role (optional — can be granted later)">
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">No role yet</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r.replace(/_/g, ' ').toLowerCase()}
            </option>
          ))}
        </select>
      </Field>
      {needsBranch ? (
        <Field label="Branch (required for this role)">
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)} required>
            <option value="">Select a branch…</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      {error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : null}
      <button
        className="btn"
        disabled={busy || !email.trim() || !fullName.trim() || password.length < MIN_PASSWORD || (needsBranch && !branchId)}
        style={{ width: '100%', marginTop: 12 }}
      >
        {busy ? 'Creating…' : 'Create user'}
      </button>
    </form>
  );
}

function ManageForm({
  user,
  branches,
  api,
  onChanged,
  onClose,
}: {
  user: StaffUser;
  branches: Branch[];
  api: ReturnType<typeof useAuth>['api'];
  onChanged: (fresh: StaffUser) => void;
  onClose: () => void;
}): React.JSX.Element {
  const [fullName, setFullName] = useState(user.fullName);
  const [newPassword, setNewPassword] = useState('');
  const [role, setRole] = useState<SystemRole>('BRANCH_ADMIN');
  const [branchId, setBranchId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const needsBranch = role !== 'OWNER';

  const run = async (fn: () => Promise<StaffUser | unknown>, okNote: string): Promise<void> => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const result = await fn();
      setNote(okNote);
      if (result && typeof result === 'object' && 'roles' in result) {
        onChanged(result as StaffUser);
      } else {
        onChanged(await api.getUser(user.id));
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <section style={{ marginBottom: 18 }}>
        <h4 style={sec}>Profile</h4>
        <Field label="Full name">
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </Field>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button
            className="btn"
            disabled={busy || fullName.trim() === user.fullName || !fullName.trim()}
            onClick={() => run(() => api.updateUser(user.id, { fullName: fullName.trim() }), 'Name saved.')}
          >
            Save name
          </button>
          <button
            className="btn btn-ghost"
            disabled={busy}
            onClick={() => {
              const next = !user.isActive;
              if (!next && !confirm('Deactivate this account? Every live session is revoked.')) return;
              run(() => api.updateUser(user.id, { isActive: next }), next ? 'Account activated.' : 'Account deactivated.');
            }}
            style={user.isActive ? { color: 'var(--danger)', borderColor: 'var(--danger)' } : undefined}
          >
            {user.isActive ? 'Deactivate' : 'Reactivate'}
          </button>
        </div>
      </section>

      <section style={{ marginBottom: 18 }}>
        <h4 style={sec}>Reset password</h4>
        <Field label={`New password (min ${MIN_PASSWORD} chars) — revokes live sessions`}>
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        </Field>
        <button
          className="btn"
          style={{ marginTop: 10 }}
          disabled={busy || newPassword.length < MIN_PASSWORD}
          onClick={() =>
            run(async () => {
              await api.resetUserPassword(user.id, newPassword);
              setNewPassword('');
              return api.getUser(user.id);
            }, 'Password reset.')
          }
        >
          Reset password
        </button>
      </section>

      <section style={{ marginBottom: 18 }}>
        <h4 style={sec}>Role grants</h4>
        {user.roles.length === 0 ? (
          <p className="muted" style={{ marginTop: 0 }}>No roles granted.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 10px' }}>
            {user.roles.map((r) => (
              <li key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
                <StatusChip
                  label={r.branch ? `${r.role.name.toLowerCase()} · ${r.branch.name}` : r.role.name.toLowerCase()}
                  tone="neutral"
                />
                <button
                  className="btn btn-ghost"
                  style={{ padding: '2px 10px', color: 'var(--danger)', borderColor: 'var(--danger)' }}
                  disabled={busy}
                  onClick={() => {
                    if (!confirm(`Revoke ${r.role.name} for this user?`)) return;
                    run(() => api.revokeUserRole(user.id, r.id), 'Role revoked.');
                  }}
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        )}
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ flex: 1, minWidth: 130 }}>
            <span className="muted" style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>Role</span>
            <select value={role} onChange={(e) => setRole(e.target.value as SystemRole)} style={{ width: '100%' }}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r.replace(/_/g, ' ').toLowerCase()}
                </option>
              ))}
            </select>
          </label>
          {needsBranch ? (
            <label style={{ flex: 1, minWidth: 130 }}>
              <span className="muted" style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>Branch</span>
              <select value={branchId} onChange={(e) => setBranchId(e.target.value)} style={{ width: '100%' }}>
                <option value="">Select…</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </label>
          ) : null}
          <button
            className="btn"
            disabled={busy || (needsBranch && !branchId)}
            onClick={() =>
              run(
                () => api.assignUserRole(user.id, { role, branchId: needsBranch ? branchId : undefined }),
                'Role granted.',
              )
            }
          >
            Grant
          </button>
        </div>
      </section>

      {error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : null}
      {note ? <p style={{ color: 'var(--success)' }}>{note}</p> : null}
      <button className="btn btn-ghost" style={{ width: '100%' }} onClick={onClose}>
        Done
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <label style={{ display: 'block', marginTop: 10 }}>
      <span className="muted" style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>{label}</span>
      {children}
    </label>
  );
}

const th: React.CSSProperties = { padding: '10px 12px', borderBottom: '1px solid var(--border)', fontWeight: 600, whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '10px 12px', borderBottom: '1px solid var(--border)', verticalAlign: 'top' };
const sec: React.CSSProperties = { margin: '0 0 6px', fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--muted)' };
