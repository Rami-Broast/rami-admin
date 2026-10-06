import React, { useState } from 'react';

import { ApiError } from '../api/http';
import { Driver, VehicleType } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { Modal } from '../components/Modal';
import { DataState, StatusChip } from '../components/ui';
import { useAsync } from '../hooks/useAsync';

const VEHICLES: VehicleType[] = ['MOTORCYCLE', 'CAR', 'BICYCLE', 'ON_FOOT'];

export function DriversPage(): React.JSX.Element {
  const { api } = useAuth();
  const [page, setPage] = useState(1);
  const [tick, setTick] = useState(0);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Driver | null>(null);
  const [credentialsFor, setCredentialsFor] = useState<Driver | null>(null);

  const drivers = useAsync(() => api.listDrivers({ page, limit: 50 }), [page, tick]);
  const branchList = useAsync(() => api.branches(), []);
  const reload = (): void => setTick((n) => n + 1);

  const rows = drivers.data?.data ?? [];
  const meta = drivers.data?.meta;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0, flex: 1 }}>Drivers</h2>
        <button className="btn" onClick={() => setCreating(true)}>+ New driver profile</button>
      </div>

      <DataState
        loading={drivers.loading && rows.length === 0}
        error={drivers.error?.message ?? null}
        empty={rows.length === 0}
        onRetry={drivers.reload}
      >
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                <th style={th}>Name</th>
                <th style={th}>Signs in as</th>
                <th style={th}>Vehicle</th>
                <th style={th}>Plate</th>
                <th style={th}>Licence</th>
                <th style={th}>Shift</th>
                <th style={th}>Availability</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id}>
                  <td style={td}>{d.user.fullName}</td>
                  <td style={td} className="mono">
                    {d.user.email ?? '—'}
                  </td>
                  <td style={td}>{d.vehicleType.replace(/_/g, ' ').toLowerCase()}</td>
                  <td style={td}>{d.vehiclePlate ?? '—'}</td>
                  <td style={td}>{d.licenseNumber ?? '—'}</td>
                  <td style={td}>
                    <StatusChip
                      label={d.isOnline ? 'online' : 'offline'}
                      tone={d.isOnline ? 'success' : 'neutral'}
                    />
                  </td>
                  <td style={td}>
                    <StatusChip
                      label={d.isAvailable ? 'free' : 'busy'}
                      tone={d.isAvailable ? 'success' : 'warning'}
                    />
                  </td>
                  <td style={td}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button
                        className="btn btn-ghost"
                        style={{ padding: '4px 12px' }}
                        onClick={() => setCredentialsFor(d)}
                      >
                        Sign-in
                      </button>
                      <button className="btn btn-ghost" style={{ padding: '4px 12px' }} onClick={() => setEditing(d)}>
                        Edit
                      </button>
                    </div>
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
              disabled={page <= 1 || drivers.loading}
              onClick={() => setPage((n) => Math.max(1, n - 1))}
            >
              Previous
            </button>
            <span className="muted">
              Page {meta.page} of {Math.max(1, meta.totalPages)} · {meta.total} drivers
            </span>
            <button
              className="btn btn-ghost"
              disabled={!meta.hasNextPage || drivers.loading}
              onClick={() => setPage((n) => n + 1)}
            >
              Next
            </button>
          </div>
        ) : null}
      </DataState>

      <Modal open={creating} onClose={() => setCreating(false)} title="New driver">
        <CreateForm
          branches={branchList.data ?? []}
          onSave={async (body) => {
            const user = await api.createUser({
              email: body.email,
              password: body.password,
              fullName: body.fullName,
              role: 'DRIVER',
              branchId: body.branchId,
            });
            await api.createDriver({
              userId: user.id,
              vehicleType: body.vehicleType,
              licenseNumber: body.licenseNumber,
              vehiclePlate: body.vehiclePlate,
            });
            setCreating(false);
            reload();
          }}
        />
      </Modal>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing ? `Edit ${editing.user.fullName}` : ''}
      >
        {editing ? (
          <EditForm
            driver={editing}
            onSave={async (body) => {
              await api.updateDriver(editing.id, body);
              setEditing(null);
              reload();
            }}
            onDeactivate={async () => {
              if (!confirm('Deactivate this driver? They will be pulled off shift.')) return;
              await api.deactivateDriver(editing.id);
              setEditing(null);
              reload();
            }}
          />
        ) : null}
      </Modal>

      <Modal
        open={credentialsFor !== null}
        onClose={() => setCredentialsFor(null)}
        title={credentialsFor ? `Sign-in for ${credentialsFor.user.fullName}` : ''}
      >
        {credentialsFor ? (
          <CredentialsForm
            driver={credentialsFor}
            onChangeEmail={async (email) => {
              await api.updateUser(credentialsFor.userId, { email });
              reload();
            }}
            onResetPassword={async (password) => {
              await api.resetUserPassword(credentialsFor.userId, password);
            }}
            onDone={() => setCredentialsFor(null)}
          />
        ) : null}
      </Modal>
    </div>
  );
}

interface CreateBody {
  fullName: string;
  email: string;
  password: string;
  branchId: string;
  vehicleType: VehicleType;
  licenseNumber?: string;
  vehiclePlate?: string;
}

function CreateForm({
  branches,
  onSave,
}: {
  branches: { id: string; name: string }[];
  onSave: (body: CreateBody) => Promise<void>;
}): React.JSX.Element {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [branchId, setBranchId] = useState(branches[0]?.id ?? '');
  const [vehicleType, setVehicleType] = useState<VehicleType>('MOTORCYCLE');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = fullName.trim().length >= 1 && email.trim().length >= 3 && password.length >= 12 && branchId;

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSave({
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        password,
        branchId,
        vehicleType,
        licenseNumber: licenseNumber.trim() || undefined,
        vehiclePlate: vehiclePlate.trim() || undefined,
      });
    } catch (err) {
      if (err instanceof ApiError) {
        const parts = err.details && err.details.length > 0 ? err.details : [err.message];
        setError(parts.join(' '));
      } else {
        setError('Failed to create driver.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <p className="muted" style={{ marginTop: 0, fontSize: 12 }}>
        Creates a driver account and vehicle profile in one step.
      </p>
      <Field label="Full name *">
        <input value={fullName} onChange={(e) => setFullName(e.target.value)} required autoFocus placeholder="Mohammed Ali" />
      </Field>
      <Field label="Email *">
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required placeholder="driver@ramibroast.com" />
      </Field>
      <Field label="Password * (min 12 characters)">
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required minLength={12} placeholder="••••••••••••" />
      </Field>
      <Field label="Branch *">
        <select value={branchId} onChange={(e) => setBranchId(e.target.value)} required>
          {branches.length === 0 && <option value="">No branches yet</option>}
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </Field>
      <Field label="Vehicle">
        <select value={vehicleType} onChange={(e) => setVehicleType(e.target.value as VehicleType)}>
          {VEHICLES.map((v) => (
            <option key={v} value={v}>{v.replace(/_/g, ' ').toLowerCase()}</option>
          ))}
        </select>
      </Field>
      <Field label="Plate">
        <input value={vehiclePlate} onChange={(e) => setVehiclePlate(e.target.value)} placeholder="ABC 1234" />
      </Field>
      <Field label="Licence">
        <input value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} placeholder="DL-123456" />
      </Field>
      {error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : null}
      <button className="btn" disabled={busy || !valid} style={{ width: '100%', marginTop: 12 }}>
        {busy ? 'Creating…' : 'Create driver'}
      </button>
    </form>
  );
}

function EditForm({
  driver,
  onSave,
  onDeactivate,
}: {
  driver: Driver;
  onSave: (body: { vehicleType?: VehicleType; licenseNumber?: string; vehiclePlate?: string }) => Promise<void>;
  onDeactivate: () => Promise<void>;
}): React.JSX.Element {
  const [vehicleType, setVehicleType] = useState<VehicleType>(driver.vehicleType);
  const [licenseNumber, setLicenseNumber] = useState(driver.licenseNumber ?? '');
  const [vehiclePlate, setVehiclePlate] = useState(driver.vehiclePlate ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSave({
        vehicleType,
        licenseNumber: licenseNumber.trim() || undefined,
        vehiclePlate: vehiclePlate.trim() || undefined,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <Field label="Vehicle">
        <select value={vehicleType} onChange={(e) => setVehicleType(e.target.value as VehicleType)}>
          {VEHICLES.map((v) => (
            <option key={v} value={v}>{v.replace(/_/g, ' ').toLowerCase()}</option>
          ))}
        </select>
      </Field>
      <Field label="Plate">
        <input value={vehiclePlate} onChange={(e) => setVehiclePlate(e.target.value)} />
      </Field>
      <Field label="Licence">
        <input value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} />
      </Field>
      {error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : null}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button className="btn" disabled={busy} style={{ flex: 1 }}>
          {busy ? 'Saving…' : 'Save changes'}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onDeactivate();
            } catch (err) {
              setError(err instanceof ApiError ? err.message : 'Failed to deactivate.');
            } finally {
              setBusy(false);
            }
          }}
          style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
        >
          Deactivate
        </button>
      </div>
    </form>
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
const td: React.CSSProperties = { padding: '10px 12px', borderBottom: '1px solid var(--border)' };

/**
 * The driver's sign-in address and password.
 *
 * A driver signs into the driver app with an email and a password on their
 * `User` record — the same staff-login endpoint everyone else uses. Nothing in
 * this panel could change either, so a driver who forgot their password, or
 * whose address was mistyped when the profile was created, had no route back in
 * that did not involve someone with database access.
 *
 * The two halves are deliberately separate submits. They are different acts
 * with different consequences, and one form doing both invites changing the
 * address by accident while resetting a password.
 *
 * **Both sign the driver out.** The backend revokes every live session for the
 * account on either change, which is right — the credentials that session was
 * issued against no longer exist — and is worth saying on screen, because a
 * driver mid-delivery being signed out is something the person doing this
 * should choose knowingly.
 */
function CredentialsForm({
  driver,
  onChangeEmail,
  onResetPassword,
  onDone,
}: {
  driver: Driver;
  onChangeEmail: (email: string) => Promise<void>;
  onResetPassword: (password: string) => Promise<void>;
  onDone: () => void;
}): React.JSX.Element {
  const [email, setEmail] = useState(driver.user.email ?? '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'email' | 'password' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const emailChanged = email.trim().toLowerCase() !== (driver.user.email ?? '').toLowerCase();

  const run = async (which: 'email' | 'password', fn: () => Promise<void>, ok: string) => {
    setBusy(which);
    setError(null);
    setDone(null);
    try {
      await fn();
      setDone(ok);
      if (which === 'password') setPassword('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'That did not work.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        These are the details {driver.user.fullName} types into the driver app. Changing either one
        signs them out of every device immediately — including mid-delivery.
      </p>

      <section>
        <Field label="Sign-in address">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="off"
          />
        </Field>
        <button
          className="btn"
          disabled={!emailChanged || email.trim().length === 0 || busy !== null}
          onClick={() => void run('email', () => onChangeEmail(email.trim()), 'Sign-in address changed.')}
        >
          {busy === 'email' ? 'Saving…' : 'Change address'}
        </button>
      </section>

      <section>
        <Field label="New password">
          <input
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            /* Deliberately not a password field. Whoever is doing this has to
               read the new password out to the driver, and a row of dots they
               cannot check is how a driver ends up locked out by a typo. */
            placeholder="At least 12 characters"
            autoComplete="off"
          />
        </Field>
        <button
          className="btn"
          disabled={password.trim().length < MIN_PASSWORD || busy !== null}
          onClick={() => void run('password', () => onResetPassword(password), 'Password set. Give it to the driver — it is not shown again.')}
        >
          {busy === 'password' ? 'Saving…' : 'Set password'}
        </button>
      </section>

      {error ? <p style={{ color: 'var(--danger)', margin: 0 }}>{error}</p> : null}
      {done ? <p style={{ color: 'var(--success)', margin: 0 }}>{done}</p> : null}

      <div>
        <button className="btn btn-ghost" onClick={onDone}>
          Close
        </button>
      </div>
    </div>
  );
}

/** Mirrors the backend's `MINIMUM_STAFF_PASSWORD_LENGTH`. */
const MIN_PASSWORD = 12;
