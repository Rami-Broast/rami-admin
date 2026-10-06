import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BreakdownRow, OrderDetail } from '../api/types';
import { OrderBreakdown } from './OrderBreakdown';

function order(overrides: Partial<OrderDetail> = {}): OrderDetail {
  return {
    subtotalMinor: 6000,
    discountMinor: 0,
    deliveryFeeMinor: 0,
    chargesMinor: 0,
    taxableBaseMinor: 5217,
    vatMinor: 783,
    totalMinor: 6000,
    ...overrides,
  } as OrderDetail;
}

const row = (r: Partial<BreakdownRow>): BreakdownRow => ({
  kind: 'ITEMS',
  label: 'Items',
  detail: null,
  amountMinor: 0,
  included: false,
  negative: false,
  ...r,
});

describe('OrderBreakdown', () => {
  it('renders the backend’s own rows rather than reassembling them', () => {
    render(
      <OrderBreakdown
        order={order({
          priceBreakdown: {
            breakdown: [
              row({ kind: 'ITEMS', label: 'Items', amountMinor: 6000 }),
              row({
                kind: 'DELIVERY_BASE',
                label: 'Delivery',
                detail: '7 km · first 5 km included',
                amountMinor: 500,
              }),
              row({
                kind: 'DELIVERY_DISTANCE',
                label: 'Extra distance',
                detail: '2 km beyond 5 km × 3.00',
                amountMinor: 600,
              }),
              row({ kind: 'VAT', label: 'VAT', detail: '15%, included', amountMinor: 926, included: true }),
              row({ kind: 'TOTAL', label: 'To pay', amountMinor: 7100 }),
            ],
          },
        })}
      />,
    );

    expect(screen.getByText('Extra distance')).toBeInTheDocument();
    expect(screen.getByText('2 km beyond 5 km × 3.00')).toBeInTheDocument();
    expect(screen.getByText('71.00')).toBeInTheDocument();
  });

  it('strikes the original through beside the discounted amount', () => {
    // A saving has to be visible as a saving. The two numbers sit together;
    // a bare "50.00" tells the customer nothing about what they avoided.
    render(
      <OrderBreakdown
        order={order({
          priceBreakdown: {
            breakdown: [
              row({
                kind: 'ITEMS',
                label: 'Item total',
                amountMinor: 5000,
                strikethroughMinor: 6000,
              }),
              row({ kind: 'TOTAL', label: 'To pay', amountMinor: 5000 }),
            ],
          },
        })}
      />,
    );

    expect(screen.getByText('60.00')).toBeInTheDocument();
    expect(screen.getAllByText('50.00').length).toBeGreaterThan(0);
  });

  it('falls back to the order’s own columns when there is no breakdown', () => {
    // An order placed before this feature existed. The detail page must not
    // blank out or show an empty totals card.
    render(<OrderBreakdown order={order({ deliveryFeeMinor: 700, totalMinor: 6700 })} />);

    expect(screen.getByText('Item total')).toBeInTheDocument();
    expect(screen.getByText('Delivery fee')).toBeInTheDocument();
    expect(screen.getByText('67.00')).toBeInTheDocument();
  });

  it('never presents VAT as an addition, on either path', () => {
    // Prices are VAT-inclusive: the VAT line says how much of the total IS tax.
    // The old totals block listed it flush with subtotal and delivery, which
    // reads as "+ VAT" to anyone checking the arithmetic — the customer on the
    // phone included.
    render(<OrderBreakdown order={order()} />);

    expect(screen.getByText('included in the total')).toBeInTheDocument();
  });
});
