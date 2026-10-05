import React, { useState } from 'react';

import { ApiError } from '../api/http';
import { Coupon, CouponRuleType, CreateCouponInput, DiscountType } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { ImageField } from '../components/ImageField';
import { Modal } from '../components/Modal';
import { DataState, StatusChip } from '../components/ui';
import { useAsync } from '../hooks/useAsync';
import { resolveImageUrl } from '../util/imageUrl';
import { formatSar, parseSarToMinor } from '../util/money';

/**
 * List coupons and create new ones with typed eligibility rules. Rules are
 * ANDed server-side; ruleType.config shapes are documented in the backend
 * coupon README (e.g. MIN_SPEND → { minSpendMinor }).
 */
export function CouponsPage(): React.JSX.Element {
  const { api } = useAuth();
  const [tick, setTick] = useState(0);
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [publishing, setPublishing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const coupons = useAsync(() => api.listCoupons({ page, limit: 25 }), [page, tick]);

  const rows = coupons.data?.data ?? [];
  const meta = coupons.data?.meta;

  /**
   * Publishing is a one-press decision because it is reversible and visible:
   * the offer is on the customer's Offers tab, or it is not. Only that flag
   * moves — the code, the discount, the dates and the limits are the terms the
   * coupon was issued under and are never editable from here.
   */
  const togglePublished = async (coupon: Coupon): Promise<void> => {
    setPublishing(coupon.id);
    setError(null);
    try {
      await api.updateCoupon(coupon.id, { isPublic: !coupon.isPublic });
      setTick((n) => n + 1);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not update the coupon.');
    } finally {
      setPublishing(null);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0, flex: 1 }}>Coupons</h2>
        <button className="btn" onClick={() => setCreating(true)}>+ New coupon</button>
      </div>

      {error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : null}

      <DataState
        loading={coupons.loading && rows.length === 0}
        error={coupons.error?.message ?? null}
        empty={rows.length === 0}
        onRetry={coupons.reload}
      >
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                <th style={th}>Code</th>
                <th style={th}>Name</th>
                <th style={th}>Discount</th>
                <th style={th}>Valid</th>
                <th style={th}>Usage</th>
                <th style={th}>Status</th>
                <th style={th}>In the app</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td style={td}><strong>{c.code}</strong></td>
                  <td style={td}>{c.name}</td>
                  <td style={td}>{describeDiscount(c)}</td>
                  <td style={td}>
                    {new Date(c.validFrom).toLocaleDateString()} –{' '}
                    {new Date(c.validUntil).toLocaleDateString()}
                  </td>
                  <td style={td}>
                    {c.usageCount ?? 0}
                    {c.totalUsageLimit ? ` / ${c.totalUsageLimit}` : ''}
                  </td>
                  <td style={td}>
                    <StatusChip
                      label={c.isActive === false ? 'inactive' : 'active'}
                      tone={c.isActive === false ? 'neutral' : 'success'}
                    />
                  </td>
                  <td style={td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <StatusChip
                        label={c.isPublic ? 'offer' : 'private'}
                        tone={c.isPublic ? 'success' : 'neutral'}
                      />
                      <button
                        className="btn btn-ghost"
                        style={{ padding: '4px 10px' }}
                        disabled={publishing === c.id}
                        onClick={() => togglePublished(c)}
                      >
                        {c.isPublic ? 'Unpublish' : 'Publish'}
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
              disabled={page <= 1 || coupons.loading}
              onClick={() => setPage((n) => Math.max(1, n - 1))}
            >
              Previous
            </button>
            <span className="muted">
              Page {meta.page} of {Math.max(1, meta.totalPages)} · {meta.total} coupons
            </span>
            <button
              className="btn btn-ghost"
              disabled={!meta.hasNextPage || coupons.loading}
              onClick={() => setPage((n) => n + 1)}
            >
              Next
            </button>
          </div>
        ) : null}
      </DataState>

      <Modal open={creating} onClose={() => setCreating(false)} title="New coupon" width={620}>
        <CouponForm
          onSave={async (input) => {
            await api.createCoupon(input);
            setCreating(false);
            setTick((n) => n + 1);
          }}
        />
      </Modal>
    </div>
  );
}

function describeDiscount(c: Coupon): string {
  if (c.discountType === 'PERCENTAGE') return `${c.discountValue}% off`;
  if (c.discountType === 'FIXED_AMOUNT') return `${formatSar(Number(c.discountValue))} off`;
  return 'Free delivery';
}

interface RuleDraft {
  ruleType: CouponRuleType;
  configText: string;
}

function CouponForm({
  onSave,
}: {
  onSave: (input: CreateCouponInput) => Promise<void>;
}): React.JSX.Element {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [discountType, setDiscountType] = useState<DiscountType>('PERCENTAGE');
  const [discountValue, setDiscountValue] = useState('10');
  const [maxDiscountSar, setMaxDiscountSar] = useState('');
  const [validFrom, setValidFrom] = useState(new Date().toISOString().slice(0, 10));
  const [validUntil, setValidUntil] = useState(() => {
    const d = new Date();
    d.setUTCMonth(d.getUTCMonth() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [totalLimit, setTotalLimit] = useState('');
  const [perCustomer, setPerCustomer] = useState('');
  const [rules, setRules] = useState<RuleDraft[]>([]);
  // Publishing turns a coupon into an **offer**: it appears on the customer
  // app's Offers page with this artwork and this code. Off by default —
  // a coupon is as often a private apology to one customer as it is a
  // promotion, and publishing one by accident hands its code to everybody.
  const [isPublic, setIsPublic] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addRule = (): void =>
    setRules((r) => [...r, { ruleType: 'MIN_SPEND', configText: '{ "minSpendMinor": 5000 }' }]);

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const parsedRules = rules.map((r, i) => {
        try {
          const config = JSON.parse(r.configText) as Record<string, unknown>;
          return { ruleType: r.ruleType, config };
        } catch {
          throw new Error(`Rule ${i + 1}: config is not valid JSON.`);
        }
      });
      const input: CreateCouponInput = {
        code: code.trim().toUpperCase(),
        name: name.trim(),
        description: description.trim() || undefined,
        discountType,
        discountValue: discountValue.trim(),
        maxDiscountMinor: maxDiscountSar ? parseSarToMinor(maxDiscountSar) : undefined,
        validFrom: `${validFrom}T00:00:00.000Z`,
        validUntil: `${validUntil}T23:59:59.999Z`,
        totalUsageLimit: totalLimit ? parseInt(totalLimit, 10) : undefined,
        perCustomerLimit: perCustomer ? parseInt(perCustomer, 10) : undefined,
        rules: parsedRules.length > 0 ? parsedRules : undefined,
        isPublic,
        imageUrl: imageUrl.trim() || undefined,
      };
      await onSave(input);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <Row>
        <Field label="Code">
          <input value={code} onChange={(e) => setCode(e.target.value)} required autoFocus />
        </Field>
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
      </Row>
      <Field label="Description">
        <input value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Row>
        <Field label="Discount type">
          <select value={discountType} onChange={(e) => setDiscountType(e.target.value as DiscountType)}>
            <option value="PERCENTAGE">Percentage</option>
            <option value="FIXED_AMOUNT">Fixed amount (SAR)</option>
            <option value="FREE_DELIVERY">Free delivery</option>
          </select>
        </Field>
        <Field label={discountType === 'PERCENTAGE' ? 'Value (%)' : 'Value'}>
          <input
            value={discountValue}
            onChange={(e) => setDiscountValue(e.target.value)}
            disabled={discountType === 'FREE_DELIVERY'}
            required={discountType !== 'FREE_DELIVERY'}
          />
        </Field>
      </Row>
      {discountType === 'PERCENTAGE' ? (
        <Field label="Max discount ceiling (SAR, optional)">
          <input
            value={maxDiscountSar}
            onChange={(e) => setMaxDiscountSar(e.target.value)}
            inputMode="decimal"
          />
        </Field>
      ) : null}
      <Row>
        <Field label="Valid from">
          <input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} required />
        </Field>
        <Field label="Valid until">
          <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} required />
        </Field>
      </Row>
      <Row>
        <Field label="Total usage limit (optional)">
          <input value={totalLimit} onChange={(e) => setTotalLimit(e.target.value)} inputMode="numeric" />
        </Field>
        <Field label="Per-customer limit (optional)">
          <input value={perCustomer} onChange={(e) => setPerCustomer(e.target.value)} inputMode="numeric" />
        </Field>
      </Row>

      <div style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
          <strong style={{ flex: 1 }}>Eligibility rules</strong>
          <button type="button" className="btn btn-ghost" onClick={addRule} style={{ padding: '4px 10px' }}>
            + Add rule
          </button>
        </div>
        <p className="muted" style={{ margin: '0 0 8px', fontSize: 12 }}>
          Rules are ANDed. Config is a JSON object — e.g. <code>MIN_SPEND</code>{' '}
          takes <code>{'{"minSpendMinor": 5000}'}</code>, <code>BRANCH</code> takes{' '}
          <code>{'{"branchIds": ["…"]}'}</code>.
        </p>
        {rules.map((r, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            <select
              value={r.ruleType}
              onChange={(e) =>
                setRules((prev) =>
                  prev.map((x, j) => (j === i ? { ...x, ruleType: e.target.value as CouponRuleType } : x)),
                )
              }
              style={{ width: 200 }}
            >
              {(['FIRST_ORDER', 'MIN_SPEND', 'PRODUCT', 'CATEGORY', 'BRANCH', 'TIME_WINDOW', 'CUSTOMER_ELIGIBILITY'] as const).map(
                (t) => (
                  <option key={t} value={t}>
                    {t.replace(/_/g, ' ')}
                  </option>
                ),
              )}
            </select>
            <input
              value={r.configText}
              onChange={(e) =>
                setRules((prev) => prev.map((x, j) => (j === i ? { ...x, configText: e.target.value } : x)))
              }
              placeholder='{ }'
              style={{ flex: 1, fontFamily: 'monospace' }}
            />
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setRules((prev) => prev.filter((_, j) => j !== i))}
              style={{ padding: '4px 10px' }}
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
          <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
          <strong>Show this as an offer in the customer app</strong>
        </label>
        <p className="muted" style={{ margin: '6px 0 10px', fontSize: 12 }}>
          Published offers appear on the Offers tab with their code. Customers tap one to apply it,
          and the discount is the one this coupon gives — there is no second set of numbers.
        </p>
        {isPublic ? (
          <>
            <ImageField
              label="Offer artwork"
              value={imageUrl}
              onChange={setImageUrl}
              hint="This is the card the customer taps. A wide image works best — it renders 16:9."
            />
            <OfferPreview
              imageUrl={imageUrl}
              code={code}
              name={name}
              description={description}
              discountType={discountType}
              discountValue={discountValue}
            />
          </>
        ) : null}
      </div>

      {error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : null}
      <button className="btn" disabled={busy || !code.trim() || !name.trim()} style={{ width: '100%', marginTop: 16 }}>
        {busy ? 'Creating…' : 'Create coupon'}
      </button>
    </form>
  );
}

function Row({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <div style={{ display: 'flex', gap: 8 }}>{children}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <label style={{ display: 'block', flex: 1, marginTop: 10 }}>
      <span className="muted" style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>{label}</span>
      {children}
    </label>
  );
}

const th: React.CSSProperties = { padding: '10px 12px', borderBottom: '1px solid var(--border)', fontWeight: 600, whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '10px 12px', borderBottom: '1px solid var(--border)' };

/**
 * What the customer will see, while the owner is still typing.
 *
 * An offer card is the one thing in the admin panel whose output lives in
 * someone else's app, so the only way to know a link is wrong or a headline
 * reads badly is to look at it here. It renders the same three things the app
 * does — artwork, headline, code — and nothing it cannot know.
 */
function OfferPreview({
  imageUrl,
  code,
  name,
  description,
  discountType,
  discountValue,
}: {
  imageUrl: string;
  code: string;
  name: string;
  description: string;
  discountType: DiscountType;
  discountValue: string;
}): React.JSX.Element {
  const headline =
    discountType === 'FREE_DELIVERY'
      ? 'Free delivery'
      : discountType === 'PERCENTAGE'
        ? `${discountValue || '0'}% off`
        : `${formatSar(Number(discountValue) || 0)} off`;

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', maxWidth: 340 }}>
      {imageUrl.trim() ? (
        <img
          src={resolveImageUrl(imageUrl) ?? ''}
          alt=""
          style={{ display: 'block', width: '100%', height: 120, objectFit: 'cover' }}
        />
      ) : (
        <div
          style={{
            height: 120,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--surface-alt, #f4f4f5)',
            color: 'var(--muted)',
            fontSize: 12,
          }}
        >
          No image — the card still works, the headline takes the space
        </div>
      )}
      <div style={{ padding: 12 }}>
        <strong style={{ display: 'block', fontSize: 16 }}>{headline}</strong>
        <span className="muted" style={{ fontSize: 12 }}>
          {description || name || 'Offer description'}
        </span>
        <div style={{ marginTop: 10 }}>
          <span
            style={{
              display: 'inline-block',
              border: '1.5px dashed var(--primary, #752E2A)',
              borderRadius: 8,
              padding: '4px 10px',
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            CODE {code.trim().toUpperCase() || '—'}
          </span>
        </div>
      </div>
    </div>
  );
}
