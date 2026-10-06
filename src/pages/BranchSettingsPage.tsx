import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ApiError } from '../api/http';
import { Branch, BranchOpenState, BranchSettings, BranchStatus, CreateBranchInput, HoursOverride, OpeningHoursEntry, StaffUser } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { DeleteBranchDialog } from '../components/DeleteBranchDialog';
import { DataState, StatusChip, Toggle } from '../components/ui';
import { useAsync } from '../hooks/useAsync';
import {
  DeliveryPricingDraft,
  draftToPatch,
  isDirty,
  toDraft,
} from '../util/branchSettingsDraft';
import { previewLadder, previewUpliftedPrice } from '../util/deliveryPreview';
import {
  DAY_NAMES,
  crossesMidnight,
  is24h,
  isUnscheduled,
  minuteToTime,
  timeToMinute,
  todayISO,
  weekFrom,
  weekProblem,
} from '../util/openingHours';
import { formatMinor } from '../util/money';

const STATUS_LABELS: Record<BranchStatus, string> = {
  ACTIVE: 'Active',
  TEMPORARILY_CLOSED: 'Temporarily closed',
  SUSPENDED: 'Suspended',
  ARCHIVED: 'Archived',
};

const STATUS_TONE: Record<BranchStatus, 'success' | 'danger' | 'warning' | 'neutral'> = {
  ACTIVE: 'success',
  TEMPORARILY_CLOSED: 'danger',
  SUSPENDED: 'warning',
  ARCHIVED: 'neutral',
};

function BranchLifecycleActions({
  branch,
  onChanged,
}: {
  branch: Branch;
  onChanged: () => void;
}): React.JSX.Element | null {
  const { api } = useAuth();
  const [busy, setBusy] = useState(false);

  const act = async (status: BranchStatus, reason?: string): Promise<void> => {
    setBusy(true);
    try {
      await api.changeBranchStatus(branch.id, status, reason);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const [deleting, setDeleting] = useState(false);

  const duplicate = async (): Promise<void> => {
    setBusy(true);
    try {
      await api.duplicateBranch(branch.id, `${branch.code}-copy`, `${branch.name} (copy)`);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const s = branch.status;
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
      {s !== 'ACTIVE' && s !== 'ARCHIVED' && (
        <button className="btn btn-sm" disabled={busy} onClick={() => act('ACTIVE')}>
          Activate
        </button>
      )}
      {s === 'ACTIVE' && (
        <button className="btn btn-sm" disabled={busy} onClick={() => act('SUSPENDED', 'Owner suspended')}>
          Suspend
        </button>
      )}
      {(s === 'ACTIVE' || s === 'SUSPENDED') && (
        <button className="btn btn-sm" disabled={busy} onClick={() => act('TEMPORARILY_CLOSED', 'Owner closed')}>
          Close
        </button>
      )}
      {s === 'TEMPORARILY_CLOSED' && (
        <button className="btn btn-sm" disabled={busy} onClick={() => act('ARCHIVED')}>
          Archive
        </button>
      )}
      {s !== 'ARCHIVED' && (
        <button className="btn btn-sm" disabled={busy} onClick={duplicate}>
          Duplicate
        </button>
      )}
      {/* Set apart from the lifecycle buttons on purpose. Suspend and Close are
          reversible and get pressed during ordinary work; this one is not, so
          it should not sit in the same row of identical chips. */}
      <span style={{ flexBasis: '100%' }} />
      <button
        className="btn btn-sm btn-ghost"
        style={{ color: 'var(--danger)' }}
        disabled={busy}
        onClick={() => setDeleting(true)}
      >
        Delete branch…
      </button>
      <DeleteBranchDialog
        branch={branch}
        open={deleting}
        onClose={() => setDeleting(false)}
        onDeleted={onChanged}
      />
    </div>
  );
}

function BranchInfoEditor({
  branch,
  onSaved,
}: {
  branch: Branch;
  onSaved: () => void;
}): React.JSX.Element {
  const { api } = useAuth();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Partial<CreateBranchInput>>({});

  const startEdit = () => {
    setDraft({
      name: branch.name,
      nameAr: branch.nameAr ?? '',
      phone: branch.phone ?? '',
      addressLine: branch.addressLine,
      district: branch.district ?? '',
      city: branch.city,
    });
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.updateBranch(branch.id, {
        name: draft.name?.trim(),
        nameAr: draft.nameAr?.trim() || undefined,
        phone: draft.phone?.trim() || undefined,
        addressLine: draft.addressLine?.trim(),
        district: draft.district?.trim() || undefined,
        city: draft.city?.trim(),
      });
      setEditing(false);
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <div className="card" style={{ maxWidth: 600, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <strong style={{ flex: 1 }}>{branch.name}</strong>
          <StatusChip
            label={STATUS_LABELS[branch.status] ?? branch.status}
            tone={STATUS_TONE[branch.status] ?? 'muted'}
          />
        </div>
        {branch.nameAr && <p className="muted" style={{ margin: '0 0 4px' }} dir="rtl">{branch.nameAr}</p>}
        <p className="muted" style={{ margin: '0 0 4px' }}>
          Code: {branch.code} &middot; {branch.addressLine}, {branch.city}
          {branch.phone ? ` · ${branch.phone}` : ''}
        </p>
        {branch.latitude != null && (
          <p className="muted" style={{ margin: '0 0 4px', fontSize: 12 }}>
            Coordinates: {branch.latitude}, {branch.longitude}
          </p>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button className="btn btn-sm" onClick={startEdit}>Edit info</button>
        </div>
        <BranchLifecycleActions branch={branch} onChanged={onSaved} />
      </div>
    );
  }

  return (
    <div className="card" style={{ maxWidth: 600, marginBottom: 16 }}>
      <h3 style={{ marginTop: 0 }}>Edit branch info</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <label>
          <span className="muted" style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>Name (English)</span>
          <input value={draft.name ?? ''} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={120} />
        </label>
        <label>
          <span className="muted" style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>Name (Arabic)</span>
          <input value={draft.nameAr ?? ''} onChange={(e) => setDraft({ ...draft, nameAr: e.target.value })} maxLength={120} dir="rtl" />
        </label>
        <label>
          <span className="muted" style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>Phone</span>
          <input value={draft.phone ?? ''} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} maxLength={20} />
        </label>
        <label>
          <span className="muted" style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>Street address</span>
          <input value={draft.addressLine ?? ''} onChange={(e) => setDraft({ ...draft, addressLine: e.target.value })} maxLength={250} />
        </label>
        <label>
          <span className="muted" style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>District</span>
          <input value={draft.district ?? ''} onChange={(e) => setDraft({ ...draft, district: e.target.value })} maxLength={120} />
        </label>
        <label>
          <span className="muted" style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>City</span>
          <input value={draft.city ?? ''} onChange={(e) => setDraft({ ...draft, city: e.target.value })} maxLength={80} />
        </label>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)} disabled={saving}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/**
 * Opening hours for one branch: the weekly schedule, and the dates that break it.
 *
 * **This panel could not be used before.** `GET /hours` returns only the rows
 * that exist, the editor mapped straight over them, and every branch has none —
 * so it rendered a heading, a Save button, and nothing in between. There was no
 * way to add a day, so no branch could ever get a first schedule, which is why
 * the whole feature was inert: the backend enforced nothing because nothing
 * could be set. `weekFrom` (`util/openingHours.ts`, pure and tested) always
 * produces seven editable days.
 *
 * Three things it has to keep saying out loud, because each is a way to close a
 * shop by accident:
 *
 * - **No schedule means always open, not closed.** A branch nobody has set
 *   hours for takes orders around the clock. Saving this form is therefore the
 *   moment a branch starts refusing customers at night, and the panel says so
 *   before the first save rather than after the first complaint.
 * - **An unset day starts closed.** Defaulting to 09:00–17:00 would be this
 *   app inventing trading hours and then enforcing them; closed is the wrong
 *   that an owner can see.
 * - **A window past midnight is not a typo.** 18:00–02:00 is an ordinary
 *   restaurant shift and the backend honours it, so the row says so rather than
 *   leaving the owner to wonder whether it saved backwards.
 */
function OpeningHoursEditor({ branchId }: { branchId: string }): React.JSX.Element {
  const { api } = useAuth();
  const [week, setWeek] = useState<OpeningHoursEntry[]>(() => weekFrom([]));
  const [overrides, setOverrides] = useState<HoursOverride[]>([]);
  const [openState, setOpenState] = useState<BranchOpenState | null>(null);
  const [everSaved, setEverSaved] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [stored, state] = await Promise.all([
        api.getOpeningHours(branchId),
        // The live open/closed state is a nicety on this panel, so it must not
        // be able to cost the editor: an owner who cannot load one number must
        // still be able to set their hours.
        api.branchOpenState(branchId).catch(() => null),
      ]);
      setWeek(weekFrom(stored.hours));
      setOverrides(stored.overrides ?? []);
      setEverSaved(!isUnscheduled(stored.hours));
      setOpenState(state);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load hours.');
    } finally {
      setLoading(false);
    }
  }, [api, branchId]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateDay = (dayOfWeek: number, patch: Partial<OpeningHoursEntry>): void => {
    setWeek((current) =>
      current.map((d) => (d.dayOfWeek === dayOfWeek ? { ...d, ...patch } : d)),
    );
    setSaved(false);
    setSaveError(null);
  };

  const problem = weekProblem(week);

  const save = async (): Promise<void> => {
    if (problem) {
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const result = await api.setOpeningHours(branchId, week);
      setWeek(weekFrom(result));
      setEverSaved(true);
      setSaved(true);
      // Re-read rather than assume: the whole point of the panel is that the
      // schedule now decides whether customers can order.
      setOpenState(await api.branchOpenState(branchId).catch(() => null));
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save hours.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="muted">Loading hours…</p>;
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <h3 style={{ margin: 0, flex: 1 }}>Opening hours</h3>
        {openState ? <OpenNowChip state={openState} /> : null}
      </div>

      {loadError ? (
        <p style={{ color: 'var(--danger)', margin: '4px 0 8px', fontSize: 13 }} role="alert">
          {loadError}{' '}
          <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => void load()}>
            Retry
          </button>
        </p>
      ) : null}

      {!everSaved ? (
        // Said before the first save, not after the first complaint. Until this
        // is saved the branch takes orders at any hour, and saving it is the
        // moment that stops — which is not obvious from a form full of times.
        <p className="muted" style={{ margin: '0 0 12px', fontSize: 13 }}>
          This branch has no schedule yet, so it currently takes orders <strong>at any hour</strong>.
          Saving these hours is what starts turning customers away outside them.
        </p>
      ) : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {week.map((d) => (
          <div key={d.dayOfWeek} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ width: 85, fontWeight: 600, fontSize: 13 }}>{DAY_NAMES[d.dayOfWeek]}</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={!d.isClosed}
                onChange={(e) => updateDay(d.dayOfWeek, { isClosed: !e.target.checked })}
                aria-label={`${DAY_NAMES[d.dayOfWeek]} open`}
              />
              Open
            </label>
            {!d.isClosed ? (
              <>
                {is24h(d) ? (
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--success)' }}>24 hours</span>
                ) : (
                  <>
                    <input
                      type="time"
                      value={minuteToTime(d.openMinute)}
                      onChange={(e) => updateDay(d.dayOfWeek, { openMinute: timeToMinute(e.target.value) })}
                      style={{ width: 95 }}
                      aria-label={`${DAY_NAMES[d.dayOfWeek]} opens`}
                    />
                    <span>–</span>
                    <input
                      type="time"
                      value={minuteToTime(d.closeMinute)}
                      onChange={(e) => updateDay(d.dayOfWeek, { closeMinute: timeToMinute(e.target.value) })}
                      style={{ width: 95 }}
                      aria-label={`${DAY_NAMES[d.dayOfWeek]} closes`}
                    />
                  </>
                )}
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 11, padding: '2px 6px' }}
                  onClick={() =>
                    updateDay(
                      d.dayOfWeek,
                      is24h(d)
                        ? { openMinute: 9 * 60, closeMinute: 23 * 60 }
                        : { openMinute: 0, closeMinute: 1439 },
                    )
                  }
                >
                  {is24h(d) ? 'Custom' : '24h'}
                </button>
                {crossesMidnight(d) ? (
                  // Not a typo, and worth confirming: the backend reads the
                  // after-midnight half off this day's row, so a late kitchen
                  // stays open rather than reporting shut at 00:01.
                  <span className="muted" style={{ fontSize: 12 }}>closes next day</span>
                ) : null}
              </>
            ) : (
              <span className="muted" style={{ fontSize: 13 }}>Closed</span>
            )}
          </div>
        ))}
      </div>

      {problem ? (
        <p style={{ color: 'var(--danger)', margin: '10px 0 0', fontSize: 13 }} role="alert">
          {problem}
        </p>
      ) : null}
      {saveError ? (
        <p style={{ color: 'var(--danger)', margin: '10px 0 0', fontSize: 13 }} role="alert">
          Not saved — {saveError}
        </p>
      ) : null}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
        <button className="btn btn-primary" onClick={() => void save()} disabled={saving || problem !== null}>
          {saving ? 'Saving…' : 'Save hours'}
        </button>
        <span className="muted" style={{ fontSize: 12 }}>{saved ? 'Saved.' : ''}</span>
      </div>

      <HoursOverridesEditor
        branchId={branchId}
        overrides={overrides}
        onChanged={(next) => setOverrides(next)}
      />
    </div>
  );
}

/** Open or closed right now, and — when it is shut — when it opens again. */
function OpenNowChip({ state }: { state: BranchOpenState }): React.JSX.Element {
  if (!state.configured) {
    // Deliberately not a green "Open": no schedule is a different thing from
    // being inside one, and an owner should be able to tell which they have.
    return <StatusChip label="no hours set" tone="neutral" />;
  }
  if (state.isOpen) {
    const closesAt = minuteToTime(state.closesAtMinute ?? 0);
    return (
      <StatusChip
        label={state.closesAtMinute !== null ? `open until ${closesAt}` : 'open now'}
        tone="success"
      />
    );
  }
  const opensAt = state.opensAtMinute !== null ? minuteToTime(state.opensAtMinute) : null;
  return (
    <StatusChip
      label={state.note ?? (opensAt ? `closed · opens ${opensAt}` : 'closed now')}
      tone="warning"
    />
  );
}

/**
 * The dates that break the weekly pattern — Eid, Ramadan, a private event.
 *
 * These are the reason the schedule is worth having at all: a weekly pattern
 * that cannot be suspended for a public holiday is one an owner has to
 * remember to switch off by hand, which is the thing they will be too busy to
 * do on the day it matters. An override **replaces** its day outright, and the
 * note travels to the customer — "Closed today — Eid holiday" answers the next
 * question where a bare "closed" invites a phone call to an empty branch.
 */
function HoursOverridesEditor({
  branchId,
  overrides,
  onChanged,
}: {
  branchId: string;
  overrides: HoursOverride[];
  onChanged: (next: HoursOverride[]) => void;
}): React.JSX.Element {
  const { api } = useAuth();
  const [date, setDate] = useState(todayISO());
  const [closed, setClosed] = useState(true);
  const [openMinute, setOpenMinute] = useState(9 * 60);
  const [closeMinute, setCloseMinute] = useState(23 * 60);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const created = await api.addHoursOverride(branchId, {
        date,
        isClosed: closed,
        ...(closed ? {} : { openMinute, closeMinute }),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      // Upserted by date server-side, so replace rather than append — otherwise
      // editing today's override twice shows it twice.
      onChanged([...overrides.filter((o) => o.date.slice(0, 10) !== date), created]);
      setNote('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that date.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await api.removeHoursOverride(branchId, id);
      onChanged(overrides.filter((o) => o.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove that date.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ marginTop: 20, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
      <h4 style={{ margin: '0 0 4px' }}>Holidays and special dates</h4>
      <p className="muted" style={{ margin: '0 0 12px', fontSize: 13 }}>
        A date here <strong>replaces</strong> the weekly hours for that day — for Eid, Ramadan or a
        private event. The note is shown to customers, so &ldquo;Eid holiday&rdquo; reads better
        than nothing.
      </p>

      {overrides.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
          {[...overrides]
            .sort((a, b) => a.date.localeCompare(b.date))
            .map((o) => (
              <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <span style={{ width: 100, fontWeight: 600 }}>{o.date.slice(0, 10)}</span>
                <span>
                  {o.isClosed || o.openMinute === null || o.closeMinute === null
                    ? 'Closed'
                    : `${minuteToTime(o.openMinute)} – ${minuteToTime(o.closeMinute)}`}
                </span>
                {o.note ? <span className="muted">· {o.note}</span> : null}
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 11, padding: '2px 6px', marginLeft: 'auto' }}
                  disabled={busy}
                  onClick={() => void remove(o.id)}
                >
                  Remove
                </button>
              </div>
            ))}
        </div>
      ) : (
        <p className="muted" style={{ margin: '0 0 12px', fontSize: 13 }}>
          No special dates set.
        </p>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <label>
          <span className="muted" style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Override date" />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, paddingBottom: 6 }}>
          <input type="checkbox" checked={closed} onChange={(e) => setClosed(e.target.checked)} />
          Closed all day
        </label>
        {!closed ? (
          <>
            <label>
              <span className="muted" style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>Opens</span>
              <input
                type="time"
                value={minuteToTime(openMinute)}
                onChange={(e) => setOpenMinute(timeToMinute(e.target.value))}
                style={{ width: 95 }}
                aria-label="Override opens"
              />
            </label>
            <label>
              <span className="muted" style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>Closes</span>
              <input
                type="time"
                value={minuteToTime(closeMinute)}
                onChange={(e) => setCloseMinute(timeToMinute(e.target.value))}
                style={{ width: 95 }}
                aria-label="Override closes"
              />
            </label>
          </>
        ) : null}
        <label style={{ flex: 1, minWidth: 160 }}>
          <span className="muted" style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>Note (shown to customers)</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Eid holiday" maxLength={250} />
        </label>
        <button className="btn" onClick={() => void add()} disabled={busy || !date}>
          {busy ? 'Saving…' : 'Add date'}
        </button>
      </div>

      {error ? (
        <p style={{ color: 'var(--danger)', margin: '8px 0 0', fontSize: 13 }} role="alert">{error}</p>
      ) : null}
    </div>
  );
}

const MIN_PASSWORD = 12;

function BranchCredentialsEditor({ branchId }: { branchId: string }): React.JSX.Element {
  const { api } = useAuth();
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingUser, setEditingUser] = useState<StaffUser | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState('');
  const [addEmail, setAddEmail] = useState('');
  const [addPassword, setAddPassword] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Memoised so the effect below can depend on it honestly. Its own deps are
  // `api` and `branchId`, which is what the effect was already keyed on — so
  // this changes nothing about when users are fetched, it just stops the
  // dependency array claiming something untrue.
  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listUsers({ branchId, limit: 50 });
      setUsers(res.data);
    } catch { /* ignore */ }
    setLoading(false);
  }, [api, branchId]);

  useEffect(() => { void loadUsers(); }, [loadUsers]);

  const startEdit = (u: StaffUser) => {
    setEditingUser(u);
    setEditName(u.fullName);
    setEditEmail(u.email);
    setNewPassword('');
    setNote(null);
    setError(null);
  };

  const saveName = async () => {
    if (!editingUser) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await api.updateUser(editingUser.id, { fullName: editName.trim() });
      setNote('Name saved.');
      await loadUsers();
      setEditingUser((prev) => prev ? { ...prev, fullName: editName.trim() } : null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save name.');
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async () => {
    if (!editingUser) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await api.resetUserPassword(editingUser.id, newPassword);
      setNewPassword('');
      setNote('Password reset successfully. All active sessions have been revoked.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to reset password.');
    } finally {
      setBusy(false);
    }
  };

  const createStaff = async () => {
    setAddBusy(true);
    setAddError(null);
    try {
      await api.createUser({
        fullName: addName.trim(),
        email: addEmail.trim().toLowerCase(),
        password: addPassword,
        role: 'BRANCH_ADMIN',
        branchId,
      });
      setShowAdd(false);
      setAddName('');
      setAddEmail('');
      setAddPassword('');
      await loadUsers();
    } catch (err) {
      if (err instanceof ApiError) {
        setAddError(err.details?.length ? err.details.join(', ') : err.message);
      } else {
        setAddError('Failed to create staff account.');
      }
    } finally {
      setAddBusy(false);
    }
  };

  if (loading) return <p className="muted">Loading staff…</p>;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h4 style={{ margin: 0 }}>Branch staff credentials</h4>
        {!showAdd && (
          <button className="btn btn-sm" onClick={() => { setShowAdd(true); setAddError(null); }}>
            + Add staff
          </button>
        )}
      </div>

      {showAdd && (
        <div style={{ marginBottom: 16, padding: 16, border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--bg-raised, var(--bg))' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <strong>New staff account</strong>
            <button className="btn btn-ghost" style={{ padding: '2px 8px' }} onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label>
              <span className="muted" style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>Full name</span>
              <input value={addName} onChange={(e) => setAddName(e.target.value)} maxLength={120} placeholder="Branch Staff" />
            </label>
            <label>
              <span className="muted" style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>Email (used to sign in)</span>
              <input type="email" value={addEmail} onChange={(e) => setAddEmail(e.target.value)} maxLength={200} placeholder="branch@example.com" />
            </label>
            <label>
              <span className="muted" style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>Password (min {MIN_PASSWORD} characters)</span>
              <input type="password" value={addPassword} onChange={(e) => setAddPassword(e.target.value)} maxLength={200} placeholder="••••••••••••" />
            </label>
          </div>
          {addError && <p style={{ color: 'var(--danger)', margin: '8px 0 0', fontSize: 13 }}>{addError}</p>}
          <button
            className="btn btn-primary btn-sm"
            style={{ marginTop: 12 }}
            disabled={addBusy || !addName.trim() || !addEmail.trim() || addPassword.length < MIN_PASSWORD}
            onClick={createStaff}
          >
            {addBusy ? 'Creating…' : 'Create account'}
          </button>
        </div>
      )}

      {users.length === 0 && !showAdd && (
        <p className="muted">No staff accounts for this branch. Click &ldquo;+ Add staff&rdquo; above to create one.</p>
      )}

      {users.map((u) => (
        <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
          <div style={{ flex: 1 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{u.fullName}</span>
            <span className="muted" style={{ marginLeft: 8, fontSize: 13 }}>{u.email}</span>
            {!u.isActive && <StatusChip label="inactive" tone="danger" />}
          </div>
          <button className="btn btn-ghost" style={{ padding: '4px 12px', fontSize: 13 }} onClick={() => startEdit(u)}>
            Edit
          </button>
        </div>
      ))}

      {editingUser && (
        <div style={{ marginTop: 16, padding: 16, border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--bg-raised, var(--bg))' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h4 style={{ margin: 0 }}>Edit: {editingUser.fullName}</h4>
            <button className="btn btn-ghost" style={{ padding: '2px 8px' }} onClick={() => setEditingUser(null)}>Close</button>
          </div>

          <label style={{ display: 'block', marginBottom: 8 }}>
            <span className="muted" style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>Email (read-only)</span>
            <input value={editEmail} disabled style={{ opacity: 0.6, cursor: 'not-allowed' }} />
          </label>

          <label style={{ display: 'block', marginBottom: 8 }}>
            <span className="muted" style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>Staff name</span>
            <input value={editName} onChange={(e) => setEditName(e.target.value)} />
          </label>
          <button
            className="btn btn-sm"
            disabled={busy || editName.trim() === editingUser.fullName || !editName.trim()}
            onClick={saveName}
            style={{ marginBottom: 16 }}
          >
            {busy ? 'Saving…' : 'Save name'}
          </button>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <label style={{ display: 'block', marginBottom: 8 }}>
              <span className="muted" style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>
                New password (min {MIN_PASSWORD} characters) — revokes active sessions
              </span>
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="••••••••••••" />
            </label>
            <button
              className="btn btn-sm"
              disabled={busy || newPassword.length < MIN_PASSWORD}
              onClick={resetPassword}
            >
              {busy ? 'Resetting…' : 'Reset password'}
            </button>
          </div>

          {error && <p style={{ color: 'var(--danger)', margin: '8px 0 0', fontSize: 13 }}>{error}</p>}
          {note && <p style={{ color: 'var(--success)', margin: '8px 0 0', fontSize: 13 }}>{note}</p>}
        </div>
      )}
    </div>
  );
}

/**
 * Delivery pricing for one branch: base fee, the distance it covers, the per-km
 * fee, the minimum order, the maximum distance and the delivery uplift.
 *
 * ## It stages changes and commits them on Save
 *
 * These fields used to write to the server the moment they lost focus, under
 * the words "Changes save automatically". That is a fine pattern until an owner
 * needs to be *sure* — and this is the screen where being wrong is invisible
 * here and loud in the customer's app: a maximum distance that did not save
 * keeps refusing customers at the old limit, and nothing in this panel says so.
 *
 * An explicit Save buys three things blur-saving cannot. One confirmation for a
 * set of related edits (the base fee and the distance it covers are one
 * thought, not two). A Discard that genuinely restores, because the server has
 * not been touched. And a fee preview of what you are **about to** save rather
 * than of what is already stored.
 *
 * The parsing lives in `util/branchSettingsDraft.ts`, pure and tested — above
 * all the rule that a blank maximum distance is `null` ("we deliver anywhere")
 * and never `0`, which refuses every delivery.
 *
 * The preview mirrors the backend rule and is illustration only — every price a
 * customer or staff member is ever shown comes from the backend snapshot.
 */
function DeliveryPricingEditor({
  settings,
  saving,
  save,
  error,
  saved,
}: {
  settings: BranchSettings;
  saving: boolean;
  save: (change: Partial<BranchSettings>) => void;
  /** Set when the last save was rejected. */
  error?: string | null;
  /** True just after a save landed. */
  saved?: boolean;
}): React.JSX.Element {
  const [draft, setDraft] = useState<DeliveryPricingDraft>(() => toDraft(settings));

  // The server is the source of truth: when it hands back new settings — after
  // a save, or on switching branch — the form follows it.
  useEffect(() => {
    setDraft(toDraft(settings));
  }, [settings]);

  const set = (field: keyof DeliveryPricingDraft, value: string): void =>
    setDraft((d) => ({ ...d, [field]: value }));

  const dirty = isDirty(draft, settings);
  const patch = draftToPatch(draft, settings);

  // The preview follows the draft, not the saved settings, so the owner can see
  // what a customer would pay under the numbers they are typing.
  const ladder = previewLadder({
    baseFeeMinor: patch.deliveryFeeMinor,
    baseFeeCoversKm: patch.deliveryBaseFeeCoversKm,
    perKmFeeMinor: patch.deliveryPerKmFeeMinor,
  });
  const uplift = patch.deliveryUpliftPercent;

  const field = (
    label: string,
    name: keyof DeliveryPricingDraft,
    extra: React.InputHTMLAttributes<HTMLInputElement> = {},
  ): React.JSX.Element => (
    <label style={{ flex: 1, minWidth: 140 }}>
      <span className="muted" style={{ display: 'block', marginBottom: 4 }}>
        {label}
      </span>
      <input
        type="number"
        value={draft[name]}
        onChange={(e) => set(name, e.target.value)}
        step="0.5"
        min={0}
        disabled={saving}
        {...extra}
      />
    </label>
  );

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Delivery pricing</h3>
      <p className="muted" style={{ marginTop: -4, fontSize: 13 }}>
        These apply to this branch only. Every delivery is charged the base fee, plus the per-km
        fee for each further kilometre started beyond the distance the base fee covers.
      </p>

      <div style={{ display: 'flex', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
        {field('Base fee (SAR)', 'deliveryFee')}
        {field('Base fee covers (km)', 'deliveryBaseFeeCoversKm')}
        {field('Each further km (SAR)', 'deliveryPerKmFee')}
      </div>

      <div style={{ display: 'flex', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
        {field('Minimum order (SAR)', 'minOrder')}
        {field('Maximum distance (km)', 'deliveryRadiusKm', { placeholder: 'No limit' })}
      </div>
      <p className="muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
        Leave the maximum distance blank to deliver anywhere. The minimum order applies to
        delivery only — it never blocks a counter or pickup order.
      </p>

      <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border, #e5e5e5)' }}>
        <span className="muted" style={{ display: 'block', marginBottom: 6, fontSize: 13 }}>
          What a customer would pay {dirty ? '(with your unsaved changes)' : ''}
        </span>
        <table style={{ width: '100%', maxWidth: 360, fontSize: 13 }}>
          <tbody>
            {ladder.map((row) => (
              <tr key={row.distanceKm}>
                <td style={{ padding: '2px 0' }}>{row.distanceKm} km</td>
                <td className="muted" style={{ padding: '2px 8px' }}>
                  {row.chargeableKm === 0 ? 'base fee' : `base + ${row.chargeableKm} km`}
                </td>
                <td style={{ padding: '2px 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {formatMinor(row.feeMinor)} SAR
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted" style={{ margin: '8px 0 0', fontSize: 12 }}>
          Distance is measured from the branch to the customer&rsquo;s pin. An address saved
          without a pin is charged the base fee rather than refused.
        </p>
      </div>

      <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border, #e5e5e5)' }}>
        <div style={{ maxWidth: 260 }}>{field('Delivery item price uplift (%)', 'deliveryUpliftPercent', { max: 100 })}</div>
        <p className="muted" style={{ margin: '6px 0 0', fontSize: 12 }}>
          Added to every item price on delivery orders, to cover the cost of delivering them.
          Customers see the raised price on the menu once they choose delivery &mdash; it is not
          a separate line on the bill. A 32.50 dish would show as{' '}
          <strong>{formatMinor(previewUpliftedPrice(3250, uplift))} SAR</strong> on delivery.
          Set 0 to turn it off. Individual products can override this on the Menu page.
        </p>
      </div>

      <div
        style={{
          marginTop: 16,
          paddingTop: 12,
          borderTop: '1px solid var(--border, #e5e5e5)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <button
          className="btn btn-primary"
          disabled={!dirty || saving}
          onClick={() => save(patch)}
        >
          {saving ? 'Saving…' : 'Save delivery pricing'}
        </button>
        {dirty && !saving ? (
          <button className="btn btn-ghost" onClick={() => setDraft(toDraft(settings))}>
            Discard changes
          </button>
        ) : null}
        {/* Three distinct states, because "nothing happened" used to cover all
            of them: unsaved edits pending, a save that landed, and one that was
            refused. The last is an alert so it is announced, not just coloured. */}
        {error ? (
          <span role="alert" style={{ color: 'var(--danger)', fontWeight: 700, fontSize: 13 }}>
            {error}
          </span>
        ) : dirty ? (
          <span className="muted" style={{ fontSize: 13 }}>
            Unsaved changes.
          </span>
        ) : saved ? (
          <span style={{ color: 'var(--success, #1c8b4f)', fontWeight: 700, fontSize: 13 }}>
            Saved.
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function BranchSettingsPage(): React.JSX.Element {
  const { api } = useAuth();
  const navigate = useNavigate();
  const branches = useAsync(() => api.branches(), []);
  const [branchId, setBranchId] = useState<string>('');
  const [settings, setSettings] = useState<BranchSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!branchId && branches.data && branches.data.length > 0) {
      setBranchId(branches.data[0]?.id ?? '');
    }
  }, [branches.data, branchId]);

  const loaded = useAsync(() => (branchId ? api.branchSettings(branchId) : Promise.resolve(null)), [branchId]);
  useEffect(() => {
    setSettings(loaded.data);
    setSaved(false);
    setError(null);
  }, [loaded.data]);

  /**
   * Saves one changed field.
   *
   * ## Why the catch is the important part
   *
   * This panel says "Changes save automatically" and every field writes through
   * here on blur or toggle. It used to have no `catch` at all: the new value was
   * applied to local state **first**, optimistically, and a rejected request
   * only skipped the "Saved." text on its way to an unhandled promise
   * rejection. So a save that failed looked exactly like one that worked — the
   * field showed what you typed, nothing said otherwise, and the server still
   * held the old value. An owner sets a delivery radius, sees 25 on the screen,
   * and customers keep getting refused at the old limit.
   *
   * On failure it reverts `settings` to what the server actually has and
   * records why. The delivery-pricing form is controlled and re-derives its
   * draft from `settings`, so that revert also puts the refused value out of
   * the boxes — the owner is never left looking at a number the server does
   * not hold.
   */
  const patch = async (change: Partial<BranchSettings>): Promise<void> => {
    if (!branchId || !settings) return;
    const previous = settings;
    setSettings({ ...settings, ...change });
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const next = await api.updateBranchSettings(branchId, change);
      setSettings(next);
      setSaved(true);
    } catch (e) {
      setSettings(previous);
      setError(
        e instanceof ApiError
          ? `Not saved — ${e.message}`
          : 'Not saved. Check your connection and try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  const selectedBranch = (branches.data ?? []).find((b) => b.id === branchId);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <h2 style={{ margin: 0, flex: 1 }}>Branches</h2>
        <button className="btn btn-primary" onClick={() => navigate('/branches/new')}>
          + New branch
        </button>
      </div>

      <DataState loading={branches.loading} error={branches.error?.message ?? null} onRetry={branches.reload}>
        {branches.data && branches.data.length > 0 ? (
          <>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
              {branches.data.map((b) => (
                <button
                  key={b.id}
                  className={branchId === b.id ? 'btn btn-primary' : 'btn'}
                  onClick={() => setBranchId(b.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  {b.name}
                  <StatusChip label={STATUS_LABELS[b.status] ?? b.status} tone={STATUS_TONE[b.status] ?? 'muted'} />
                </button>
              ))}
            </div>

            {selectedBranch && (
              <BranchInfoEditor branch={selectedBranch} onSaved={branches.reload} />
            )}

            <DataState loading={loaded.loading && !settings} error={loaded.error?.message ?? null} onRetry={loaded.reload}>
              {settings ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 600 }}>
                  <div className="card">
                    <h3 style={{ marginTop: 0 }}>Settings</h3>
                    <Toggle label="Accepting orders" value={settings.isAcceptingOrders} onChange={(v) => patch({ isAcceptingOrders: v })} disabled={saving} />
                    <Toggle label="Delivery" value={settings.acceptsDelivery} onChange={(v) => patch({ acceptsDelivery: v })} disabled={saving} />
                    <Toggle label="Pickup" value={settings.acceptsPickup} onChange={(v) => patch({ acceptsPickup: v })} disabled={saving} />
                    <Toggle label="Cash on delivery" value={settings.acceptsCashOnDelivery} onChange={(v) => patch({ acceptsCashOnDelivery: v })} disabled={saving} />
                    <Toggle
                      label="Auto-accept new orders"
                      value={settings.autoAcceptOrders}
                      onChange={(v) => patch({ autoAcceptOrders: v })}
                      disabled={saving}
                    />
                    <p className="muted" style={{ margin: '-4px 0 8px', fontSize: 12 }}>
                      Off: every new order lands in the <strong>New orders</strong> tray for a human to accept or reject.
                      On: paid or COD orders go straight to the kitchen.
                    </p>

                    <div style={{ display: 'flex', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
                      <label style={{ flex: 1, minWidth: 120 }}>
                        <span className="muted" style={{ display: 'block', marginBottom: 4 }}>Prep time (minutes)</span>
                        <input
                          type="number"
                          defaultValue={settings.prepTimeMinutes}
                          onBlur={(e) => patch({ prepTimeMinutes: parseInt(e.target.value) || 20 })}
                          min={1}
                          max={120}
                        />
                      </label>
                    </div>

                    <p className="muted" style={{ marginBottom: 0 }}>{saving ? 'Saving…' : saved ? 'Saved.' : 'Changes save automatically.'}</p>
                  </div>

                  <DeliveryPricingEditor
                    settings={settings}
                    saving={saving}
                    save={(change) => void patch(change)}
                    error={error}
                    saved={saved}
                  />

                  {branchId && (
                    <div className="card">
                      <OpeningHoursEditor branchId={branchId} />
                    </div>
                  )}

                  {branchId && (
                    <div className="card">
                      <BranchCredentialsEditor branchId={branchId} />
                    </div>
                  )}
                </div>
              ) : null}
            </DataState>
          </>
        ) : (
          <div className="card" style={{ maxWidth: 520, textAlign: 'center' }}>
            <p>No branches yet.</p>
            <button className="btn btn-primary" onClick={() => navigate('/branches/new')}>
              Create your first branch
            </button>
          </div>
        )}
      </DataState>
    </div>
  );
}
