import { describe, expect, it } from 'vitest';

import type { BranchSettings } from '../api/types';
import { draftToPatch, isDirty, toDraft } from './branchSettingsDraft';

const SETTINGS: BranchSettings = {
  acceptsDelivery: true,
  acceptsPickup: true,
  isAcceptingOrders: true,
  acceptsCashOnDelivery: true,
  autoAcceptOrders: false,
  deliveryFeeMinor: 500,
  deliveryBaseFeeCoversKm: 5,
  deliveryPerKmFeeMinor: 300,
  deliveryRoadFactor: 1.3,
  deliveryUpliftPercent: 0,
  minOrderMinor: 4000,
  deliveryRadiusKm: 1,
  prepTimeMinutes: 25,
};

describe('toDraft', () => {
  it('shows money in major units and no limit as an empty box', () => {
    const draft = toDraft(SETTINGS);

    expect(draft.deliveryFee).toBe('5.00');
    expect(draft.minOrder).toBe('40.00');
    expect(draft.deliveryRadiusKm).toBe('1');
    // Null is "we deliver anywhere". Rendering it as "0" would read as a
    // branch that delivers nowhere.
    expect(toDraft({ ...SETTINGS, deliveryRadiusKm: null }).deliveryRadiusKm).toBe('');
  });
});

describe('draftToPatch', () => {
  it('converts money back to integer minor units', () => {
    const patch = draftToPatch({ ...toDraft(SETTINGS), deliveryFee: '7.50' }, SETTINGS);
    expect(patch.deliveryFeeMinor).toBe(750);
  });

  it('sends null for a blank maximum distance, never zero', () => {
    // The most expensive coercion on the page: `|| 0` here once created
    // branches that refused every delivery they were ever offered.
    const patch = draftToPatch({ ...toDraft(SETTINGS), deliveryRadiusKm: '' }, SETTINGS);
    expect(patch.deliveryRadiusKm).toBeNull();
  });

  it('sends the owner-confirmed 25 km when it is typed', () => {
    const patch = draftToPatch({ ...toDraft(SETTINGS), deliveryRadiusKm: '25' }, SETTINGS);
    expect(patch.deliveryRadiusKm).toBe(25);
  });

  it('keeps a real zero where zero is a real choice', () => {
    // An uplift of 0 means "never raise prices on delivery" — a decision, not
    // an empty field.
    const patch = draftToPatch({ ...toDraft(SETTINGS), deliveryUpliftPercent: '0' }, SETTINGS);
    expect(patch.deliveryUpliftPercent).toBe(0);
  });

  it('falls back to the stored value rather than zeroing a half-typed field', () => {
    // Mid-edit a box can hold "" or "-" or "1.". None of those is an
    // instruction to make the fee nothing.
    for (const bad of ['', '-', 'abc', '-5']) {
      const patch = draftToPatch({ ...toDraft(SETTINGS), deliveryFee: bad }, SETTINGS);
      expect(patch.deliveryFeeMinor).toBe(500);
    }
  });
});

describe('isDirty', () => {
  it('is false for an untouched form', () => {
    expect(isDirty(toDraft(SETTINGS), SETTINGS)).toBe(false);
    // Retyping the same number in a different shape is not a change.
    expect(isDirty({ ...toDraft(SETTINGS), deliveryFee: '5' }, SETTINGS)).toBe(false);
  });

  it('is true once a value would actually change', () => {
    expect(isDirty({ ...toDraft(SETTINGS), deliveryRadiusKm: '25' }, SETTINGS)).toBe(true);
    expect(isDirty({ ...toDraft(SETTINGS), deliveryRadiusKm: '' }, SETTINGS)).toBe(true);
  });
});
