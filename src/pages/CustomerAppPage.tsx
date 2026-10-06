import React, { useState } from 'react';

import type { FeatureFlag, HomepageSection, HomepageSectionKind } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { DataState, StatusChip, Toggle } from '../components/ui';
import { useAsync } from '../hooks/useAsync';

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

type Tab = 'features' | 'homepage' | 'branding';

const TABS: { key: Tab; label: string }[] = [
  { key: 'features', label: 'Features' },
  { key: 'homepage', label: 'Homepage' },
  { key: 'branding', label: 'Branding' },
];

// ---------------------------------------------------------------------------
// Features tab
// ---------------------------------------------------------------------------

const FLAG_LABELS: Record<string, string> = {
  online_payment: 'Online payment (Tap)',
  cash: 'Cash on delivery',
  coupons: 'Coupon codes',
  loyalty: 'Loyalty programme',
  reviews: 'Customer reviews',
  scheduled_orders: 'Scheduled orders',
  live_tracking: 'Live delivery tracking',
  referral: 'Referral programme',
  wallet: 'Wallet / credits',
  banners: 'Promotional banners',
  pickup: 'Pickup orders',
  delivery: 'Delivery orders',
};

function FeaturesTab(): React.JSX.Element {
  const { api } = useAuth();
  const flags = useAsync(() => api.listFeatureFlags(), []);
  const [busy, setBusy] = useState<string | null>(null);

  const toggle = async (f: FeatureFlag) => {
    setBusy(f.key);
    try {
      await api.toggleFeatureFlag(f.key, !f.enabled);
      flags.reload();
    } finally {
      setBusy(null);
    }
  };

  return (
    <DataState loading={flags.loading} error={flags.error?.message ?? null} onRetry={flags.reload}>
      <div className="card" style={{ maxWidth: 560 }}>
        <h3 style={{ marginTop: 0 }}>Feature flags</h3>
        <p className="muted" style={{ margin: '0 0 12px', fontSize: 13 }}>
          Toggle features on or off for the customer app. Changes take effect on the next customer app refresh.
        </p>
        {(flags.data ?? []).map((f) => (
          <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ flex: 1 }}>
              <strong style={{ fontSize: 14 }}>{FLAG_LABELS[f.key] ?? f.key}</strong>
              {f.description && <p className="muted" style={{ margin: '2px 0 0', fontSize: 12 }}>{f.description}</p>}
            </div>
            <Toggle
              label=""
              value={f.enabled}
              onChange={() => toggle(f)}
              disabled={busy === f.key}
            />
          </div>
        ))}
        {(flags.data ?? []).length === 0 && <p className="muted">No feature flags configured.</p>}
      </div>
    </DataState>
  );
}

// ---------------------------------------------------------------------------
// Homepage tab
// ---------------------------------------------------------------------------

const SECTION_KINDS: { value: HomepageSectionKind; label: string }[] = [
  { value: 'BANNERS', label: 'Banners' },
  { value: 'CATEGORIES', label: 'Categories' },
  { value: 'FEATURED', label: 'Featured products' },
  { value: 'BESTSELLERS', label: 'Best sellers' },
  { value: 'POPULAR', label: 'Popular' },
  { value: 'OFFERS', label: 'Offers' },
  { value: 'COUPONS', label: 'Coupons' },
  { value: 'LOYALTY', label: 'Loyalty' },
  { value: 'RECOMMENDED', label: 'Recommended' },
  { value: 'CUSTOM', label: 'Custom' },
];

function HomepageTab(): React.JSX.Element {
  const { api } = useAuth();
  const sections = useAsync(() => api.listHomepageSections(), []);
  const [busy, setBusy] = useState(false);
  const [addKind, setAddKind] = useState<HomepageSectionKind>('FEATURED');

  const sorted = [...(sections.data ?? [])].sort((a, b) => a.position - b.position);

  const toggleSection = async (s: HomepageSection) => {
    setBusy(true);
    try {
      await api.upsertHomepageSection({ kind: s.kind, enabled: !s.enabled });
      sections.reload();
    } finally {
      setBusy(false);
    }
  };

  const swap = (arr: string[], a: number, b: number) => {
    const tmp = arr[a]!; arr[a] = arr[b]!; arr[b] = tmp;
  };

  const moveUp = async (idx: number) => {
    if (idx === 0) return;
    const ids = sorted.map((s) => s.id);
    swap(ids, idx - 1, idx);
    setBusy(true);
    try {
      await api.reorderHomepageSections(ids);
      sections.reload();
    } finally {
      setBusy(false);
    }
  };

  const moveDown = async (idx: number) => {
    if (idx >= sorted.length - 1) return;
    const ids = sorted.map((s) => s.id);
    swap(ids, idx, idx + 1);
    setBusy(true);
    try {
      await api.reorderHomepageSections(ids);
      sections.reload();
    } finally {
      setBusy(false);
    }
  };

  const removeSection = async (id: string) => {
    setBusy(true);
    try {
      await api.deleteHomepageSection(id);
      sections.reload();
    } finally {
      setBusy(false);
    }
  };

  const addSection = async () => {
    setBusy(true);
    try {
      await api.upsertHomepageSection({
        kind: addKind,
        enabled: true,
        position: sorted.length,
      });
      sections.reload();
    } finally {
      setBusy(false);
    }
  };

  const existingKinds = new Set(sorted.map((s) => s.kind));
  const availableKinds = SECTION_KINDS.filter((k) => !existingKinds.has(k.value));

  return (
    <DataState loading={sections.loading} error={sections.error?.message ?? null} onRetry={sections.reload}>
      <div className="card" style={{ maxWidth: 600 }}>
        <h3 style={{ marginTop: 0 }}>Homepage sections</h3>
        <p className="muted" style={{ margin: '0 0 12px', fontSize: 13 }}>
          Arrange the sections customers see on the home screen. Toggle each on/off and reorder with the arrows.
        </p>

        {sorted.length === 0 && <p className="muted">No sections configured yet.</p>}
        {sorted.map((s, i) => {
          const label = SECTION_KINDS.find((k) => k.value === s.kind)?.label ?? s.kind;
          return (
            <div
              key={s.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 0', borderBottom: '1px solid var(--border)',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <button className="btn btn-sm" disabled={busy || i === 0} onClick={() => moveUp(i)} style={{ padding: '0 4px', lineHeight: 1 }}>
                  &#9650;
                </button>
                <button className="btn btn-sm" disabled={busy || i === sorted.length - 1} onClick={() => moveDown(i)} style={{ padding: '0 4px', lineHeight: 1 }}>
                  &#9660;
                </button>
              </div>
              <div style={{ flex: 1 }}>
                <strong>{label}</strong>
                {s.title && <span className="muted" style={{ marginLeft: 6, fontSize: 12 }}>&quot;{s.title}&quot;</span>}
              </div>
              <StatusChip label={s.enabled ? 'On' : 'Off'} tone={s.enabled ? 'success' : 'neutral'} />
              <Toggle label="" value={s.enabled} onChange={() => toggleSection(s)} disabled={busy} />
              <button className="btn btn-sm" disabled={busy} onClick={() => removeSection(s.id)} style={{ color: 'var(--danger)' }}>
                Remove
              </button>
            </div>
          );
        })}

        {availableKinds.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
            <select
              value={addKind}
              onChange={(e) => setAddKind(e.target.value as HomepageSectionKind)}
              style={{ flex: 1 }}
            >
              {availableKinds.map((k) => (
                <option key={k.value} value={k.value}>{k.label}</option>
              ))}
            </select>
            <button className="btn btn-primary" disabled={busy} onClick={addSection}>
              Add section
            </button>
          </div>
        )}
      </div>
    </DataState>
  );
}

// ---------------------------------------------------------------------------
// Branding tab (placeholder — no branding model yet)
// ---------------------------------------------------------------------------

function BrandingTab(): React.JSX.Element {
  return (
    <div className="card" style={{ maxWidth: 560 }}>
      <h3 style={{ marginTop: 0 }}>Branding</h3>
      <p className="muted" style={{ margin: 0 }}>
        Brand customisation (logo, colours, button styles) will be available once the branding
        configuration endpoint is connected. The customer app currently uses the default theme
        tokens defined in its design system.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function CustomerAppPage(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('features');

  return (
    <div>
      <h2 style={{ marginBottom: 16 }}>Customer App</h2>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            className={tab === t.key ? 'btn btn-primary' : 'btn'}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'features' && <FeaturesTab />}
      {tab === 'homepage' && <HomepageTab />}
      {tab === 'branding' && <BrandingTab />}
    </div>
  );
}
