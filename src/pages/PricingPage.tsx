import React, { useState } from 'react';

import type {
  Branch,
  Charge,
  ChargeAppliesTo,
  ChargeConditions,
  ChargeType,
  CreateChargeInput,
} from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { DataState, StatusChip } from '../components/ui';
import { useAsync } from '../hooks/useAsync';
import { formatMinor } from '../util/money';

const CHARGE_TYPES: { value: ChargeType; label: string }[] = [
  { value: 'FIXED', label: 'Fixed amount' },
  { value: 'PERCENTAGE', label: 'Percentage' },
  { value: 'PER_ITEM', label: 'Per item' },
];

// Only what the backend's ChargeAppliesTo enum accepts. An "All" option used
// to be offered here and had no server-side value, so choosing it failed the
// save with a validation error and no explanation.
const APPLIES_TO: { value: ChargeAppliesTo; label: string }[] = [
  { value: 'SUBTOTAL', label: 'Subtotal' },
  { value: 'DELIVERY', label: 'Delivery' },
];

function formatChargeAmount(c: Charge): string {
  if (c.type === 'PERCENTAGE') return `${((c.percentBps ?? 0) / 100).toFixed(2)}%`;
  return `SAR ${formatMinor(c.amountMinor ?? 0)}`;
}

// ---------------------------------------------------------------------------
// Charge form (create / edit)
// ---------------------------------------------------------------------------

interface ChargeFormState {
  name: string;
  nameAr: string;
  type: ChargeType;
  appliesTo: ChargeAppliesTo;
  amountMinor: string;
  percentBps: string;
  taxable: boolean;
  branchIds: string[];
  priority: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  conditions: ChargeConditions;
}

const emptyForm: ChargeFormState = {
  name: '',
  nameAr: '',
  type: 'FIXED',
  appliesTo: 'SUBTOTAL',
  amountMinor: '',
  percentBps: '',
  taxable: true,
  branchIds: [],
  priority: '0',
  startsAt: '',
  endsAt: '',
  isActive: true,
  conditions: {},
};

function chargeToForm(c: Charge): ChargeFormState {
  return {
    name: c.name,
    nameAr: c.nameAr ?? '',
    type: c.type,
    appliesTo: c.appliesTo,
    amountMinor: c.amountMinor != null ? formatMinor(c.amountMinor) : '',
    percentBps: c.percentBps != null ? String(c.percentBps / 100) : '',
    taxable: c.taxable,
    branchIds: c.branchIds ?? [],
    priority: String(c.priority),
    startsAt: c.startsAt ? c.startsAt.slice(0, 10) : '',
    endsAt: c.endsAt ? c.endsAt.slice(0, 10) : '',
    isActive: c.isActive,
    conditions: c.conditions ?? {},
  };
}

function formToInput(f: ChargeFormState): CreateChargeInput {
  const input: CreateChargeInput = {
    name: f.name,
    type: f.type,
    appliesTo: f.appliesTo,
    taxable: f.taxable,
    isActive: f.isActive,
    priority: parseInt(f.priority, 10) || 0,
  };
  if (f.nameAr) input.nameAr = f.nameAr;
  if (f.type === 'PERCENTAGE') {
    input.percentBps = Math.round(parseFloat(f.percentBps || '0') * 100);
  } else {
    input.amountMinor = Math.round(parseFloat(f.amountMinor || '0') * 100);
  }
  if (f.branchIds.length > 0) input.branchIds = f.branchIds;
  if (f.startsAt) input.startsAt = new Date(f.startsAt).toISOString();
  if (f.endsAt) input.endsAt = new Date(f.endsAt).toISOString();
  const cond: ChargeConditions = {};
  if (f.conditions.orderTypes?.length) cond.orderTypes = f.conditions.orderTypes;
  if (f.conditions.minSubtotalMinor != null) cond.minSubtotalMinor = f.conditions.minSubtotalMinor;
  if (f.conditions.maxSubtotalMinor != null) cond.maxSubtotalMinor = f.conditions.maxSubtotalMinor;
  if (f.conditions.paymentMethods?.length) cond.paymentMethods = f.conditions.paymentMethods;
  if (Object.keys(cond).length > 0) input.conditions = cond;
  return input;
}

function ChargeFormModal({
  initial,
  branches,
  onSave,
  onClose,
}: {
  initial: ChargeFormState;
  branches: Branch[];
  onSave: (input: CreateChargeInput) => Promise<void>;
  onClose: () => void;
}): React.JSX.Element {
  const [f, setF] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof ChargeFormState>(key: K, value: ChargeFormState[K]) =>
    setF((prev) => ({ ...prev, [key]: value }));

  const submit = async () => {
    if (!f.name.trim()) { setError('Name is required.'); return; }
    setSaving(true);
    setError(null);
    try {
      await onSave(formToInput(f));
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ maxWidth: 560, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ marginTop: 0 }}>{initial.name ? 'Edit charge' : 'New charge'}</h3>

        <label>
          <span className="muted" style={{ display: 'block', marginBottom: 4 }}>Name (English)*</span>
          <input value={f.name} onChange={(e) => set('name', e.target.value)} />
        </label>
        <label style={{ marginTop: 8, display: 'block' }}>
          <span className="muted" style={{ display: 'block', marginBottom: 4 }}>Name (Arabic)</span>
          <input value={f.nameAr} onChange={(e) => set('nameAr', e.target.value)} dir="rtl" />
        </label>

        <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
          <label style={{ flex: 1 }}>
            <span className="muted" style={{ display: 'block', marginBottom: 4 }}>Type</span>
            <select value={f.type} onChange={(e) => set('type', e.target.value as ChargeType)}>
              {CHARGE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>
          <label style={{ flex: 1 }}>
            <span className="muted" style={{ display: 'block', marginBottom: 4 }}>Applies to</span>
            <select value={f.appliesTo} onChange={(e) => set('appliesTo', e.target.value as ChargeAppliesTo)}>
              {APPLIES_TO.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          </label>
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
          {f.type === 'PERCENTAGE' ? (
            <label style={{ flex: 1 }}>
              <span className="muted" style={{ display: 'block', marginBottom: 4 }}>Percentage (%)</span>
              <input type="number" step="0.01" value={f.percentBps} onChange={(e) => set('percentBps', e.target.value)} />
            </label>
          ) : (
            <label style={{ flex: 1 }}>
              <span className="muted" style={{ display: 'block', marginBottom: 4 }}>Amount (SAR)</span>
              <input type="number" step="0.01" value={f.amountMinor} onChange={(e) => set('amountMinor', e.target.value)} />
            </label>
          )}
          <label style={{ flex: 1 }}>
            <span className="muted" style={{ display: 'block', marginBottom: 4 }}>Priority (lower = first)</span>
            <input type="number" value={f.priority} onChange={(e) => set('priority', e.target.value)} />
          </label>
        </div>

        <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={f.taxable} onChange={(e) => set('taxable', e.target.checked)} />
            Taxable (VAT applies)
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={f.isActive} onChange={(e) => set('isActive', e.target.checked)} />
            Active
          </label>
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
          <label style={{ flex: 1 }}>
            <span className="muted" style={{ display: 'block', marginBottom: 4 }}>Start date</span>
            <input type="date" value={f.startsAt} onChange={(e) => set('startsAt', e.target.value)} />
          </label>
          <label style={{ flex: 1 }}>
            <span className="muted" style={{ display: 'block', marginBottom: 4 }}>End date</span>
            <input type="date" value={f.endsAt} onChange={(e) => set('endsAt', e.target.value)} />
          </label>
        </div>

        {branches.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <span className="muted" style={{ display: 'block', marginBottom: 4 }}>
              Branches (leave empty = all branches)
            </span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {branches.map((b) => (
                <label key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={f.branchIds.includes(b.id)}
                    onChange={(e) => {
                      const ids = e.target.checked
                        ? [...f.branchIds, b.id]
                        : f.branchIds.filter((x) => x !== b.id);
                      set('branchIds', ids);
                    }}
                  />
                  {b.name}
                </label>
              ))}
            </div>
          </div>
        )}

        <details style={{ marginTop: 12 }}>
          <summary className="muted" style={{ cursor: 'pointer' }}>Conditions</summary>
          <div style={{ marginTop: 8 }}>
            <div style={{ display: 'flex', gap: 12 }}>
              <label style={{ flex: 1 }}>
                <span className="muted" style={{ display: 'block', marginBottom: 4 }}>Order types</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  {['DELIVERY', 'PICKUP'].map((ot) => (
                    <label key={ot} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
                      <input
                        type="checkbox"
                        checked={(f.conditions.orderTypes ?? []).includes(ot)}
                        onChange={(e) => {
                          const cur = f.conditions.orderTypes ?? [];
                          const next = e.target.checked ? [...cur, ot] : cur.filter((x) => x !== ot);
                          set('conditions', { ...f.conditions, orderTypes: next.length ? next : undefined });
                        }}
                      />
                      {ot}
                    </label>
                  ))}
                </div>
              </label>
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
              <label style={{ flex: 1 }}>
                <span className="muted" style={{ display: 'block', marginBottom: 4 }}>Min subtotal (SAR)</span>
                <input
                  type="number"
                  step="0.01"
                  value={f.conditions.minSubtotalMinor != null ? formatMinor(f.conditions.minSubtotalMinor) : ''}
                  onChange={(e) => {
                    const v = e.target.value ? Math.round(parseFloat(e.target.value) * 100) : undefined;
                    set('conditions', { ...f.conditions, minSubtotalMinor: v });
                  }}
                />
              </label>
              <label style={{ flex: 1 }}>
                <span className="muted" style={{ display: 'block', marginBottom: 4 }}>Max subtotal (SAR)</span>
                <input
                  type="number"
                  step="0.01"
                  value={f.conditions.maxSubtotalMinor != null ? formatMinor(f.conditions.maxSubtotalMinor) : ''}
                  onChange={(e) => {
                    const v = e.target.value ? Math.round(parseFloat(e.target.value) * 100) : undefined;
                    set('conditions', { ...f.conditions, maxSubtotalMinor: v });
                  }}
                />
              </label>
            </div>
            <div style={{ marginTop: 8 }}>
              <span className="muted" style={{ display: 'block', marginBottom: 4 }}>Payment methods</span>
              <div style={{ display: 'flex', gap: 8 }}>
                {['ONLINE', 'CASH_ON_DELIVERY', 'CASH'].map((pm) => (
                  <label key={pm} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={(f.conditions.paymentMethods ?? []).includes(pm)}
                      onChange={(e) => {
                        const cur = f.conditions.paymentMethods ?? [];
                        const next = e.target.checked ? [...cur, pm] : cur.filter((x) => x !== pm);
                        set('conditions', { ...f.conditions, paymentMethods: next.length ? next : undefined });
                      }}
                    />
                    {pm.replace(/_/g, ' ')}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </details>

        {error && <p style={{ color: 'var(--danger)', marginTop: 8 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="btn" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function PricingPage(): React.JSX.Element {
  const { api } = useAuth();
  const charges = useAsync(() => api.listCharges(), []);
  const branches = useAsync(() => api.branches(), []);
  const [modal, setModal] = useState<{ mode: 'create' } | { mode: 'edit'; charge: Charge } | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all');

  const branchList = branches.data ?? [];

  const filtered = (charges.data ?? []).filter((c) => {
    if (filter === 'active') return c.isActive;
    if (filter === 'inactive') return !c.isActive;
    return true;
  });

  const handleSave = async (input: CreateChargeInput): Promise<void> => {
    if (modal?.mode === 'edit') {
      await api.updateCharge(modal.charge.id, input);
    } else {
      await api.createCharge(input);
    }
    charges.reload();
  };

  const toggleActive = async (c: Charge): Promise<void> => {
    await api.updateCharge(c.id, { isActive: !c.isActive });
    charges.reload();
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <h2 style={{ margin: 0, flex: 1 }}>Pricing &amp; Charges</h2>
        <button className="btn btn-primary" onClick={() => setModal({ mode: 'create' })}>
          + New charge
        </button>
      </div>

      {/* Delivery fee per branch */}
      <div className="card" style={{ maxWidth: 600, marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>Delivery fees (per branch)</h3>
        <p className="muted" style={{ margin: '0 0 8px', fontSize: 13 }}>
          Base delivery fee and minimum order are set per branch in Branch Settings.
        </p>
        {branchList.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {branchList.map((b, i) => (
              <span key={b.id} style={{ fontSize: 13 }}>
                <strong>{b.name}</strong>: SAR {formatMinor(b.deliveryFeeMinor)} (min SAR {formatMinor(b.minOrderMinor)})
                {i < branchList.length - 1 && ' · '}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* VAT summary */}
      <div className="card" style={{ maxWidth: 600, marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>VAT</h3>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Rate: <strong>15%</strong> (VAT-inclusive pricing). Configured in backend VatService.
          Discounts reduce the taxable base; VAT is calculated per line then summed.
          The rate is snapshotted onto every order.
        </p>
      </div>

      {/* Custom charges table */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <h3 style={{ margin: 0, flex: 1 }}>Custom charges</h3>
          <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} style={{ width: 140 }}>
            <option value="all">All</option>
            <option value="active">Active only</option>
            <option value="inactive">Inactive only</option>
          </select>
        </div>

        <DataState loading={charges.loading} error={charges.error?.message ?? null} onRetry={charges.reload}>
          {filtered.length === 0 ? (
            <p className="muted">No charges configured yet.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ textAlign: 'left', padding: '6px 8px' }}>Name</th>
                    <th style={{ textAlign: 'left', padding: '6px 8px' }}>Type</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px' }}>Amount</th>
                    <th style={{ textAlign: 'left', padding: '6px 8px' }}>Applies to</th>
                    <th style={{ textAlign: 'center', padding: '6px 8px' }}>Taxable</th>
                    <th style={{ textAlign: 'left', padding: '6px 8px' }}>Branches</th>
                    <th style={{ textAlign: 'center', padding: '6px 8px' }}>Status</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => (
                    <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '6px 8px' }}>
                        {c.name}
                        {c.nameAr && <span className="muted" style={{ fontSize: 11, marginLeft: 4 }}>({c.nameAr})</span>}
                      </td>
                      <td style={{ padding: '6px 8px' }}>{c.type.replace(/_/g, ' ')}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right' }}>{formatChargeAmount(c)}</td>
                      <td style={{ padding: '6px 8px' }}>{c.appliesTo}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'center' }}>{c.taxable ? 'Yes' : 'No'}</td>
                      <td style={{ padding: '6px 8px' }}>
                        {c.branchIds
                          ? c.branchIds.map((id) => branchList.find((b) => b.id === id)?.name ?? id.slice(0, 8)).join(', ')
                          : 'All'}
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                        <StatusChip label={c.isActive ? 'Active' : 'Inactive'} tone={c.isActive ? 'success' : 'neutral'} />
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                        <button
                          className="btn btn-sm"
                          style={{ marginRight: 4 }}
                          onClick={() => setModal({ mode: 'edit', charge: c })}
                        >
                          Edit
                        </button>
                        <button className="btn btn-sm" onClick={() => toggleActive(c)}>
                          {c.isActive ? 'Disable' : 'Enable'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DataState>
      </div>

      {modal && (
        <ChargeFormModal
          initial={modal.mode === 'edit' ? chargeToForm(modal.charge) : emptyForm}
          branches={branchList}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
