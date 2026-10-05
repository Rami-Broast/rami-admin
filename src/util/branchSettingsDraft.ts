import type { BranchSettings } from '../api/types';

/**
 * The delivery-pricing form's draft, and the rules for turning it into a patch.
 *
 * ## Why a draft rather than save-on-blur
 *
 * These fields used to write straight to the server when they lost focus, and
 * the panel said "Changes save automatically". That is a fine pattern right up
 * until a save fails or an owner is not sure whether one happened — and this is
 * a screen where being wrong is invisible here and loud in the customer's app:
 * a delivery radius that did not save keeps refusing customers at the old
 * distance, and nothing in the admin panel says so.
 *
 * So the form stages changes and commits them on an explicit Save. That gives
 * three things blur-saving cannot: one confirmation for a set of related edits
 * (base fee and the distance it covers are one thought, not two), a Discard
 * that actually restores, and a fee preview of what you are *about to* save
 * rather than of what is already stored.
 *
 * ## Why every field is a string
 *
 * A number input bound to a number cannot hold "empty", and empty is a real,
 * distinct value here: a blank maximum distance means "we deliver anywhere",
 * while `0` refuses every delivery. Keeping the draft as typed text is what
 * stops an empty box collapsing into a zero on its way through the form.
 */
export interface DeliveryPricingDraft {
  /** Major units as typed, e.g. "5" or "5.50". */
  deliveryFee: string;
  deliveryBaseFeeCoversKm: string;
  /** Major units as typed. */
  deliveryPerKmFee: string;
  /** Major units as typed. */
  minOrder: string;
  /** Blank means no limit — never zero. */
  deliveryRadiusKm: string;
  deliveryUpliftPercent: string;
}

/** The fields this form owns. Everything else on `BranchSettings` is untouched. */
export type DeliveryPricingPatch = Pick<
  BranchSettings,
  | 'deliveryFeeMinor'
  | 'deliveryBaseFeeCoversKm'
  | 'deliveryPerKmFeeMinor'
  | 'minOrderMinor'
  | 'deliveryRadiusKm'
  | 'deliveryUpliftPercent'
>;

/** Fills the form from what the server currently holds. */
export function toDraft(settings: BranchSettings): DeliveryPricingDraft {
  return {
    deliveryFee: majorOf(settings.deliveryFeeMinor),
    deliveryBaseFeeCoversKm: String(settings.deliveryBaseFeeCoversKm),
    deliveryPerKmFee: majorOf(settings.deliveryPerKmFeeMinor),
    minOrder: majorOf(settings.minOrderMinor),
    // Null is "no limit", and it is shown as an empty box, not as "0".
    deliveryRadiusKm: settings.deliveryRadiusKm === null ? '' : String(settings.deliveryRadiusKm),
    deliveryUpliftPercent: String(settings.deliveryUpliftPercent),
  };
}

/**
 * The payload for a draft.
 *
 * A field that cannot be read as a number falls back to what the server already
 * has, rather than to zero: a half-typed box must never quietly set a fee to
 * nothing. The maximum distance is the one field where blank is meaningful, and
 * it is the only one that can produce `null`.
 */
export function draftToPatch(
  draft: DeliveryPricingDraft,
  current: BranchSettings,
): DeliveryPricingPatch {
  return {
    deliveryFeeMinor: minorOf(draft.deliveryFee, current.deliveryFeeMinor),
    deliveryBaseFeeCoversKm: numberOf(
      draft.deliveryBaseFeeCoversKm,
      current.deliveryBaseFeeCoversKm,
    ),
    deliveryPerKmFeeMinor: minorOf(draft.deliveryPerKmFee, current.deliveryPerKmFeeMinor),
    minOrderMinor: minorOf(draft.minOrder, current.minOrderMinor),
    deliveryRadiusKm: radiusOf(draft.deliveryRadiusKm, current.deliveryRadiusKm),
    deliveryUpliftPercent: numberOf(draft.deliveryUpliftPercent, current.deliveryUpliftPercent),
  };
}

/** True when the draft would change anything. Drives the Save button. */
export function isDirty(draft: DeliveryPricingDraft, current: BranchSettings): boolean {
  const patch = draftToPatch(draft, current);
  return (Object.keys(patch) as (keyof DeliveryPricingPatch)[]).some(
    (key) => patch[key] !== current[key],
  );
}

/**
 * A blank maximum distance is `null` — "we deliver anywhere" — and never `0`,
 * which refuses every delivery. This is the single most expensive coercion on
 * the page: the branch wizard once used `parseFloat(...) || 0` here and created
 * branches that turned away every order they were ever offered.
 */
function radiusOf(value: string, fallback: number | null): number | null {
  if (value.trim() === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function numberOf(value: string, fallback: number): number {
  const parsed = Number(value);
  return value.trim() !== '' && Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/** Major units as typed → integer minor units, the only form money travels in. */
function minorOf(value: string, fallback: number): number {
  const parsed = Number(value);
  return value.trim() !== '' && Number.isFinite(parsed) && parsed >= 0
    ? Math.round(parsed * 100)
    : fallback;
}

function majorOf(minor: number): string {
  return (minor / 100).toFixed(2);
}
