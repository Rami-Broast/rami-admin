/**
 * A worked example of the branch's own delivery rules, for the settings screen.
 *
 * ## Why this exists, and why it is not "the app computing a price"
 *
 * Every price a customer or a staff member is shown comes from the backend
 * snapshot. This is not that. It is a preview of the rule the owner is
 * currently typing, shown next to the inputs, so "5 SAR base, 5 km, 3 SAR/km"
 * stops being three abstract numbers and becomes "a 7 km order costs 11.00".
 * Nothing here reaches an order, a customer or a payment.
 *
 * It nevertheless mirrors `priceDelivery` in the backend
 * (`src/delivery-pricing/delivery-pricing.ts`), so **if that rule changes, this
 * changes with it**. It is unit-tested against the same worked examples the
 * backend uses, which is what would catch the drift.
 */

export interface DeliveryRulePreview {
  baseFeeMinor: number;
  baseFeeCoversKm: number;
  perKmFeeMinor: number;
}

export interface PreviewRow {
  distanceKm: number;
  chargeableKm: number;
  feeMinor: number;
}

/**
 * The fee for one distance under these rules.
 *
 * Charges per **started** kilometre beyond the covered distance, exactly as the
 * backend does — 5.1 km on a 5 km base is one chargeable km, not a tenth of one.
 */
export function previewDeliveryFee(rules: DeliveryRulePreview, distanceKm: number): PreviewRow {
  // Every input is coerced, because the realistic way this breaks is not a bad
  // rule but a missing one: if this build reaches a browser before the backend
  // that serves these columns, they arrive `undefined` and an unguarded preview
  // renders "NaN SAR" on the owner's settings screen.
  const base = num(rules.baseFeeMinor);
  const covers = num(rules.baseFeeCoversKm);
  const perKm = num(rules.perKmFeeMinor);

  const distance = Math.max(0, num(distanceKm));
  const chargeableKm = Math.max(0, Math.ceil(distance - covers));

  return {
    distanceKm: distance,
    chargeableKm,
    feeMinor: base + chargeableKm * perKm,
  };
}

/** A finite number, or 0. Guards a missing column from becoming NaN on screen. */
function num(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * A short ladder of distances that shows where the fee starts to climb.
 *
 * Deliberately anchored on the covered distance rather than a fixed 1/5/10:
 * an owner who sets the base to cover 2 km needs to see the step at 2, and a
 * fixed ladder would show three identical rows and then a jump.
 */
export function previewLadder(rules: DeliveryRulePreview): PreviewRow[] {
  const covered = Math.max(0, num(rules.baseFeeCoversKm));
  const distances = [covered, covered + 1, covered + 3, covered + 5];

  return distances.map((km) => previewDeliveryFee(rules, km));
}

/**
 * The delivery price of one item under an uplift, in minor units.
 *
 * Same rounding as the backend (half away from zero, to the halala), so the
 * example price an owner sees here is the price a customer will be charged.
 */
export function previewUpliftedPrice(unitPriceMinor: number, percent: number): number {
  const price = num(unitPriceMinor);

  if (!Number.isFinite(percent) || percent <= 0 || price <= 0) {
    return price;
  }

  const raised = price * (1 + percent / 100);

  return raised < 0 ? -Math.round(-raised) : Math.round(raised);
}
