import { describe, expect, it } from 'vitest';

import type { OrderDetail, PaymentsReport, SalesReport, VatReport } from '../api/types';
import {
  DocumentContext,
  PrintDocument,
  humanise,
  orderDocument,
  ordersListDocument,
  paymentsReportDocument,
  periodOf,
  salesReportDocument,
  transactionsDocument,
  vatReportDocument,
} from './document';

const context: DocumentContext = {
  branchLabel: 'Riyadh — Olaya',
  printedBy: 'Owner',
  now: new Date('2026-09-03T12:00:00Z'),
};

/** Every value a reader might check, flattened, so assertions read plainly. */
function textOf(doc: PrintDocument): string {
  const parts = [doc.title, doc.subtitle ?? '', doc.footnote ?? ''];

  for (const item of doc.meta) {
    parts.push(item.label, item.value);
  }

  for (const section of doc.sections) {
    if (section.kind === 'table') {
      parts.push(...section.rows.flat(), ...(section.totals ?? []));
    } else if (section.kind === 'keyValues') {
      parts.push(...section.items.map((i) => `${i.label}=${i.value}`));
    } else {
      parts.push(section.text);
    }
  }

  return parts.join('|');
}

describe('humanise', () => {
  it('turns backend enums into something a person reads', () => {
    expect(humanise('CASH_ON_DELIVERY')).toBe('Cash On Delivery');
    expect(humanise('PAID')).toBe('Paid');
  });

  it('renders a missing value as a dash rather than "null"', () => {
    expect(humanise(null)).toBe('—');
    expect(humanise(undefined)).toBe('—');
  });
});

describe('periodOf', () => {
  it('spans the rows actually on the page', () => {
    const period = periodOf(['2026-09-03T10:00:00Z', '2026-09-01T08:00:00Z', '2026-09-02T09:00:00Z']);

    expect(period.from).toBe('2026-09-01T08:00:00.000Z');
    expect(period.to).toBe('2026-09-03T10:00:00.000Z');
  });

  it('ignores unparseable timestamps instead of producing Invalid Date', () => {
    const period = periodOf(['nonsense', '2026-09-01T08:00:00Z']);

    expect(period.from).toBe('2026-09-01T08:00:00.000Z');
  });

  it('falls back to today for an empty set', () => {
    expect(() => new Date(periodOf([]).from).toISOString()).not.toThrow();
  });
});

const sales: SalesReport = {
  period: { from: '2026-09-01', to: '2026-09-30' },
  currency: 'SAR',
  statusBreakdown: [{ status: 'DELIVERED', orders: 1, totalMinor: 22500 }],
  realised: {
    orders: 1,
    subtotalMinor: 20000,
    discountMinor: 0,
    deliveryFeeMinor: 1500,
    chargesMinor: 1000,
    taxableBaseMinor: 19565,
    vatMinor: 2935,
    totalMinor: 22500,
  },
  charges: [{ name: 'Service', count: 1, grossMinor: 1000, vatMinor: 130, totalMinor: 1000 }],
};

describe('salesReportDocument', () => {
  it('prints the backend figures unchanged', () => {
    // The printed page is what reaches an accountant. It formats the snapshot
    // and derives nothing — a total computed here could disagree with the one
    // on screen and nobody would know which was right.
    const text = textOf(salesReportDocument(sales, context));

    expect(text).toContain('SAR 225.00'); // total
    expect(text).toContain('SAR 29.35'); // VAT
    expect(text).toContain('SAR 195.65'); // taxable base
  });

  it('names the branch and who printed it', () => {
    const doc = salesReportDocument(sales, context);

    expect(doc.meta.find((m) => m.label === 'Branch')?.value).toBe('Riyadh — Olaya');
    expect(doc.meta.find((m) => m.label === 'Printed by')?.value).toBe('Owner');
  });

  it('explains what realised sales excludes, on the page itself', () => {
    expect(salesReportDocument(sales, context).footnote).toMatch(/cancelled/i);
  });

  it('says so rather than printing an empty table', () => {
    const empty = { ...sales, statusBreakdown: [], charges: [] };
    const doc = salesReportDocument(empty, context);
    const tables = doc.sections.filter((s) => s.kind === 'table');

    expect(tables.every((s) => s.kind === 'table' && s.emptyText)).toBe(true);
  });
});

const vat: VatReport = {
  period: { from: '2026-09-01', to: '2026-09-30' },
  currency: 'SAR',
  basis: 'gross',
  note: 'Gross output VAT on realised sales.',
  byRate: [
    { vatRate: '0.15', orders: 2, taxableBaseMinor: 19565, vatMinor: 2935, totalMinor: 22500 },
  ],
};

describe('vatReportDocument', () => {
  it('shows the rate as a percentage and totals the column', () => {
    const doc = vatReportDocument(vat, context);
    const table = doc.sections.find((s) => s.kind === 'table');

    expect(table?.kind === 'table' && table.rows[0]?.[0]).toBe('15.00%');
    expect(table?.kind === 'table' && table.totals).toContain('SAR 29.35');
  });

  it('carries the gross-basis caveat onto the paper', () => {
    // A printed VAT total that looks net and is not can reach a tax return.
    // The caveat must travel with the figure, not sit on a screen it left.
    const doc = vatReportDocument(vat, context);

    expect(doc.subtitle).toMatch(/gross/i);
    expect(doc.footnote).toMatch(/net refunded VAT/i);
    expect(doc.footnote).toMatch(/does not issue tax invoices/i);
  });
});

const payments: PaymentsReport = {
  period: { from: '2026-09-01', to: '2026-09-30' },
  currency: 'SAR',
  byStatus: [{ status: 'PAID', payments: 2, capturedMinor: 21000, refundedMinor: 4000 }],
  byMethod: [{ method: 'CASH_ON_DELIVERY', payments: 1, capturedMinor: 0, refundedMinor: 0 }],
  totals: {
    payments: 2,
    capturedMinor: 21000,
    refundedMinor: 4000,
    gatewayFeesMinor: 500,
    netCapturedMinor: 16500,
  },
};

describe('paymentsReportDocument', () => {
  it('shows refunds and fees as deductions, not as takings', () => {
    const text = textOf(paymentsReportDocument(payments, context));

    expect(text).toContain('Refunded=SAR -40.00');
    expect(text).toContain('Gateway fees=SAR -5.00');
    expect(text).toContain('Net captured=SAR 165.00');
  });

  it('warns that cash on delivery may read as pending', () => {
    // COD is currently never settled by the backend, so a reader comparing
    // this against the sales report needs to know why cash shows as zero.
    expect(paymentsReportDocument(payments, context).footnote).toMatch(/cash on delivery/i);
  });
});

const order: OrderDetail = {
  id: 'o1',
  orderNumber: '1000042',
  referenceId: '822702826438',
  status: 'DELIVERED',
  paymentStatus: 'PAID',
  type: 'DELIVERY',
  branchId: 'b1',
  customerId: 'c1',
  placedAt: '2026-09-03T09:00:00Z',
  subtotalMinor: 20000,
  discountMinor: 1000,
  deliveryFeeMinor: 1500,
  chargesMinor: 0,
  taxableBaseMinor: 17826,
  vatMinor: 2674,
  vatRate: '0.15',
  totalMinor: 20500,
  statusHistory: [],
  branch: { id: 'b1', code: 'BR-001', name: 'Olaya' },
  customer: { id: 'c1', phone: '+966500000000', fullName: 'Test Customer' },
  items: [
    {
      id: 'i1',
      productId: 'p1',
      productName: 'Mixed Grill',
      quantity: 2,
      unitPriceMinor: 10000,
      totalMinor: 20000,
      modifiers: [{ id: 'm1', addonId: 'a1', addonName: 'Extra sauce', priceDeltaMinor: 0 }],
    },
  ],
};

describe('orderDocument', () => {
  it('leads with the order number and the globally unique reference', () => {
    const doc = orderDocument(order, context);

    expect(doc.title).toBe('Order 1000042');
    expect(doc.subtitle).toContain('822702826438');
  });

  it('lists add-ons under the item they belong to', () => {
    // "Grill 200.00" on a sheet where the customer paid for extras is how a
    // refund conversation turns into an argument.
    const table = orderDocument(order, context).sections.find(
      (s) => s.kind === 'table' && s.heading === 'Items',
    );

    expect(table?.kind === 'table' && table.rows[0]?.[1]).toContain('Extra sauce');
  });

  it('prints the snapshotted VAT rate, not a recomputed one', () => {
    const text = textOf(orderDocument(order, context));

    expect(text).toContain('VAT (15.00%)=SAR 26.74');
    expect(text).toContain('Total=SAR 205.00');
  });

  it('states it is not a tax invoice', () => {
    // It carries a total and a VAT line, so it looks like one. Saying so on
    // every copy is what stops it being filed as one.
    expect(orderDocument(order, context).footnote).toMatch(/not a tax invoice/i);
  });

  it('handles an order with no customer record without printing "undefined"', () => {
    const anonymous = { ...order, customer: undefined };

    expect(textOf(orderDocument(anonymous, context))).not.toContain('undefined');
  });

  it('omits the reference line rather than printing it empty', () => {
    const noReference = { ...order, referenceId: undefined };

    expect(orderDocument(noReference, context).subtitle).toBeUndefined();
  });
});

describe('ordersListDocument', () => {
  const rows = [
    {
      orderNumber: '1000001',
      referenceId: '111111111111',
      placedAt: '2026-09-03T09:00:00Z',
      type: 'PICKUP',
      status: 'DELIVERED',
      paymentStatus: 'PAID',
      totalMinor: 10000,
    },
    {
      orderNumber: '1000002',
      placedAt: '2026-09-03T10:00:00Z',
      type: 'DELIVERY',
      status: 'CANCELLED',
      paymentStatus: 'PENDING',
      totalMinor: 5000,
    },
  ];

  it('totals the value of the listed orders', () => {
    const doc = ordersListDocument(rows, periodOf(rows.map((r) => r.placedAt)), context);
    const table = doc.sections.find((s) => s.kind === 'table');

    expect(table?.kind === 'table' && table.totals).toContain('SAR 150.00');
    expect(table?.kind === 'table' && table.totals).toContain('2 orders');
  });

  it('shows a dash for an order with no reference', () => {
    const doc = ordersListDocument(rows, periodOf([]), context);
    const table = doc.sections.find((s) => s.kind === 'table');

    expect(table?.kind === 'table' && table.rows[1]?.[1]).toBe('—');
  });

  it('warns that order numbers repeat across branches', () => {
    expect(ordersListDocument(rows, periodOf([]), context).footnote).toMatch(/repeat across branches/i);
  });
});

describe('transactionsDocument', () => {
  const rows = [
    { at: '2026-09-03T09:00:00Z', kind: 'PAYMENT' as const, status: 'PAID', method: 'CARD', amountMinor: 20000 },
    { at: '2026-09-03T11:00:00Z', kind: 'REFUND' as const, status: 'COMPLETED', method: 'CARD', amountMinor: 5000 },
  ];

  it('totals payments and refunds separately, then nets them', () => {
    // A single summed column would mix money in and money out and produce a
    // number that means nothing.
    const text = textOf(transactionsDocument(rows, periodOf([]), context));

    expect(text).toContain('Payments=SAR 200.00');
    expect(text).toContain('Refunds=SAR -50.00');
    expect(text).toContain('Net=SAR 150.00');
  });

  it('signs a refund line negative so direction is visible per row', () => {
    const table = transactionsDocument(rows, periodOf([]), context).sections.find(
      (s) => s.kind === 'table',
    );

    expect(table?.kind === 'table' && table.rows[1]?.[6]).toBe('SAR -50.00');
  });

  it('says gateway fees are not deducted here', () => {
    expect(transactionsDocument(rows, periodOf([]), context).footnote).toMatch(/fees are not deducted/i);
  });
});
