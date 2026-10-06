/**
 * Printable document builders for the admin panel.
 *
 * These turn an API response into a **structure**, not into HTML. Two reasons:
 * a structure is unit-testable without a DOM, and the numbers on a printed
 * report are the ones an owner takes to their accountant — a figure that is
 * only ever checked by looking at it on screen is a figure nobody has checked.
 *
 * Nothing here computes money. Every minor-unit amount comes from the backend
 * snapshot and is only formatted; the platform rule that the client displays
 * totals and never derives them holds on paper exactly as it does on screen.
 *
 * These print on office paper (A4) through the browser. Thermal tickets are a
 * different thing entirely and live in `kitchen-pos` — the POS owns the
 * printer, the admin panel owns the report.
 */
import type {
  OrderDetail,
  PaymentsReport,
  SalesReport,
  VatReport,
} from '../api/types';
import { formatSar, paymentMethodLabel } from '../util/money';

export type ColumnAlign = 'left' | 'right';

export interface PrintColumn {
  label: string;
  align?: ColumnAlign;
}

export type PrintSection =
  | {
      kind: 'table';
      heading?: string;
      columns: PrintColumn[];
      rows: string[][];
      /** Rendered as a bold final row — a total, not just another row. */
      totals?: string[];
      /** Shown instead of the table when there are no rows. */
      emptyText?: string;
    }
  | {
      kind: 'keyValues';
      heading?: string;
      items: { label: string; value: string; strong?: boolean }[];
    }
  | { kind: 'note'; text: string };

export interface PrintDocument {
  /** Document heading, and the browser's print-dialog document name. */
  title: string;
  subtitle?: string;
  /** Logo URL to show at the top of the printed page. */
  logoUrl?: string;
  /** Header facts: period, branch, who printed it, when. */
  meta: { label: string; value: string }[];
  sections: PrintSection[];
  /** Printed small at the foot — caveats that must travel with the numbers. */
  footnote?: string;
  /** Timestamp for the bottom of the page, with seconds. */
  generatedAt?: string;
}

/** A readable date-time with seconds for reports. */
function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) { return iso; }
  const pad = (n: number): string => String(n).padStart(2, '0');
  return (
    `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

function formatDate(iso: string): string {
  const date = new Date(iso);

  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString();
}

/** Turns an enum-ish backend value into something a person reads. */
export function humanise(value: string | null | undefined): string {
  if (!value) {
    return '—';
  }

  return value
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export interface DocumentContext {
  /** Branch name, or "All branches" when the report is organisation-wide. */
  branchLabel: string;
  /** Who ran it — a printed report with no attribution invites arguments. */
  printedBy?: string;
  /** Injectable so tests are not time-dependent. */
  now?: Date;
}

function headerMeta(
  period: { from: string; to: string },
  context: DocumentContext,
): { label: string; value: string }[] {
  const meta = [
    { label: 'Period', value: `${formatDate(period.from)} — ${formatDate(period.to)}` },
    { label: 'Branch', value: context.branchLabel },
    { label: 'Printed', value: formatDateTime((context.now ?? new Date()).toISOString()) },
  ];

  if (context.printedBy) {
    meta.push({ label: 'Printed by', value: context.printedBy });
  }

  return meta;
}

/**
 * The span a set of timestamps actually covers.
 *
 * A filtered list has no chosen date range, so its printed header reports the
 * span of the rows on the page rather than inventing one. An empty set falls
 * back to today, which is the only honest answer.
 */
export function periodOf(timestamps: readonly string[]): { from: string; to: string } {
  const times = timestamps
    .map((value) => new Date(value).getTime())
    .filter((value) => !Number.isNaN(value));

  if (times.length === 0) {
    const today = new Date().toISOString();

    return { from: today, to: today };
  }

  return {
    from: new Date(Math.min(...times)).toISOString(),
    to: new Date(Math.max(...times)).toISOString(),
  };
}

const LOGO_URL = '/logo.jpeg';

function generatedTimestamp(context: DocumentContext): string {
  return formatDateTime((context.now ?? new Date()).toISOString());
}

// --- Reports ---------------------------------------------------------------

export function salesReportDocument(report: SalesReport, context: DocumentContext): PrintDocument {
  const { realised } = report;

  return {
    title: 'Sales report',
    logoUrl: LOGO_URL,
    meta: headerMeta(report.period, context),
    generatedAt: generatedTimestamp(context),
    sections: [
      {
        kind: 'keyValues',
        heading: 'Realised sales',
        items: [
          { label: 'Orders', value: String(realised.orders) },
          { label: 'Subtotal', value: formatSar(realised.subtotalMinor) },
          { label: 'Discounts', value: formatSar(-realised.discountMinor) },
          { label: 'Delivery fees', value: formatSar(realised.deliveryFeeMinor) },
          { label: 'Other charges', value: formatSar(realised.chargesMinor) },
          { label: 'Taxable base', value: formatSar(realised.taxableBaseMinor) },
          { label: 'VAT', value: formatSar(realised.vatMinor) },
          { label: 'Total', value: formatSar(realised.totalMinor), strong: true },
        ],
      },
      {
        kind: 'table',
        heading: 'Orders by status',
        columns: [
          { label: 'Status' },
          { label: 'Orders', align: 'right' },
          { label: 'Value', align: 'right' },
        ],
        rows: report.statusBreakdown.map((row) => [
          humanise(row.status),
          String(row.orders),
          formatSar(row.totalMinor),
        ]),
        emptyText: 'No orders in this period.',
      },
      {
        kind: 'table',
        heading: 'Charges',
        columns: [
          { label: 'Charge' },
          { label: 'Count', align: 'right' },
          { label: 'VAT', align: 'right' },
          { label: 'Total', align: 'right' },
        ],
        rows: report.charges.map((row) => [
          row.name,
          String(row.count),
          formatSar(row.vatMinor),
          formatSar(row.totalMinor),
        ]),
        emptyText: 'No charges applied in this period.',
      },
    ],
    footnote:
      'Realised sales count confirmed orders onward, including refunded ones. Orders still awaiting payment, failed or cancelled are excluded from revenue and shown in the status breakdown only.',
  };
}

export function vatReportDocument(report: VatReport, context: DocumentContext): PrintDocument {
  const totalVat = report.byRate.reduce((sum, row) => sum + row.vatMinor, 0);
  const totalBase = report.byRate.reduce((sum, row) => sum + row.taxableBaseMinor, 0);

  return {
    title: 'VAT report',
    subtitle: 'Gross output VAT',
    logoUrl: LOGO_URL,
    meta: headerMeta(report.period, context),
    generatedAt: generatedTimestamp(context),
    sections: [
      {
        kind: 'table',
        heading: 'By VAT rate',
        columns: [
          { label: 'Rate' },
          { label: 'Orders', align: 'right' },
          { label: 'Taxable base', align: 'right' },
          { label: 'VAT', align: 'right' },
          { label: 'Total', align: 'right' },
        ],
        rows: report.byRate.map((row) => [
          `${(Number(row.vatRate) * 100).toFixed(2)}%`,
          String(row.orders),
          formatSar(row.taxableBaseMinor),
          formatSar(row.vatMinor),
          formatSar(row.totalMinor),
        ]),
        totals: ['Total', '', formatSar(totalBase), formatSar(totalVat), ''],
        emptyText: 'No VAT-bearing sales in this period.',
      },
    ],
    // This caveat must never be separated from the figure. A printed VAT total
    // that looks net, and is not, is the kind of thing that reaches a tax
    // return before anyone notices.
    footnote: `${report.note} This platform does not issue tax invoices or credit notes — net refunded VAT from the restaurant's own invoicing records before filing.`,
  };
}

export function paymentsReportDocument(
  report: PaymentsReport,
  context: DocumentContext,
): PrintDocument {
  const { totals } = report;

  return {
    title: 'Payments report',
    logoUrl: LOGO_URL,
    meta: headerMeta(report.period, context),
    generatedAt: generatedTimestamp(context),
    sections: [
      {
        kind: 'keyValues',
        heading: 'Totals',
        items: [
          { label: 'Payments', value: String(totals.payments) },
          { label: 'Captured', value: formatSar(totals.capturedMinor) },
          { label: 'Refunded', value: formatSar(-totals.refundedMinor) },
          { label: 'Gateway fees', value: formatSar(-totals.gatewayFeesMinor) },
          { label: 'Net captured', value: formatSar(totals.netCapturedMinor), strong: true },
        ],
      },
      {
        kind: 'table',
        heading: 'By method',
        columns: [
          { label: 'Method' },
          { label: 'Payments', align: 'right' },
          { label: 'Captured', align: 'right' },
          { label: 'Refunded', align: 'right' },
        ],
        rows: report.byMethod.map((row) => [
          paymentMethodLabel(row.method),
          String(row.payments),
          formatSar(row.capturedMinor),
          formatSar(row.refundedMinor),
        ]),
        emptyText: 'No payments in this period.',
      },
      {
        kind: 'table',
        heading: 'By status',
        columns: [
          { label: 'Status' },
          { label: 'Payments', align: 'right' },
          { label: 'Captured', align: 'right' },
          { label: 'Refunded', align: 'right' },
        ],
        rows: report.byStatus.map((row) => [
          humanise(row.status),
          String(row.payments),
          formatSar(row.capturedMinor),
          formatSar(row.refundedMinor),
        ]),
        emptyText: 'No payments in this period.',
      },
    ],
    footnote:
      'Cash on delivery is captured by the driver at the door and may show as pending here until it is settled; reconcile cash against the delivery cash-collection records.',
  };
}

// --- Orders ----------------------------------------------------------------

/** One order, in full — the sheet stapled to a dispute or a refund request. */
export function orderDocument(order: OrderDetail, context: DocumentContext): PrintDocument {
  const items: PrintSection = {
    kind: 'table',
    heading: 'Items',
    columns: [
      { label: 'Qty', align: 'right' },
      { label: 'Item' },
      { label: 'Unit', align: 'right' },
      { label: 'Line total', align: 'right' },
    ],
    rows: order.items.map((item) => [
      String(item.quantity),
      // Add-ons belong under the item they were chosen for: a line reading
      // "Grill 115.00" when the customer paid for extra cheese is the sort of
      // gap that turns a refund conversation into an argument.
      [item.productName, ...item.modifiers.map((m) => `+ ${m.addonName}`)].join('\n'),
      formatSar(item.unitPriceMinor),
      formatSar(item.totalMinor),
    ]),
    emptyText: 'This order has no items.',
  };

  return {
    title: `Order ${order.orderNumber}`,
    subtitle: order.referenceId ? `Reference ${order.referenceId}` : undefined,
    logoUrl: LOGO_URL,
    meta: [
      { label: 'Placed', value: formatDateTime(order.placedAt) },
      { label: 'Branch', value: order.branch?.name ?? context.branchLabel },
      { label: 'Type', value: humanise(order.type) },
      { label: 'Status', value: humanise(order.status) },
      { label: 'Payment', value: humanise(order.paymentStatus) },
      { label: 'Printed', value: formatDateTime((context.now ?? new Date()).toISOString()) },
    ],
    generatedAt: generatedTimestamp(context),
    sections: [
      {
        kind: 'keyValues',
        heading: 'Customer',
        items: [
          { label: 'Name', value: order.customer?.fullName ?? '—' },
          { label: 'Phone', value: order.customer?.phone ?? '—' },
        ],
      },
      items,
      {
        kind: 'keyValues',
        heading: 'Totals',
        items: [
          { label: 'Subtotal', value: formatSar(order.subtotalMinor) },
          { label: 'Discount', value: formatSar(-order.discountMinor) },
          { label: 'Delivery fee', value: formatSar(order.deliveryFeeMinor) },
          { label: 'Charges', value: formatSar(order.chargesMinor) },
          { label: 'Taxable base', value: formatSar(order.taxableBaseMinor) },
          {
            label: `VAT (${(Number(order.vatRate) * 100).toFixed(2)}%)`,
            value: formatSar(order.vatMinor),
          },
          { label: 'Total', value: formatSar(order.totalMinor), strong: true },
        ],
      },
      ...(order.customerNotes
        ? [{ kind: 'note' as const, text: `Customer note: ${order.customerNotes}` }]
        : []),
    ],
    // Said plainly on every copy, because a document with a total and a VAT
    // line looks like a tax invoice and must not be filed as one.
    footnote:
      'This is an internal order record, not a tax invoice. The restaurant issues its ZATCA tax invoice separately.',
  };
}

/** Rows as the orders list shows them — for a shift handover or an audit pull. */
export interface OrdersListRow {
  orderNumber: string;
  referenceId?: string;
  placedAt: string;
  branchName?: string;
  type: string;
  status: string;
  paymentStatus: string;
  totalMinor: number;
}

export function ordersListDocument(
  rows: readonly OrdersListRow[],
  period: { from: string; to: string },
  context: DocumentContext,
): PrintDocument {
  const total = rows.reduce((sum, row) => sum + row.totalMinor, 0);

  return {
    title: 'Orders',
    logoUrl: LOGO_URL,
    meta: [...headerMeta(period, context), { label: 'Orders', value: String(rows.length) }],
    generatedAt: generatedTimestamp(context),
    sections: [
      {
        kind: 'table',
        columns: [
          { label: 'Order' },
          { label: 'Reference' },
          { label: 'Placed' },
          { label: 'Type' },
          { label: 'Status' },
          { label: 'Payment' },
          { label: 'Total', align: 'right' },
        ],
        rows: rows.map((row) => [
          row.orderNumber,
          row.referenceId ?? '—',
          formatDateTime(row.placedAt),
          humanise(row.type),
          humanise(row.status),
          humanise(row.paymentStatus),
          formatSar(row.totalMinor),
        ]),
        totals: ['', '', '', '', '', `${rows.length} orders`, formatSar(total)],
        emptyText: 'No orders matched this filter.',
      },
    ],
    footnote:
      'Order numbers count per branch and repeat across branches — the 12-digit reference is what identifies one order platform-wide.',
  };
}

/** Payment and refund movements — the transactions sheet. */
export interface TransactionRow {
  at: string;
  orderNumber?: string;
  referenceId?: string;
  kind: 'PAYMENT' | 'REFUND';
  method?: string | null;
  status: string;
  amountMinor: number;
}

export function transactionsDocument(
  rows: readonly TransactionRow[],
  period: { from: string; to: string },
  context: DocumentContext,
): PrintDocument {
  // Payments and refunds move money in opposite directions, so a single column
  // of amounts would sum to a meaningless number. They are totalled separately.
  const captured = rows
    .filter((row) => row.kind === 'PAYMENT')
    .reduce((sum, row) => sum + row.amountMinor, 0);
  const refunded = rows
    .filter((row) => row.kind === 'REFUND')
    .reduce((sum, row) => sum + row.amountMinor, 0);

  return {
    title: 'Transactions',
    logoUrl: LOGO_URL,
    meta: [...headerMeta(period, context), { label: 'Movements', value: String(rows.length) }],
    generatedAt: generatedTimestamp(context),
    sections: [
      {
        kind: 'table',
        columns: [
          { label: 'When' },
          { label: 'Order' },
          { label: 'Reference' },
          { label: 'Type' },
          { label: 'Method' },
          { label: 'Status' },
          { label: 'Amount', align: 'right' },
        ],
        rows: rows.map((row) => [
          formatDateTime(row.at),
          row.orderNumber ?? '—',
          row.referenceId ?? '—',
          humanise(row.kind),
          paymentMethodLabel(row.method),
          humanise(row.status),
          // Signed, so the direction of each movement is visible per row
          // rather than only in the totals below.
          formatSar(row.kind === 'REFUND' ? -row.amountMinor : row.amountMinor),
        ]),
        emptyText: 'No transactions in this period.',
      },
      {
        kind: 'keyValues',
        heading: 'Movement totals',
        items: [
          { label: 'Payments', value: formatSar(captured) },
          { label: 'Refunds', value: formatSar(-refunded) },
          { label: 'Net', value: formatSar(captured - refunded), strong: true },
        ],
      },
    ],
    footnote:
      'Amounts are the movements recorded against each payment. Gateway fees are not deducted here — see the payments report for net captured.',
  };
}
