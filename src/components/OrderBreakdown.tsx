import React from 'react';

import { BreakdownRow, OrderDetail } from '../api/types';
import { formatMinor } from '../util/money';

/**
 * An order's itemised total, exactly as the backend built it.
 *
 * ## Two things this fixes
 *
 * **It renders the backend's own list rather than reassembling one.** The
 * breakdown is built once, server-side, and snapshotted onto the order, so this
 * view, the customer's summary and the Branch POS cannot disagree about what an
 * order was charged. Any row the backend adds later — a new fee, a promotion —
 * appears here with no change needed.
 *
 * **It stops VAT reading as an addition.** Prices are VAT-inclusive: the VAT
 * line says how much of the total *is* tax, it does not add to it. The old
 * totals block listed it flush with subtotal and delivery, which reads as
 * "+ VAT" to anyone checking the arithmetic — including the customer on the
 * phone. Rows the backend marks `included` are rendered set apart and labelled.
 *
 * Falls back to the order's own columns for an order placed before the
 * breakdown existed, so no order detail page goes blank on old data.
 */
export function OrderBreakdown({ order }: { order: OrderDetail }): React.JSX.Element {
  const rows = order.priceBreakdown?.breakdown;

  if (!rows || rows.length === 0) {
    return <LegacyTotals order={order} />;
  }

  return (
    <div>
      {rows.map((row, index) => (
        <Row key={`${row.kind}-${index}`} row={row} />
      ))}
    </div>
  );
}

function Row({ row }: { row: BreakdownRow }): React.JSX.Element {
  const isTotal = row.kind === 'TOTAL';
  const amount = `${row.negative ? '−' : ''}${formatMinor(row.amountMinor)}`;

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: 12,
        padding: isTotal ? '10px 0 0' : '4px 0',
        marginTop: isTotal ? 6 : 0,
        borderTop: isTotal ? '1px solid var(--border, #e5e5e5)' : undefined,
        fontWeight: isTotal ? 700 : 400,
        fontSize: isTotal ? 18 : 14,
        // An included row is not part of the sum, so it must not read as one.
        opacity: row.included ? 0.7 : 1,
      }}
    >
      <span>
        {row.label}
        {row.detail ? (
          <span className="muted" style={{ fontSize: 12, marginInlineStart: 6 }}>
            {row.detail}
          </span>
        ) : null}
      </span>
      <span style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
        {/* What it would have cost, struck through immediately before what it
            did — the two have to sit together or the saving is invisible. */}
        {typeof row.strikethroughMinor === 'number' ? (
          <span className="muted" style={{ textDecoration: 'line-through', marginInlineEnd: 8 }}>
            {formatMinor(row.strikethroughMinor)}
          </span>
        ) : null}
        {amount}
      </span>
    </div>
  );
}

/**
 * The pre-breakdown fallback, for orders placed before this feature.
 *
 * Says "included in the total" on the VAT row rather than repeating the old
 * mistake of listing it as though it added on top.
 */
function LegacyTotals({ order }: { order: OrderDetail }): React.JSX.Element {
  const rows: BreakdownRow[] = [
    {
      kind: 'ITEMS',
      label: 'Item total',
      detail: null,
      amountMinor: order.subtotalMinor - order.discountMinor,
      ...(order.discountMinor > 0 ? { strikethroughMinor: order.subtotalMinor } : {}),
      included: false,
      negative: false,
    },
  ];

  if (order.deliveryFeeMinor > 0) {
    rows.push({
      kind: 'DELIVERY_BASE',
      label: 'Delivery fee',
      detail: null,
      amountMinor: order.deliveryFeeMinor,
      included: false,
      negative: false,
    });
  }

  if (order.chargesMinor > 0) {
    rows.push({
      kind: 'CHARGE',
      label: 'Charges',
      detail: null,
      amountMinor: order.chargesMinor,
      included: false,
      negative: false,
    });
  }

  rows.push({
    kind: 'VAT',
    label: 'VAT',
    detail: 'included in the total',
    amountMinor: order.vatMinor,
    included: true,
    negative: false,
  });

  rows.push({
    kind: 'TOTAL',
    label: 'To pay',
    detail: null,
    amountMinor: order.totalMinor,
    included: false,
    negative: false,
  });

  return (
    <div>
      {rows.map((row, index) => (
        <Row key={`${row.kind}-${index}`} row={row} />
      ))}
    </div>
  );
}
