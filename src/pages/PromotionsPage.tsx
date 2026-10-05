import React, { useMemo, useState } from 'react';

import { ApiError } from '../api/http';
import type {
  Branch,
  CreatePromotionInput,
  DiscountType,
  Product,
  Promotion,
} from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { ImageField } from '../components/ImageField';
import { Modal } from '../components/Modal';
import { DataState, StatusChip } from '../components/ui';
import { useAsync } from '../hooks/useAsync';
import { formatSar, parseSarToMinor } from '../util/money';

/**
 * Automatic discounts — the offers a customer gets without typing anything.
 *
 * The distinction from Coupons is the one thing to keep straight on this
 * screen, and it is stated on the screen itself rather than only here: a coupon
 * is a code one customer claims; a promotion is a standing price this branch is
 * offering everybody. **They stack with coupons** (owner decision, 2026-09-10):
 * a customer who qualifies for a promotion and also types a code gets both, and
 * the two come off the same undiscounted price rather than compounding — so
 * publishing a promotion alongside a coupon campaign gives away the sum of the
 * two, which the page says above the table. Two promotions still do not stack
 * with each other; the larger applies.
 *
 * Two fields on this form mean the opposite of what an empty field usually
 * means, and both give money away if misread. Branches: empty is *every*
 * branch. Products: empty is the *whole basket*. The form says so in words next
 * to each, because "I left it blank so it does nothing" is the reading that
 * costs the owner real money.
 */
export function PromotionsPage(): React.JSX.Element {
  const { api } = useAuth();
  const [tick, setTick] = useState(0);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Promotion | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const promotions = useAsync(() => api.listPromotions(), [tick]);
  const branches = useAsync(() => api.branches(), []);
  const products = useAsync(() => api.listProducts({ includeInactive: false }), []);

  const rows = promotions.data ?? [];
  const branchName = useMemo(() => {
    const map = new Map((branches.data ?? []).map((b) => [b.id, b.name]));
    return (id: string): string => map.get(id) ?? 'Unknown branch';
  }, [branches.data]);

  const run = async (id: string, action: () => Promise<unknown>): Promise<void> => {
    setBusy(id);
    setError(null);
    try {
      await action();
      setTick((n) => n + 1);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not update the promotion.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <h2 style={{ margin: 0, flex: 1 }}>Promotions</h2>
        <button className="btn" onClick={() => setCreating(true)}>
          + New promotion
        </button>
      </div>

      <p className="muted" style={{ margin: '0 0 16px', fontSize: 13, maxWidth: 680 }}>
        A promotion applies <strong>automatically</strong> — the customer types no code. A coupon is
        a code one customer claims; this is a price you are offering everybody. The two{' '}
        <strong>stack</strong>: a customer who qualifies for this and also types a code gets both,
        and the two discounts come off the same undiscounted price rather than compounding. Two
        promotions do not stack with each other — the larger one applies.
      </p>

      {error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : null}

      <DataState
        loading={promotions.loading && rows.length === 0}
        error={promotions.error?.message ?? null}
        empty={rows.length === 0}
        onRetry={promotions.reload}
      >
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                <th style={th}>Name</th>
                <th style={th}>Discount</th>
                <th style={th}>Applies to</th>
                <th style={th}>Branches</th>
                <th style={th}>Runs</th>
                <th style={th}>Live</th>
                <th style={th} />
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td style={td}>
                    <strong>{p.name}</strong>
                    {p.description ? (
                      <div className="muted" style={{ fontSize: 12 }}>
                        {p.description}
                      </div>
                    ) : null}
                  </td>
                  <td style={td}>{describeDiscount(p)}</td>
                  <td style={td}>{describeProducts(p)}</td>
                  <td style={td}>
                    {p.branchIds.length === 0
                      ? 'Every branch'
                      : p.branchIds.map(branchName).join(', ')}
                  </td>
                  <td style={td}>
                    {new Date(p.startsAt).toLocaleDateString()} –{' '}
                    {new Date(p.endsAt).toLocaleDateString()}
                    {isExpired(p) ? (
                      <div className="muted" style={{ fontSize: 12 }}>
                        Ended — published or not, it discounts nothing
                      </div>
                    ) : null}
                  </td>
                  <td style={td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <StatusChip
                        label={p.isActive ? 'live' : 'draft'}
                        tone={p.isActive ? 'success' : 'neutral'}
                      />
                      <button
                        className="btn btn-ghost"
                        style={{ padding: '4px 10px' }}
                        disabled={busy === p.id}
                        onClick={() =>
                          run(p.id, () =>
                            p.isActive ? api.unpublishPromotion(p.id) : api.publishPromotion(p.id),
                          )
                        }
                      >
                        {p.isActive ? 'Pause' : 'Publish'}
                      </button>
                    </div>
                  </td>
                  <td style={td}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        className="btn btn-ghost"
                        style={{ padding: '4px 10px' }}
                        onClick={() => setEditing(p)}
                      >
                        Edit
                      </button>
                      <button
                        className="btn btn-ghost"
                        style={{ padding: '4px 10px', color: 'var(--danger)' }}
                        disabled={busy === p.id}
                        onClick={() => {
                          // A promotion has no code out in the world and no
                          // redemption record, so deleting one only stops future
                          // carts getting it. Orders it already discounted keep
                          // their snapshotted totals.
                          if (
                            window.confirm(
                              `Delete “${p.name}”? Orders it already discounted keep their totals; new carts stop getting it.`,
                            )
                          ) {
                            void run(p.id, () => api.deletePromotion(p.id));
                          }
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DataState>

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="New promotion"
        width={640}
      >
        <PromotionForm
          branches={branches.data ?? []}
          products={products.data ?? []}
          onSave={async (input) => {
            await api.createPromotion(input);
            setCreating(false);
            setTick((n) => n + 1);
          }}
        />
      </Modal>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={`Edit ${editing?.name ?? 'promotion'}`}
        width={640}
      >
        {editing ? (
          <PromotionForm
            promotion={editing}
            branches={branches.data ?? []}
            products={products.data ?? []}
            onSave={async (input) => {
              await api.updatePromotion(editing.id, input);
              setEditing(null);
              setTick((n) => n + 1);
            }}
          />
        ) : null}
      </Modal>
    </div>
  );
}

function isExpired(p: Promotion): boolean {
  return new Date(p.endsAt).getTime() <= Date.now();
}

function describeDiscount(p: Promotion): string {
  if (p.discountType === 'FREE_DELIVERY') return 'Free delivery';
  if (p.discountType === 'PERCENTAGE') {
    const cap = p.maxDiscountMinor ? ` (max ${formatSar(p.maxDiscountMinor)})` : '';
    return `${p.discountValue}% off${cap}`;
  }
  return `${formatSar(Number(p.discountValue))} off`;
}

function describeProducts(p: Promotion): string {
  const items = p.items ?? [];
  if (items.length === 0) return 'The whole basket';
  const names = items.map((i) => i.product?.name).filter((n): n is string => Boolean(n));
  if (names.length === 0) return `${items.length} item(s)`;
  return names.length > 3 ? `${names.slice(0, 3).join(', ')} +${names.length - 3}` : names.join(', ');
}

// ---------------------------------------------------------------------------
// Form
// ---------------------------------------------------------------------------

function toDateInput(iso: string | undefined, fallbackMonths = 0): string {
  const d = iso ? new Date(iso) : new Date();
  if (!iso && fallbackMonths) d.setUTCMonth(d.getUTCMonth() + fallbackMonths);
  return d.toISOString().slice(0, 10);
}

/** Exported for `forms.test.tsx`: the body this sends decides real money. */
export function PromotionForm({
  promotion,
  branches,
  products,
  onSave,
}: {
  promotion?: Promotion;
  branches: Branch[];
  products: Product[];
  onSave: (input: CreatePromotionInput) => Promise<void>;
}): React.JSX.Element {
  const [name, setName] = useState(promotion?.name ?? '');
  const [nameAr, setNameAr] = useState(promotion?.nameAr ?? '');
  const [description, setDescription] = useState(promotion?.description ?? '');
  const [discountType, setDiscountType] = useState<DiscountType>(
    promotion?.discountType ?? 'PERCENTAGE',
  );
  // Held as a string, like every other money/number field in this app: a number
  // input cannot hold "empty", and a half-typed box must never become a zero.
  const [discountValue, setDiscountValue] = useState(promotion?.discountValue ?? '10');
  const [maxDiscountSar, setMaxDiscountSar] = useState(
    promotion?.maxDiscountMinor ? String(promotion.maxDiscountMinor / 100) : '',
  );
  const [startsAt, setStartsAt] = useState(toDateInput(promotion?.startsAt));
  const [endsAt, setEndsAt] = useState(toDateInput(promotion?.endsAt, 1));
  const [priority, setPriority] = useState(String(promotion?.priority ?? 0));
  const [branchIds, setBranchIds] = useState<string[]>(promotion?.branchIds ?? []);
  const [productIds, setProductIds] = useState<string[]>(
    (promotion?.items ?? []).map((i) => i.productId),
  );
  const [imageUrl, setImageUrl] = useState(promotion?.imageUrl ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (list: string[], id: string): string[] =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const value = discountType === 'FREE_DELIVERY' ? 0 : Number(discountValue);
      if (!Number.isFinite(value) || value < 0) {
        throw new Error('The discount value must be a number.');
      }
      if (new Date(endsAt) <= new Date(startsAt)) {
        throw new Error('The end date must be after the start date.');
      }
      await onSave({
        name: name.trim(),
        nameAr: nameAr.trim() || undefined,
        description: description.trim() || undefined,
        imageUrl: imageUrl.trim() || undefined,
        discountType,
        discountValue: value,
        maxDiscountMinor:
          discountType === 'PERCENTAGE' && maxDiscountSar
            ? parseSarToMinor(maxDiscountSar)
            : undefined,
        branchIds,
        startsAt: `${startsAt}T00:00:00.000Z`,
        endsAt: `${endsAt}T23:59:59.999Z`,
        priority: Number(priority) || 0,
        productIds,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <Row>
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </Field>
        <Field label="Name (Arabic)">
          <input value={nameAr} onChange={(e) => setNameAr(e.target.value)} dir="rtl" />
        </Field>
      </Row>
      <Field label="Description">
        <input value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>

      <Row>
        <Field label="Discount type">
          <select
            value={discountType}
            onChange={(e) => setDiscountType(e.target.value as DiscountType)}
          >
            <option value="PERCENTAGE">Percentage</option>
            <option value="FIXED_AMOUNT">Fixed amount (halalas)</option>
            <option value="FREE_DELIVERY">Free delivery</option>
          </select>
        </Field>
        <Field label={discountType === 'PERCENTAGE' ? 'Value (%)' : 'Value'}>
          <input
            value={discountValue}
            onChange={(e) => setDiscountValue(e.target.value)}
            inputMode="decimal"
            disabled={discountType === 'FREE_DELIVERY'}
            required={discountType !== 'FREE_DELIVERY'}
          />
        </Field>
      </Row>
      {discountType === 'PERCENTAGE' ? (
        <Field label="Most it can take off (SAR, optional)">
          <input
            value={maxDiscountSar}
            onChange={(e) => setMaxDiscountSar(e.target.value)}
            inputMode="decimal"
          />
        </Field>
      ) : null}

      <Row>
        <Field label="Starts">
          <input
            type="date"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            required
          />
        </Field>
        <Field label="Ends">
          <input type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} required />
        </Field>
      </Row>

      <Field label="Order (only breaks a tie between two equal promotions)">
        <input value={priority} onChange={(e) => setPriority(e.target.value)} inputMode="numeric" />
      </Field>

      <Picker
        title="Branches"
        // The reading that costs money. Someone selecting nothing because they
        // have not decided yet has just published to the whole company.
        emptyMeans="Nothing selected means EVERY branch."
        options={branches.map((b) => ({ id: b.id, label: `${b.name} (${b.code})` }))}
        selected={branchIds}
        onToggle={(id) => setBranchIds((prev) => toggle(prev, id))}
      />

      <Picker
        title="Products"
        emptyMeans="Nothing selected means the WHOLE BASKET, not nothing."
        options={products.map((p) => ({ id: p.id, label: p.name }))}
        selected={productIds}
        onToggle={(id) => setProductIds((prev) => toggle(prev, id))}
      />

      <div style={{ marginTop: 12 }}>
        <ImageField
          label="Artwork (optional)"
          value={imageUrl}
          onChange={setImageUrl}
          hint="Shown on the customer app's Offers tab. A wide image works best."
        />
      </div>

      {error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : null}

      <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
        {promotion
          ? 'Saving changes what future carts get. Orders already placed keep the totals they were charged.'
          : 'A new promotion starts as a draft and discounts nothing until you publish it.'}
      </p>

      <button
        className="btn"
        disabled={busy || !name.trim()}
        style={{ width: '100%', marginTop: 8 }}
      >
        {busy ? 'Saving…' : promotion ? 'Save changes' : 'Create promotion'}
      </button>
    </form>
  );
}

/**
 * A checkbox list whose empty state is load-bearing, so it says what empty
 * means instead of leaving the owner to assume it means "none".
 */
function Picker({
  title,
  emptyMeans,
  options,
  selected,
  onToggle,
}: {
  title: string;
  emptyMeans: string;
  options: { id: string; label: string }[];
  selected: string[];
  onToggle: (id: string) => void;
}): React.JSX.Element {
  return (
    <div style={{ marginTop: 14 }}>
      <strong style={{ fontSize: 13 }}>{title}</strong>
      <p className="muted" style={{ margin: '2px 0 6px', fontSize: 12 }}>
        {selected.length === 0 ? emptyMeans : `${selected.length} selected.`}
      </p>
      <div
        style={{
          maxHeight: 140,
          overflowY: 'auto',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: 8,
        }}
      >
        {options.length === 0 ? (
          <span className="muted" style={{ fontSize: 12 }}>
            Nothing to choose from yet.
          </span>
        ) : (
          options.map((o) => (
            <label
              key={o.id}
              style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '2px 0' }}
            >
              <input
                type="checkbox"
                checked={selected.includes(o.id)}
                onChange={() => onToggle(o.id)}
              />
              <span style={{ fontSize: 13 }}>{o.label}</span>
            </label>
          ))
        )}
      </div>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <div style={{ display: 'flex', gap: 8 }}>{children}</div>;
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <label style={{ display: 'block', flex: 1, marginTop: 10 }}>
      <span className="muted" style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>
        {label}
      </span>
      {children}
    </label>
  );
}

const th: React.CSSProperties = {
  padding: '10px 12px',
  borderBottom: '1px solid var(--border)',
  fontWeight: 600,
  whiteSpace: 'nowrap',
};
const td: React.CSSProperties = {
  padding: '10px 12px',
  borderBottom: '1px solid var(--border)',
  verticalAlign: 'top',
};
