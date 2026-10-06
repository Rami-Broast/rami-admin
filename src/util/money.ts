/** Money formatting — integer minor units (halalas), SAR. Mirrors the backend. */
export function formatMinor(amountMinor: number): string {
  const negative = amountMinor < 0;
  const abs = Math.abs(Math.trunc(amountMinor));
  const body = `${Math.floor(abs / 100)}.${(abs % 100).toString().padStart(2, '0')}`;
  return negative ? `-${body}` : body;
}

export function formatSar(amountMinor: number | string): string {
  const n = typeof amountMinor === 'string' ? Number(amountMinor) : amountMinor;
  return `SAR ${formatMinor(Number.isFinite(n) ? n : 0)}`;
}

/** Parse a user-typed decimal SAR string ("12.34") into minor units. */
export function parseSarToMinor(input: string): number {
  const clean = input.trim().replace(/[^\d.-]/g, '');
  const n = parseFloat(clean || '0');
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

/**
 * How a payment method is written on screen and in a printed report.
 *
 * The two cash methods are the reason this exists. `CASH` is taken at the
 * counter on a Branch POS order; `CASH_ON_DELIVERY` is collected by a driver at
 * the door. They reconcile differently and sit in different tills, so a report
 * that renders both as "Cash" is wrong about where the money is. Raw enum names
 * shown verbatim ("CASH_ON_DELIVERY") made them look like the same thing typed
 * two ways.
 *
 * Falls back to the humanised enum name for a method the backend adds later, so
 * a new value is readable rather than blank.
 */
const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CARD: 'Card',
  MADA: 'mada',
  APPLE_PAY: 'Apple Pay',
  GOOGLE_PAY: 'Google Pay',
  CASH_ON_DELIVERY: 'Cash on delivery',
  CASH: 'Cash at counter',
};

export function paymentMethodLabel(method: string | null | undefined): string {
  if (!method) {
    return '—';
  }
  return (
    PAYMENT_METHOD_LABELS[method] ??
    method
      .toLowerCase()
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')
  );
}
