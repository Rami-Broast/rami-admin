import React, { useState } from 'react';

import { ImageField } from '../components/ImageField';

import type { Banner, BannerAction, CreateBannerInput } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { DataState, StatusChip } from '../components/ui';
import { useAsync } from '../hooks/useAsync';

const ACTION_OPTIONS: { value: BannerAction; label: string }[] = [
  { value: 'NONE', label: 'No action' },
  { value: 'PRODUCT', label: 'Open product' },
  { value: 'CATEGORY', label: 'Open category' },
  { value: 'BRANCH', label: 'Open branch' },
  { value: 'OFFERS', label: 'Offers page' },
  { value: 'EXTERNAL_URL', label: 'External URL' },
];

// ---------------------------------------------------------------------------
// Banner form modal
// ---------------------------------------------------------------------------

interface BannerFormState {
  name: string;
  imageUrl: string;
  imageUrlAr: string;
  title: string;
  titleAr: string;
  description: string;
  descriptionAr: string;
  buttonText: string;
  buttonTextAr: string;
  action: BannerAction;
  targetId: string;
  targetUrl: string;
  priority: string;
  startsAt: string;
  endsAt: string;
}

const emptyForm: BannerFormState = {
  name: '', imageUrl: '', imageUrlAr: '', title: '', titleAr: '',
  description: '', descriptionAr: '', buttonText: '', buttonTextAr: '',
  action: 'NONE', targetId: '', targetUrl: '', priority: '0',
  startsAt: '', endsAt: '',
};

function bannerToForm(b: Banner): BannerFormState {
  return {
    name: b.name,
    imageUrl: b.imageUrl,
    imageUrlAr: b.imageUrlAr ?? '',
    title: b.title,
    titleAr: b.titleAr ?? '',
    description: b.description ?? '',
    descriptionAr: b.descriptionAr ?? '',
    buttonText: b.buttonText ?? '',
    buttonTextAr: b.buttonTextAr ?? '',
    action: b.action,
    targetId: b.targetId ?? '',
    targetUrl: b.targetUrl ?? '',
    priority: String(b.priority),
    startsAt: b.startsAt ? b.startsAt.slice(0, 10) : '',
    endsAt: b.endsAt ? b.endsAt.slice(0, 10) : '',
  };
}

function formToInput(f: BannerFormState): CreateBannerInput {
  const input: CreateBannerInput = {
    name: f.name,
    imageUrl: f.imageUrl,
    title: f.title,
    priority: parseInt(f.priority, 10) || 0,
  };
  if (f.imageUrlAr) input.imageUrlAr = f.imageUrlAr;
  if (f.titleAr) input.titleAr = f.titleAr;
  if (f.description) input.description = f.description;
  if (f.descriptionAr) input.descriptionAr = f.descriptionAr;
  if (f.buttonText) input.buttonText = f.buttonText;
  if (f.buttonTextAr) input.buttonTextAr = f.buttonTextAr;
  if (f.action !== 'NONE') input.action = f.action;
  if (f.targetId) input.targetId = f.targetId;
  if (f.targetUrl) input.targetUrl = f.targetUrl;
  if (f.startsAt) input.startsAt = new Date(f.startsAt).toISOString();
  if (f.endsAt) input.endsAt = new Date(f.endsAt).toISOString();
  return input;
}

function BannerFormModal({
  initial,
  onSave,
  onClose,
}: {
  initial: BannerFormState;
  onSave: (input: CreateBannerInput) => Promise<void>;
  onClose: () => void;
}): React.JSX.Element {
  const [f, setF] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof BannerFormState>(key: K, value: BannerFormState[K]) =>
    setF((prev) => ({ ...prev, [key]: value }));

  const submit = async () => {
    if (!f.name.trim() || !f.title.trim() || !f.imageUrl.trim()) {
      setError('Name, title and image URL are required.');
      return;
    }
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
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={onClose}
    >
      <div className="card" style={{ maxWidth: 600, width: '100%', maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>{initial.name ? 'Edit banner' : 'New banner'}</h3>

        <label>
          <span className="muted" style={{ display: 'block', marginBottom: 4 }}>Name*</span>
          <input value={f.name} onChange={(e) => set('name', e.target.value)} />
        </label>

        <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
          <label style={{ flex: 1 }}>
            <span className="muted" style={{ display: 'block', marginBottom: 4 }}>Title (English)*</span>
            <input value={f.title} onChange={(e) => set('title', e.target.value)} />
          </label>
          <label style={{ flex: 1 }}>
            <span className="muted" style={{ display: 'block', marginBottom: 4 }}>Title (Arabic)</span>
            <input value={f.titleAr} onChange={(e) => set('titleAr', e.target.value)} dir="rtl" />
          </label>
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 280px' }}>
            <ImageField
              label="Banner image *"
              value={f.imageUrl}
              onChange={(v) => set('imageUrl', v)}
            />
          </div>
          <div style={{ flex: '1 1 280px' }}>
            <ImageField
              label="Banner image (Arabic)"
              value={f.imageUrlAr}
              onChange={(v) => set('imageUrlAr', v)}
              hint="Optional. Used when the customer app is in Arabic."
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
          <label style={{ flex: 1 }}>
            <span className="muted" style={{ display: 'block', marginBottom: 4 }}>Description</span>
            <textarea rows={2} value={f.description} onChange={(e) => set('description', e.target.value)} />
          </label>
          <label style={{ flex: 1 }}>
            <span className="muted" style={{ display: 'block', marginBottom: 4 }}>Description (Arabic)</span>
            <textarea rows={2} value={f.descriptionAr} onChange={(e) => set('descriptionAr', e.target.value)} dir="rtl" />
          </label>
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
          <label style={{ flex: 1 }}>
            <span className="muted" style={{ display: 'block', marginBottom: 4 }}>Button text</span>
            <input value={f.buttonText} onChange={(e) => set('buttonText', e.target.value)} />
          </label>
          <label style={{ flex: 1 }}>
            <span className="muted" style={{ display: 'block', marginBottom: 4 }}>Button text (Arabic)</span>
            <input value={f.buttonTextAr} onChange={(e) => set('buttonTextAr', e.target.value)} dir="rtl" />
          </label>
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
          <label style={{ flex: 1 }}>
            <span className="muted" style={{ display: 'block', marginBottom: 4 }}>Action</span>
            <select value={f.action} onChange={(e) => set('action', e.target.value as BannerAction)}>
              {ACTION_OPTIONS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          </label>
          {(f.action === 'PRODUCT' || f.action === 'CATEGORY' || f.action === 'BRANCH') && (
            <label style={{ flex: 1 }}>
              <span className="muted" style={{ display: 'block', marginBottom: 4 }}>Target ID</span>
              <input value={f.targetId} onChange={(e) => set('targetId', e.target.value)} placeholder="UUID" />
            </label>
          )}
          {f.action === 'EXTERNAL_URL' && (
            <label style={{ flex: 1 }}>
              <span className="muted" style={{ display: 'block', marginBottom: 4 }}>Target URL</span>
              <input value={f.targetUrl} onChange={(e) => set('targetUrl', e.target.value)} placeholder="https://..." />
            </label>
          )}
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
          <label style={{ flex: 1 }}>
            <span className="muted" style={{ display: 'block', marginBottom: 4 }}>Priority (lower = first)</span>
            <input type="number" value={f.priority} onChange={(e) => set('priority', e.target.value)} />
          </label>
          <label style={{ flex: 1 }}>
            <span className="muted" style={{ display: 'block', marginBottom: 4 }}>Start date</span>
            <input type="date" value={f.startsAt} onChange={(e) => set('startsAt', e.target.value)} />
          </label>
          <label style={{ flex: 1 }}>
            <span className="muted" style={{ display: 'block', marginBottom: 4 }}>End date</span>
            <input type="date" value={f.endsAt} onChange={(e) => set('endsAt', e.target.value)} />
          </label>
        </div>

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

export function BannersPage(): React.JSX.Element {
  const { api } = useAuth();
  const banners = useAsync(() => api.listBanners(), []);
  const [modal, setModal] = useState<{ mode: 'create' } | { mode: 'edit'; banner: Banner } | null>(null);
  const [filter, setFilter] = useState<'all' | 'published' | 'draft'>('all');

  const filtered = (banners.data ?? []).filter((b) => {
    if (filter === 'published') return b.isActive;
    if (filter === 'draft') return !b.isActive;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => a.priority - b.priority);

  const handleSave = async (input: CreateBannerInput): Promise<void> => {
    if (modal?.mode === 'edit') {
      await api.updateBanner(modal.banner.id, input);
    } else {
      await api.createBanner(input);
    }
    banners.reload();
  };

  const togglePublish = async (b: Banner): Promise<void> => {
    if (b.isActive) {
      await api.unpublishBanner(b.id);
    } else {
      await api.publishBanner(b.id);
    }
    banners.reload();
  };

  const remove = async (b: Banner): Promise<void> => {
    await api.deleteBanner(b.id);
    banners.reload();
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <h2 style={{ margin: 0, flex: 1 }}>Banners</h2>
        <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} style={{ width: 140 }}>
          <option value="all">All</option>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
        </select>
        <button className="btn btn-primary" onClick={() => setModal({ mode: 'create' })}>
          + New banner
        </button>
      </div>

      <DataState loading={banners.loading} error={banners.error?.message ?? null} onRetry={banners.reload}>
        {sorted.length === 0 ? (
          <div className="card" style={{ maxWidth: 520, textAlign: 'center' }}>
            <p className="muted">No banners yet.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {sorted.map((b) => (
              <div key={b.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ height: 120, background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  {b.imageUrl ? (
                    <img
                      src={b.imageUrl}
                      alt={b.title}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  ) : (
                    <span className="muted">No image</span>
                  )}
                </div>
                <div style={{ padding: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <strong style={{ flex: 1, fontSize: 14 }}>{b.title}</strong>
                    <StatusChip label={b.isActive ? 'Published' : 'Draft'} tone={b.isActive ? 'success' : 'neutral'} />
                  </div>
                  <p className="muted" style={{ margin: '0 0 4px', fontSize: 12 }}>
                    {b.name} &middot; Priority {b.priority}
                    {b.action !== 'NONE' && ` · ${b.action}`}
                  </p>
                  {b.startsAt && (
                    <p className="muted" style={{ margin: '0 0 4px', fontSize: 11 }}>
                      {b.startsAt.slice(0, 10)} &rarr; {b.endsAt ? b.endsAt.slice(0, 10) : 'ongoing'}
                    </p>
                  )}
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <button className="btn btn-sm" onClick={() => setModal({ mode: 'edit', banner: b })}>Edit</button>
                    <button className="btn btn-sm" onClick={() => togglePublish(b)}>
                      {b.isActive ? 'Unpublish' : 'Publish'}
                    </button>
                    <button className="btn btn-sm" style={{ color: 'var(--danger)' }} onClick={() => remove(b)}>Delete</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </DataState>

      {modal && (
        <BannerFormModal
          initial={modal.mode === 'edit' ? bannerToForm(modal.banner) : emptyForm}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
