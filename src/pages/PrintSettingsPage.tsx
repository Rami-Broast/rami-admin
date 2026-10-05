import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from '../auth/AuthProvider';
import { DataState, Toggle } from '../components/ui';
import {
  BRANCH_OVERRIDABLE_KEYS,
  BranchDocketOverride,
  DEFAULT_DOCKET_TEMPLATE,
  DocketSectionId,
  DocketTemplate,
  buildDocket,
} from '../print/docket/docket';
import { ImageField } from '../components/ImageField';
import { resolveImageUrl } from '../util/imageUrl';
import { prepareLogo } from '../print/docket/logo';
import { sampleDocketOrder } from '../print/docket/sample';
import { Branch } from '../api/types';

/**
 * The customer docket's template — the receipt the Branch POS prints and hands
 * to the customer with their food.
 *
 * This tab used to be a placeholder saying printer integration was blocked on
 * hardware. It still is, and the **printer picker stays in `kitchen-pos`**,
 * which runs on the machine the printer hangs off. What lives here is the
 * thing the hardware is not needed for and the owner is: the layout.
 *
 * The preview is not an illustration. It calls the same `buildDocket` the POS
 * calls, on a deliberately awkward sample order, so what is on screen is
 * character-for-character what comes off the roll — including the wrapping,
 * which is where a well-meaning edit actually goes wrong. Nothing here writes
 * to the server until Save is pressed, for the same reason the delivery
 * pricing editor waits: this is a document printed on every order after it,
 * and being sure matters more than saving a click.
 */

const SECTION_LABELS: Record<DocketSectionId, string> = {
  logo: 'Logo',
  brand: 'Restaurant name',
  orderType: 'Delivery / Pick up',
  orderMeta: 'Order number and time',
  customer: 'Customer',
  readyTime: 'Ready time',
  items: 'Items',
  totals: 'Totals',
  reference: 'Reference number',
  thankYou: 'Thank-you and footer',
};

const ALL_SECTIONS = Object.keys(SECTION_LABELS) as DocketSectionId[];

function lines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
}

/** A preview of exactly what the printer will produce, at a real roll width. */
function DocketPreview({ template }: { template: DocketTemplate }): React.JSX.Element {
  const [width, setWidth] = useState(42);
  const order = useMemo(() => sampleDocketOrder(), []);
  const text = useMemo(() => buildDocket(order, width, template), [order, width, template]);
  // The logo is an image, so the text builder cannot express it — the printing
  // path sends it as its own job. The preview has to put it back, in the place
  // the printer puts it, or the owner is previewing a document with a hole in
  // it exactly where their brand goes.
  const showLogo = template.printLogoImage && template.sections.includes('logo');
  const logoSrc = template.logoImageUrl?.trim()
    ? (resolveImageUrl(template.logoImageUrl) ?? '/logo.jpeg')
    : '/logo.jpeg';
  const [logoDots, setLogoDots] = useState<string | null>(null);

  // Prepared by the same code the POS prepares it with, at this roll's dot
  // width. What the owner sees is the thresholded, one-ink wordmark — which is
  // how they find out that a tagline or a thin outline does not survive, here
  // rather than on the first receipt of the morning.
  useEffect(() => {
    let cancelled = false;
    if (!showLogo) {
      setLogoDots(null);
      return;
    }
    void prepareLogo(logoSrc, width === 32 ? 58 : 80, template.logoWidthPercent).then((prepared) => {
      if (!cancelled) {
        setLogoDots(prepared);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [logoSrc, showLogo, width, template.logoWidthPercent]);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <strong style={{ fontSize: 13 }}>Preview</strong>
        {[
          { w: 42, label: '80mm' },
          { w: 32, label: '58mm' },
        ].map(({ w, label }) => (
          <button
            key={w}
            type="button"
            className={width === w ? 'btn' : 'btn ghost'}
            style={{ padding: '4px 10px', fontSize: 12 }}
            aria-pressed={width === w}
            onClick={() => setWidth(w)}
          >
            {label}
          </button>
        ))}
        <span className="muted" style={{ fontSize: 12 }}>
          A sample order — a first-time customer, a stacked promotion and coupon, a note.
        </span>
      </div>
      {showLogo ? (
        <div
          style={{
            background: '#fff',
            border: '1px solid var(--border)',
            borderBottom: 'none',
            borderRadius: '4px 4px 0 0',
            padding: '14px 12px 0',
            textAlign: 'center',
          }}
        >
          <img
            src={logoDots ? `data:image/png;base64,${logoDots}` : logoSrc}
            alt="The logo as it will print"
            // Half of the roll's own dot width, so the logo occupies the same
            // share of the paper here as it will on the receipt — a preview
            // that showed every size at the same width would answer nothing.
            style={{
              width: ((width === 32 ? 384 : 576) * (template.logoWidthPercent ?? 100)) / 200,
              maxWidth: '100%',
              imageRendering: 'pixelated',
            }}
          />
        </div>
      ) : null}
      <pre
        aria-label="Docket preview"
        style={{
          background: '#fff',
          color: '#111',
          border: '1px solid var(--border)',
          borderRadius: showLogo ? '0 0 4px 4px' : 4,
          borderTop: showLogo ? 'none' : undefined,
          padding: showLogo ? '4px 12px 14px' : '14px 12px',
          margin: 0,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
          fontSize: 12.5,
          lineHeight: 1.45,
          whiteSpace: 'pre',
          overflowX: 'auto',
        }}
      >
        {text}
      </pre>
    </div>
  );
}

/** Save / Discard, and the three states that "nothing happened" used to cover. */
function SaveBar({
  label,
  dirty,
  saved,
  error,
  onSave,
  onDiscard,
  saving,
}: {
  /** Named, not just "Save": there are two of these on the page, and which one
   *  an owner is pressing is the difference between changing every branch's
   *  receipt and changing one. */
  label: string;
  dirty: boolean;
  saved: boolean;
  error: string | null;
  onSave: () => void;
  onDiscard: () => void;
  saving: boolean;
}): React.JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
      <button type="button" className="btn" onClick={onSave} disabled={!dirty || saving}>
        {saving ? 'Saving…' : label}
      </button>
      <button type="button" className="btn ghost" onClick={onDiscard} disabled={!dirty || saving}>
        Discard
      </button>
      {error ? (
        <span role="alert" style={{ color: 'var(--danger)', fontSize: 13 }}>
          Not saved — {error}
        </span>
      ) : dirty ? (
        <span className="muted" style={{ fontSize: 13 }}>
          Unsaved changes
        </span>
      ) : saved ? (
        <span style={{ color: 'var(--success)', fontSize: 13 }}>Saved.</span>
      ) : null}
    </div>
  );
}

function SectionOrder({
  template,
  onChange,
}: {
  template: DocketTemplate;
  onChange: (sections: DocketSectionId[]) => void;
}): React.JSX.Element {
  const chosen = template.sections;
  // Sections that are switched off still have to be listed, or there is no way
  // to switch one back on.
  const ordered = [...chosen, ...ALL_SECTIONS.filter((id) => !chosen.includes(id))];

  const move = (id: DocketSectionId, by: number): void => {
    const index = chosen.indexOf(id);
    if (index < 0) return;
    const next = [...chosen];
    const target = index + by;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target] as DocketSectionId, next[index] as DocketSectionId];
    onChange(next);
  };

  const toggle = (id: DocketSectionId): void => {
    onChange(
      chosen.includes(id)
        ? chosen.filter((s) => s !== id)
        : // Switched back on where it sits in the canonical order, rather than
          // at the end: an owner ticking "Logo" means the logo, not a logo
          // printed under the total.
          ALL_SECTIONS.filter((s) => s === id || chosen.includes(s)),
    );
  };

  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {ordered.map((id) => {
        const on = chosen.includes(id);
        const position = chosen.indexOf(id);
        return (
          <li
            key={id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 0',
              borderBottom: '1px solid var(--border)',
              opacity: on ? 1 : 0.55,
            }}
          >
            <input
              type="checkbox"
              checked={on}
              onChange={() => toggle(id)}
              aria-label={`Print ${SECTION_LABELS[id]}`}
            />
            <span style={{ flex: 1 }}>{SECTION_LABELS[id]}</span>
            {/* Arrows rather than dragging: this is a settings form somebody
                may be using with a keyboard on a counter machine, and a drag
                target is the one control that has no keyboard equivalent. */}
            <button
              type="button"
              className="btn ghost"
              style={{ padding: '2px 8px' }}
              disabled={!on || position <= 0}
              aria-label={`Move ${SECTION_LABELS[id]} up`}
              onClick={() => move(id, -1)}
            >
              ↑
            </button>
            <button
              type="button"
              className="btn ghost"
              style={{ padding: '2px 8px' }}
              disabled={!on || position < 0 || position >= chosen.length - 1}
              aria-label={`Move ${SECTION_LABELS[id]} down`}
              onClick={() => move(id, 1)}
            >
              ↓
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function LinesField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string[];
  onChange: (next: string[]) => void;
}): React.JSX.Element {
  return (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <span style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>{label}</span>
      {hint ? (
        <span className="muted" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>
          {hint}
        </span>
      ) : null}
      <textarea
        className="input"
        aria-label={label}
        rows={Math.max(2, value.length + 1)}
        value={value.join('\n')}
        onChange={(e) => onChange(lines(e.target.value))}
        style={{ width: '100%', fontFamily: 'ui-monospace, monospace', fontSize: 13 }}
      />
    </label>
  );
}

function MinutesField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
}): React.JSX.Element {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)' }}>{label}</span>
      <input
        className="input"
        type="number"
        min={0}
        value={value}
        onChange={(e) => {
          const parsed = Number(e.target.value);
          // A half-typed box must never set a timing to nothing: an unreadable
          // value keeps what is there rather than becoming zero.
          if (Number.isFinite(parsed) && parsed >= 0) {
            onChange(Math.round(parsed));
          }
        }}
        style={{ width: 90 }}
      />
    </label>
  );
}

function ReadyTimeFields({
  rules,
  onChange,
}: {
  rules: DocketTemplate['readyTimeRules'];
  onChange: (next: DocketTemplate['readyTimeRules']) => void;
}): React.JSX.Element {
  return (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
      <MinutesField
        label="Large order above (SAR)"
        value={Math.round(rules.largeOrderThresholdMinor / 100)}
        onChange={(v) => onChange({ ...rules, largeOrderThresholdMinor: v * 100 })}
      />
      <MinutesField
        label="Small order from"
        value={rules.smallOrderMinutes[0]}
        onChange={(v) => onChange({ ...rules, smallOrderMinutes: [v, rules.smallOrderMinutes[1]] })}
      />
      <MinutesField
        label="to"
        value={rules.smallOrderMinutes[1]}
        onChange={(v) => onChange({ ...rules, smallOrderMinutes: [rules.smallOrderMinutes[0], v] })}
      />
      <MinutesField
        label="Large order from"
        value={rules.largeOrderMinutes[0]}
        onChange={(v) => onChange({ ...rules, largeOrderMinutes: [v, rules.largeOrderMinutes[1]] })}
      />
      <MinutesField
        label="to"
        value={rules.largeOrderMinutes[1]}
        onChange={(v) => onChange({ ...rules, largeOrderMinutes: [rules.largeOrderMinutes[0], v] })}
      />
      <MinutesField
        label="Delivery adds"
        value={rules.deliveryExtraMinutes}
        onChange={(v) => onChange({ ...rules, deliveryExtraMinutes: v })}
      />
    </div>
  );
}

/** Fills in any key a template saved by an older editor does not carry. */
export function withTemplateDefaults(stored: unknown): DocketTemplate {
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) {
    return DEFAULT_DOCKET_TEMPLATE;
  }
  const source = stored as Partial<DocketTemplate>;
  return {
    ...DEFAULT_DOCKET_TEMPLATE,
    ...source,
    readyTimeRules: { ...DEFAULT_DOCKET_TEMPLATE.readyTimeRules, ...(source.readyTimeRules ?? {}) },
  };
}

export function PrintSettingsPage(): React.JSX.Element {
  const { api, isOwner } = useAuth();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [stored, setStored] = useState<DocketTemplate>(DEFAULT_DOCKET_TEMPLATE);
  const [draft, setDraft] = useState<DocketTemplate>(DEFAULT_DOCKET_TEMPLATE);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [branchStored, setBranchStored] = useState<BranchDocketOverride>({});
  const [branchDraft, setBranchDraft] = useState<BranchDocketOverride>({});
  const [branchResolved, setBranchResolved] = useState<DocketTemplate | null>(null);
  const [branchSaving, setBranchSaving] = useState(false);
  const [branchSaved, setBranchSaved] = useState(false);
  const [branchError, setBranchError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [template, list] = await Promise.all([api.receiptTemplateDefault(), api.branches()]);
      const resolved = withTemplateDefaults(template?.template);
      setStored(resolved);
      setDraft(resolved);
      setBranches(list ?? []);
      // The first branch in the list, like every other branch-scoped page: a
      // page that silently edits whichever branch happens to be first is how
      // an owner changes a value and sees no effect on the branch they meant.
      setBranchId((current) => current ?? list?.[0]?.id ?? null);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load the template.');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!branchId) {
      return;
    }
    let cancelled = false;
    api
      .receiptTemplateForBranch(branchId)
      .then((result) => {
        if (cancelled) return;
        setBranchStored(result?.override ?? {});
        setBranchDraft(result?.override ?? {});
        setBranchResolved(result ? withTemplateDefaults(result.resolved) : null);
      })
      .catch(() => {
        if (!cancelled) {
          setBranchResolved(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [api, branchId]);

  const dirty = useMemo(() => JSON.stringify(stored) !== JSON.stringify(draft), [stored, draft]);
  const branchDirty = useMemo(
    () => JSON.stringify(branchStored) !== JSON.stringify(branchDraft),
    [branchStored, branchDraft],
  );

  const save = async (): Promise<void> => {
    setSaving(true);
    setSaveError(null);
    try {
      const result = await api.saveReceiptTemplateDefault(draft);
      const applied = withTemplateDefaults(result ?? draft);
      setStored(applied);
      setDraft(applied);
      setSaved(true);
    } catch (e) {
      // The draft is left exactly as typed: a refusal must not also lose the
      // owner's edit, and the server still holds the old template either way.
      setSaveError(e instanceof Error ? e.message : 'the server refused it.');
      setSaved(false);
    } finally {
      setSaving(false);
    }
  };

  const saveBranch = async (): Promise<void> => {
    if (!branchId) return;
    setBranchSaving(true);
    setBranchError(null);
    try {
      const resolved = await api.saveReceiptTemplateForBranch(branchId, branchDraft);
      setBranchStored(branchDraft);
      setBranchResolved(withTemplateDefaults(resolved ?? null));
      setBranchSaved(true);
    } catch (e) {
      setBranchError(e instanceof Error ? e.message : 'the server refused it.');
      setBranchSaved(false);
    } finally {
      setBranchSaving(false);
    }
  };

  const clearBranch = async (): Promise<void> => {
    if (!branchId) return;
    setBranchSaving(true);
    setBranchError(null);
    try {
      const resolved = await api.clearReceiptTemplateForBranch(branchId);
      setBranchStored({});
      setBranchDraft({});
      setBranchResolved(withTemplateDefaults(resolved ?? null));
      setBranchSaved(true);
    } catch (e) {
      setBranchError(e instanceof Error ? e.message : 'the server refused it.');
    } finally {
      setBranchSaving(false);
    }
  };

  const branchPreview = useMemo<DocketTemplate>(() => {
    const base = branchResolved ?? stored;
    return {
      ...base,
      ...(branchDraft.thankYouLines ? { thankYouLines: branchDraft.thankYouLines } : {}),
      ...(branchDraft.readyTimeRules
        ? { readyTimeRules: { ...base.readyTimeRules, ...branchDraft.readyTimeRules } }
        : {}),
    };
  }, [branchResolved, stored, branchDraft]);

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Print</h2>
      <p className="muted" style={{ maxWidth: 720, marginTop: 0 }}>
        The customer docket — the receipt that goes out with the order. What you save here is what
        every branch prints. The <strong>printer itself</strong> is chosen on the counter machine in
        the Branch POS, because that is where it is plugged in.
      </p>

      <DataState loading={loading} error={loadError} onRetry={load}>
        <div style={{ display: 'grid', gap: 20, gridTemplateColumns: 'minmax(320px, 1fr) minmax(320px, 460px)' }}>
          <div>
            {isOwner ? (
              <div className="card" style={{ marginBottom: 18 }}>
                <h3 style={{ marginTop: 0 }}>Everyone&rsquo;s template</h3>
                <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
                  The layout, the name at the top and the footer. Every branch prints this.
                </p>

                <h4 style={{ marginBottom: 4 }}>Sections</h4>
                <SectionOrder template={draft} onChange={(sections) => setDraft({ ...draft, sections })} />

                <div style={{ marginTop: 16 }}>
                  <div style={{ marginBottom: 12 }}>
                    <span className="muted" style={{ display: 'block', fontSize: 12, marginBottom: 6 }}>
                      Leave this empty to print the brand mark the apps ship with — which is what
                      makes a logo appear on day one at a branch that has set up nothing. Upload
                      artwork to replace it. It prints in black and white on a narrow roll, so a
                      wordmark reads and a photograph does not.
                    </span>
                    <ImageField
                      label="Logo artwork"
                      value={draft.logoImageUrl ?? ''}
                      onChange={(logoImageUrl) =>
                        setDraft({ ...draft, logoImageUrl: logoImageUrl || null })
                      }
                    />
                  </div>
                  <label style={{ display: 'block', marginBottom: 12 }}>
                    <span style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>
                      Logo size
                    </span>
                    <span className="muted" style={{ display: 'block', fontSize: 12, marginBottom: 6 }}>
                      As a share of the paper, so it comes out the same on an 80mm and a 58mm roll.
                      A mark with fine detail often reads better smaller — the detail is lost to the
                      printer either way, and a smaller logo does not put it under a magnifying
                      glass.
                    </span>
                    <select
                      className="input"
                      aria-label="Logo size"
                      value={draft.logoWidthPercent}
                      onChange={(e) =>
                        setDraft({ ...draft, logoWidthPercent: Number(e.target.value) })
                      }
                      style={{ maxWidth: 260 }}
                    >
                      <option value={30}>Small — 30% of the paper</option>
                      <option value={50}>Medium — half the paper</option>
                      <option value={70}>Large — 70% of the paper</option>
                      <option value={100}>Full width</option>
                    </select>
                  </label>
                  <LinesField
                    label="Logo text"
                    hint="Printed above the name. For a printer that cannot manage an image at all — most can, so this is usually empty."
                    value={draft.logoLines}
                    onChange={(logoLines) => setDraft({ ...draft, logoLines })}
                  />
                  <LinesField
                    label="Restaurant name"
                    hint="One line each. Arabic first reads best on the roll."
                    value={draft.brandLines}
                    onChange={(brandLines) => setDraft({ ...draft, brandLines })}
                  />
                  <LinesField
                    label="Thank-you"
                    value={draft.thankYouLines}
                    onChange={(thankYouLines) => setDraft({ ...draft, thankYouLines })}
                  />
                  <LinesField
                    label="Footer"
                    hint="Keep the line saying this is not a tax invoice: the restaurant issues its ZATCA invoice separately, and a receipt carrying a total is otherwise filed as one."
                    value={draft.footerLines}
                    onChange={(footerLines) => setDraft({ ...draft, footerLines })}
                  />
                </div>

                <Toggle
                  label="Print the logo at the top"
                  value={draft.printLogoImage}
                  onChange={(printLogoImage) => setDraft({ ...draft, printLogoImage })}
                />
                <Toggle
                  label="Print the branch name"
                  value={draft.showBranchName}
                  onChange={(showBranchName) => setDraft({ ...draft, showBranchName })}
                />
                <Toggle
                  label="Mark a customer&rsquo;s first order"
                  value={draft.showNewCustomerBadge}
                  onChange={(showNewCustomerBadge) => setDraft({ ...draft, showNewCustomerBadge })}
                />

                <h4 style={{ marginBottom: 6, marginTop: 16 }}>Ready time</h4>
                <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
                  Printed as a range from the time the order was placed, measured on the food only —
                  a delivery fee does not make a kitchen slower.
                </p>
                <ReadyTimeFields
                  rules={draft.readyTimeRules}
                  onChange={(readyTimeRules) => setDraft({ ...draft, readyTimeRules })}
                />

                <SaveBar
                  label="Save for every branch"
                  dirty={dirty}
                  saved={saved}
                  error={saveError}
                  saving={saving}
                  onSave={() => void save()}
                  onDiscard={() => {
                    setDraft(stored);
                    setSaveError(null);
                  }}
                />
              </div>
            ) : null}

            <div className="card">
              <h3 style={{ marginTop: 0 }}>One branch</h3>
              <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
                A branch sets how long its own kitchen takes and what it says to its own customers.
                The rest of the layout stays yours — {BRANCH_OVERRIDABLE_KEYS.length} fields, and the
                server refuses the others.
              </p>

              <label style={{ display: 'block', marginBottom: 12 }}>
                <span style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Branch</span>
                <select
                  className="input"
                  value={branchId ?? ''}
                  onChange={(e) => setBranchId(e.target.value || null)}
                >
                  {branches.length === 0 ? <option value="">No branches</option> : null}
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </label>

              <LinesField
                label="Thank-you for this branch"
                hint="Leave empty to print everyone's."
                value={branchDraft.thankYouLines ?? []}
                onChange={(next) =>
                  setBranchDraft({
                    ...branchDraft,
                    ...(next.length > 0 ? { thankYouLines: next } : { thankYouLines: undefined }),
                  })
                }
              />

              <h4 style={{ marginBottom: 6 }}>Ready time for this branch</h4>
              <ReadyTimeFields
                rules={branchDraft.readyTimeRules ?? branchPreview.readyTimeRules}
                onChange={(readyTimeRules) => setBranchDraft({ ...branchDraft, readyTimeRules })}
              />

              <SaveBar
                label="Save for this branch"
                dirty={branchDirty}
                saved={branchSaved}
                error={branchError}
                saving={branchSaving}
                onSave={() => void saveBranch()}
                onDiscard={() => {
                  setBranchDraft(branchStored);
                  setBranchError(null);
                }}
              />
              <button
                type="button"
                className="btn ghost"
                style={{ marginTop: 10 }}
                disabled={!branchId || branchSaving}
                onClick={() => void clearBranch()}
              >
                Use everyone&rsquo;s template
              </button>
            </div>
          </div>

          <div style={{ position: 'sticky', top: 12, alignSelf: 'start' }}>
            <DocketPreview template={isOwner && dirty ? draft : branchPreview} />
            <p className="muted" style={{ fontSize: 12 }}>
              This is the real document, built by the same code the Branch POS prints with — the
              wrapping included, which is where a long line actually goes wrong.
            </p>
          </div>
        </div>
      </DataState>
    </div>
  );
}
