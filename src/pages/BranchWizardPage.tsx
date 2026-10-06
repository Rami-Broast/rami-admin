import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/AuthProvider';
import { LocationPicker, LocationData } from '../components/LocationPicker';
import { Toggle } from '../components/ui';
import type { BranchSettings, CreateBranchInput, OpeningHoursEntry } from '../api/types';
import { formatMinor } from '../util/money';

const STEPS = ['Info', 'Location', 'Hours', 'Order settings', 'Delivery', 'Staff login', 'Review'] as const;
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const STORAGE_KEY = 'rami.branch-wizard';

function minuteToTime(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function timeToMinute(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

const defaultHours = (): OpeningHoursEntry[] =>
  Array.from({ length: 7 }, (_, i) => ({
    dayOfWeek: i,
    openMinute: 480,
    closeMinute: 1380,
    isClosed: i === 5,
  }));

interface WizardState {
  info: {
    code: string;
    name: string;
    nameAr: string;
    phone: string;
  };
  location: LocationData;
  hours: OpeningHoursEntry[];
  orderSettings: {
    acceptsPickup: boolean;
    acceptsDelivery: boolean;
    acceptsCashOnDelivery: boolean;
    autoAcceptOrders: boolean;
    prepTimeMinutes: number;
  };
  delivery: {
    deliveryFeeMinor: number;
    minOrderMinor: number;
    /** Null is a real choice: "we deliver anywhere". Never send 0 for a blank field. */
    deliveryRadiusKm: number | null;
  };
  credentials: {
    fullName: string;
    email: string;
    password: string;
  };
}

const INITIAL: WizardState = {
  info: { code: '', name: '', nameAr: '', phone: '' },
  location: { addressLine: '', district: '', city: '', latitude: '', longitude: '' },
  hours: defaultHours(),
  orderSettings: {
    acceptsPickup: true,
    acceptsDelivery: true,
    acceptsCashOnDelivery: false,
    autoAcceptOrders: true,
    prepTimeMinutes: 20,
  },
  // The owner's confirmed delivery numbers (2026-09-04): 5 SAR base fee,
  // 40 SAR minimum order, 25 km limit. The wizard *sends* these on create, so
  // leaving them at zero silently gave every new branch a free delivery and no
  // minimum — overwriting the backend's own defaults with worse ones.
  delivery: {
    deliveryFeeMinor: 500,
    minOrderMinor: 4000,
    deliveryRadiusKm: 25,
  },
  credentials: {
    fullName: '',
    email: '',
    password: '',
  },
};

function loadSaved(): WizardState | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as WizardState) : null;
  } catch {
    return null;
  }
}

function is24h(h: OpeningHoursEntry): boolean {
  return h.openMinute === 0 && h.closeMinute === 1439;
}

/** What to call each write when one of them fails, in the operator's words. */
const STEP_LABELS: Record<'branch' | 'settings' | 'hours' | 'account', string> = {
  branch: 'creating the branch',
  settings: 'saving the order and delivery settings',
  hours: 'saving the opening hours',
  account: 'creating the branch sign-in account',
};

export function BranchWizardPage(): React.JSX.Element {
  const navigate = useNavigate();
  const { api } = useAuth();
  const [stepIdx, setStepIdx] = useState(0);
  const [state, setState] = useState<WizardState>(() => loadSaved() ?? INITIAL);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdBranchId, setCreatedBranchId] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const step = STEPS[stepIdx]!;

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch { /* ignore */ }
  }, [state]);

  const update = <K extends keyof WizardState>(section: K, patch: Partial<WizardState[K]>) => {
    setState((prev) => ({ ...prev, [section]: { ...prev[section], ...patch } }));
  };

  const updateHour = (dayOfWeek: number, patch: Partial<OpeningHoursEntry>) => {
    setState((prev) => ({
      ...prev,
      hours: prev.hours.map((h) => (h.dayOfWeek === dayOfWeek ? { ...h, ...patch } : h)),
    }));
  };

  const canNext = (): boolean => {
    switch (step) {
      case 'Info':
        return state.info.code.trim().length >= 2 && state.info.name.trim().length >= 1;
      case 'Location':
        return state.location.addressLine.trim().length >= 1 && state.location.city.trim().length >= 1;
      case 'Staff login':
        return (
          state.credentials.fullName.trim().length >= 1 &&
          state.credentials.email.trim().length >= 3 &&
          state.credentials.password.length >= 12
        );
      default:
        return true;
    }
  };

  const next = () => {
    if (stepIdx < STEPS.length - 1) setStepIdx(stepIdx + 1);
  };

  const prev = () => {
    if (stepIdx > 0) setStepIdx(stepIdx - 1);
  };

  const submit = async () => {
    setSaving(true);
    setError(null);

    // Which write is in flight, so a failure can say so. Retry is safe for all
    // of them: settings and hours are idempotent replacements, and a duplicate
    // account is refused by the backend rather than double-created.
    let step: 'branch' | 'settings' | 'hours' | 'account' = 'branch';
    // Tracked locally as well as in state: `setCreatedBranchId` does not update
    // the `createdBranchId` this closure captured, so on the *first* failure
    // after a successful create — exactly when it matters — the catch below
    // would otherwise still read null and tell the operator nothing was made.
    let existingBranchId = createdBranchId;

    try {
      let branchId = createdBranchId;

      if (!branchId) {
        const input: CreateBranchInput = {
          code: state.info.code.trim().toUpperCase(),
          name: state.info.name.trim(),
          nameAr: state.info.nameAr.trim() || undefined,
          phone: state.info.phone.trim() || undefined,
          addressLine: state.location.addressLine.trim(),
          district: state.location.district.trim() || undefined,
          city: state.location.city.trim(),
          latitude: state.location.latitude ? parseFloat(state.location.latitude) : undefined,
          longitude: state.location.longitude ? parseFloat(state.location.longitude) : undefined,
        };
        const branch = await api.createBranch(input);
        branchId = branch.id;
        existingBranchId = branchId;
        setCreatedBranchId(branchId);
      }

      const settingsPatch: Partial<BranchSettings> = {
        acceptsPickup: state.orderSettings.acceptsPickup,
        acceptsDelivery: state.orderSettings.acceptsDelivery,
        acceptsCashOnDelivery: state.orderSettings.acceptsCashOnDelivery,
        autoAcceptOrders: state.orderSettings.autoAcceptOrders,
        prepTimeMinutes: state.orderSettings.prepTimeMinutes,
        deliveryFeeMinor: state.delivery.deliveryFeeMinor,
        minOrderMinor: state.delivery.minOrderMinor,
        deliveryRadiusKm: state.delivery.deliveryRadiusKm,
      };

      // Sequenced, not Promise.all. These are three separate writes against a
      // branch that already exists, and when one fails the operator has to know
      // which: "something went wrong" after a parallel batch leaves them unable
      // to tell whether the hours saved, whether the sign-in account exists, or
      // whether it is safe to press Retry. The account is created last because
      // it is the step most likely to fail on its own (a duplicate email) and
      // the one most annoying to half-apply.
      step = 'settings';
      await api.updateBranchSettings(branchId, settingsPatch);

      step = 'hours';
      await api.setOpeningHours(branchId, state.hours);

      step = 'account';
      await api.createUser({
        email: state.credentials.email.trim().toLowerCase(),
        password: state.credentials.password,
        fullName: state.credentials.fullName.trim(),
        role: 'BRANCH_ADMIN',
        branchId,
      });

      try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
      setSuccess(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      if (existingBranchId) {
        setError(
          `${msg} — The branch was created and setup stopped at ${STEP_LABELS[step]}. ` +
            'Tap "Retry" to finish setup, or open Branch Settings.',
        );
      } else {
        setError(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  if (success) {
    return (
      <div>
        <div className="card" style={{ maxWidth: 520, textAlign: 'center', padding: 32 }}>
          <h2 style={{ marginTop: 0 }}>Branch created</h2>
          <p style={{ fontSize: 16 }}><strong>{state.info.name}</strong> is ready to go.</p>
          <p className="muted">Next, add menu items so customers can start ordering from this branch.</p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 20 }}>
            <button className="btn btn-primary" onClick={() => navigate('/menu')}>
              Set up menu
            </button>
            <button className="btn" onClick={() => navigate('/branches')}>
              Go to Branches
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => {
                setState(INITIAL);
                setSuccess(false);
                setStepIdx(0);
                setCreatedBranchId(null);
                try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
              }}
            >
              Create another
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button className="btn btn-ghost" onClick={() => navigate('/branches')}>← Branches</button>
        <h2 style={{ margin: 0, flex: 1 }}>New branch</h2>
      </div>

      {/* Stepper */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24 }}>
        {STEPS.map((s, i) => (
          <button
            key={s}
            className="btn btn-ghost"
            onClick={() => i <= stepIdx && setStepIdx(i)}
            style={{
              flex: 1,
              padding: '8px 4px',
              fontSize: 13,
              fontWeight: i === stepIdx ? 700 : 400,
              borderBottom: i === stepIdx ? '2px solid var(--magenta)' : '2px solid var(--border)',
              opacity: i <= stepIdx ? 1 : 0.5,
              cursor: i <= stepIdx ? 'pointer' : 'default',
            }}
          >
            {i + 1}. {s}
          </button>
        ))}
      </div>

      <div className="card" style={{ maxWidth: 600 }}>
        {step === 'Info' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label>
              <span className="muted" style={{ display: 'block', marginBottom: 4 }}>Branch code *</span>
              <input
                value={state.info.code}
                onChange={(e) => update('info', { code: e.target.value })}
                placeholder="BR-002"
                maxLength={20}
                style={{ textTransform: 'uppercase' }}
              />
            </label>
            <label>
              <span className="muted" style={{ display: 'block', marginBottom: 4 }}>Name (English) *</span>
              <input
                value={state.info.name}
                onChange={(e) => update('info', { name: e.target.value })}
                placeholder="Downtown branch"
                maxLength={120}
              />
            </label>
            <label>
              <span className="muted" style={{ display: 'block', marginBottom: 4 }}>Name (Arabic)</span>
              <input
                value={state.info.nameAr}
                onChange={(e) => update('info', { nameAr: e.target.value })}
                placeholder="فرع وسط المدينة"
                maxLength={120}
                dir="rtl"
              />
            </label>
            <label>
              <span className="muted" style={{ display: 'block', marginBottom: 4 }}>Phone</span>
              <input
                value={state.info.phone}
                onChange={(e) => update('info', { phone: e.target.value })}
                placeholder="+966 5x xxx xxxx"
                maxLength={20}
              />
            </label>
          </div>
        )}

        {step === 'Location' && (
          <LocationPicker
            value={state.location}
            onChange={(patch) => update('location', patch)}
          />
        )}

        {step === 'Hours' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <p className="muted" style={{ margin: 0 }}>Set the weekly schedule.</p>
              <button
                className="btn btn-ghost"
                style={{ fontSize: 12, padding: '4px 8px' }}
                onClick={() => {
                  setState((prev) => ({
                    ...prev,
                    hours: prev.hours.map((h) => ({ ...h, isClosed: false, openMinute: 0, closeMinute: 1439 })),
                  }));
                }}
              >
                Set all 24h
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {state.hours.map((h) => (
                <div key={h.dayOfWeek} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ width: 90, fontWeight: 600, fontSize: 14 }}>{DAY_NAMES[h.dayOfWeek]}</span>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={!h.isClosed}
                      onChange={(e) => updateHour(h.dayOfWeek, { isClosed: !e.target.checked })}
                    />
                    Open
                  </label>
                  {!h.isClosed && (
                    <>
                      {is24h(h) ? (
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--success)' }}>24 hours</span>
                      ) : (
                        <>
                          <input
                            type="time"
                            value={minuteToTime(h.openMinute)}
                            onChange={(e) => updateHour(h.dayOfWeek, { openMinute: timeToMinute(e.target.value) })}
                            style={{ width: 100 }}
                          />
                          <span>–</span>
                          <input
                            type="time"
                            value={minuteToTime(h.closeMinute)}
                            onChange={(e) => updateHour(h.dayOfWeek, { closeMinute: timeToMinute(e.target.value) })}
                            style={{ width: 100 }}
                          />
                        </>
                      )}
                      <button
                        className="btn btn-ghost"
                        style={{ fontSize: 11, padding: '2px 6px' }}
                        onClick={() => {
                          if (is24h(h)) {
                            updateHour(h.dayOfWeek, { openMinute: 480, closeMinute: 1380 });
                          } else {
                            updateHour(h.dayOfWeek, { openMinute: 0, closeMinute: 1439 });
                          }
                        }}
                      >
                        {is24h(h) ? 'Custom' : '24h'}
                      </button>
                    </>
                  )}
                  {h.isClosed && <span className="muted" style={{ fontSize: 13 }}>Closed</span>}
                </div>
              ))}
            </div>
            <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
              Holiday and Ramadan overrides can be added after creation from Branch settings.
            </p>
          </div>
        )}

        {step === 'Order settings' && (
          <div>
            <Toggle
              label="Accepts pickup"
              value={state.orderSettings.acceptsPickup}
              onChange={(v) => update('orderSettings', { acceptsPickup: v })}
            />
            <Toggle
              label="Accepts delivery"
              value={state.orderSettings.acceptsDelivery}
              onChange={(v) => update('orderSettings', { acceptsDelivery: v })}
            />
            <Toggle
              label="Cash on delivery"
              value={state.orderSettings.acceptsCashOnDelivery}
              onChange={(v) => update('orderSettings', { acceptsCashOnDelivery: v })}
            />
            <Toggle
              label="Auto-accept orders"
              value={state.orderSettings.autoAcceptOrders}
              onChange={(v) => update('orderSettings', { autoAcceptOrders: v })}
            />
            <p className="muted" style={{ fontSize: 12, margin: '-4px 0 12px' }}>
              Off: new orders sit in the New Orders tray for a human to accept or reject.
              On: paid or COD orders go straight to the kitchen.
            </p>
            <label>
              <span className="muted" style={{ display: 'block', marginBottom: 4 }}>Estimated prep time (minutes)</span>
              <input
                type="number"
                value={state.orderSettings.prepTimeMinutes}
                onChange={(e) => update('orderSettings', { prepTimeMinutes: parseInt(e.target.value) || 20 })}
                min={1}
                max={120}
                style={{ width: 100 }}
              />
            </label>
          </div>
        )}

        {step === 'Delivery' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label>
              <span className="muted" style={{ display: 'block', marginBottom: 4 }}>Delivery fee (SAR)</span>
              <input
                type="number"
                value={state.delivery.deliveryFeeMinor / 100}
                onChange={(e) => update('delivery', { deliveryFeeMinor: Math.round(parseFloat(e.target.value || '0') * 100) })}
                step="0.5"
                min={0}
                style={{ width: 140 }}
              />
            </label>
            <label>
              <span className="muted" style={{ display: 'block', marginBottom: 4 }}>Minimum order (SAR)</span>
              <input
                type="number"
                value={state.delivery.minOrderMinor / 100}
                onChange={(e) => update('delivery', { minOrderMinor: Math.round((parseFloat(e.target.value) || 0) * 100) })}
                step="0.5"
                min={0}
                style={{ width: 140 }}
              />
            </label>
            <label>
              <span className="muted" style={{ display: 'block', marginBottom: 4 }}>Delivery radius (km)</span>
              <input
                type="number"
                value={state.delivery.deliveryRadiusKm ?? ''}
                onChange={(e) =>
                  update('delivery', {
                    // A blank field is "we deliver anywhere", so it is sent as
                    // null. Coercing it to 0 would refuse every delivery.
                    deliveryRadiusKm:
                      e.target.value.trim() === '' ? null : parseFloat(e.target.value),
                  })
                }
                step="0.5"
                min={0.5}
                placeholder="25"
                style={{ width: 140 }}
              />
              <span className="muted" style={{ display: 'block', fontSize: 12, marginTop: 4 }}>
                Leave blank to deliver with no distance limit.
              </span>
            </label>
            {!state.orderSettings.acceptsDelivery && (
              <p className="muted" style={{ fontSize: 12 }}>
                Delivery is currently disabled — these settings will apply if you enable it later.
              </p>
            )}
          </div>
        )}

        {step === 'Staff login' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
              Set up the login credentials for this branch. Staff will use these to sign in to the Branch POS (kitchen-pos).
            </p>
            <label>
              <span className="muted" style={{ display: 'block', marginBottom: 4 }}>Staff name *</span>
              <input
                value={state.credentials.fullName}
                onChange={(e) => update('credentials', { fullName: e.target.value })}
                placeholder="Downtown Branch Staff"
                maxLength={120}
              />
            </label>
            <label>
              <span className="muted" style={{ display: 'block', marginBottom: 4 }}>Email *</span>
              <input
                type="email"
                value={state.credentials.email}
                onChange={(e) => update('credentials', { email: e.target.value })}
                placeholder="downtown@ramibroast.com"
                maxLength={120}
              />
            </label>
            <label>
              <span className="muted" style={{ display: 'block', marginBottom: 4 }}>Password * (min 12 characters)</span>
              <input
                type="password"
                value={state.credentials.password}
                onChange={(e) => update('credentials', { password: e.target.value })}
                placeholder="••••••••••••"
                minLength={12}
              />
            </label>
          </div>
        )}

        {step === 'Review' && (
          <div>
            <h3 style={{ marginTop: 0 }}>Review before creating</h3>
            <table style={{ width: '100%', fontSize: 14 }}>
              <tbody>
                <tr><td className="muted" style={{ paddingRight: 12 }}>Code</td><td>{state.info.code.toUpperCase()}</td></tr>
                <tr><td className="muted">Name</td><td>{state.info.name}</td></tr>
                {state.info.nameAr && <tr><td className="muted">Arabic name</td><td dir="rtl">{state.info.nameAr}</td></tr>}
                {state.info.phone && <tr><td className="muted">Phone</td><td>{state.info.phone}</td></tr>}
                <tr><td className="muted">Address</td><td>{[state.location.addressLine, state.location.district, state.location.city].filter(Boolean).join(', ')}</td></tr>
                {state.location.latitude && <tr><td className="muted">Coordinates</td><td>{state.location.latitude}, {state.location.longitude}</td></tr>}
                <tr><td className="muted">Pickup</td><td>{state.orderSettings.acceptsPickup ? 'Yes' : 'No'}</td></tr>
                <tr><td className="muted">Delivery</td><td>{state.orderSettings.acceptsDelivery ? 'Yes' : 'No'}</td></tr>
                <tr><td className="muted">COD</td><td>{state.orderSettings.acceptsCashOnDelivery ? 'Yes' : 'No'}</td></tr>
                <tr><td className="muted">Auto-accept</td><td>{state.orderSettings.autoAcceptOrders ? 'Yes' : 'No'}</td></tr>
                <tr><td className="muted">Prep time</td><td>{state.orderSettings.prepTimeMinutes} min</td></tr>
                <tr><td className="muted">Delivery fee</td><td>{formatMinor(state.delivery.deliveryFeeMinor)} SAR</td></tr>
                <tr><td className="muted">Min order</td><td>{formatMinor(state.delivery.minOrderMinor)} SAR</td></tr>
                <tr><td className="muted">Radius</td><td>{state.delivery.deliveryRadiusKm === null ? 'No limit' : `${state.delivery.deliveryRadiusKm} km`}</td></tr>
              </tbody>
            </table>

            <h4>Branch staff login</h4>
            <table style={{ width: '100%', fontSize: 14 }}>
              <tbody>
                <tr><td className="muted" style={{ paddingRight: 12 }}>Name</td><td>{state.credentials.fullName}</td></tr>
                <tr><td className="muted">Email</td><td>{state.credentials.email}</td></tr>
                <tr><td className="muted">Password</td><td>{'•'.repeat(state.credentials.password.length)}</td></tr>
              </tbody>
            </table>

            <h4>Operating hours</h4>
            <div style={{ fontSize: 13 }}>
              {state.hours.map((h) => (
                <div key={h.dayOfWeek} style={{ display: 'flex', gap: 8, padding: '2px 0' }}>
                  <span style={{ width: 90, fontWeight: 600 }}>{DAY_NAMES[h.dayOfWeek]}</span>
                  <span className="muted">
                    {h.isClosed
                      ? 'Closed'
                      : is24h(h)
                        ? '24 hours'
                        : `${minuteToTime(h.openMinute)} – ${minuteToTime(h.closeMinute)}`}
                  </span>
                </div>
              ))}
            </div>

            {error && (
              <div style={{ marginTop: 12, padding: 12, background: 'var(--danger-bg, #fef2f2)', borderRadius: 'var(--radius)' }}>
                <p style={{ color: 'var(--danger)', margin: 0 }}>{error}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, maxWidth: 600 }}>
        <button className="btn btn-ghost" onClick={prev} disabled={stepIdx === 0}>
          ← Back
        </button>
        {step === 'Review' ? (
          <button className="btn btn-primary" onClick={submit} disabled={saving}>
            {saving ? 'Creating…' : createdBranchId ? 'Retry' : 'Create branch'}
          </button>
        ) : (
          <button className="btn btn-primary" onClick={next} disabled={!canNext()}>
            Next →
          </button>
        )}
      </div>
    </div>
  );
}
