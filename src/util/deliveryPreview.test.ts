import { describe, expect, it } from 'vitest';

import { previewDeliveryFee, previewLadder, previewUpliftedPrice } from './deliveryPreview';

/**
 * The same worked examples the backend's own tests use. If these two ever
 * disagree, the settings screen is showing an owner a fee their customers will
 * not be charged — which is worse than showing no preview at all.
 */
const OWNER_DEFAULTS = { baseFeeMinor: 500, baseFeeCoversKm: 5, perKmFeeMinor: 300 };

describe('previewDeliveryFee', () => {
  it('is the base fee alone inside the covered distance', () => {
    expect(previewDeliveryFee(OWNER_DEFAULTS, 4.2).feeMinor).toBe(500);
  });

  it('is the base fee alone exactly at the covered distance', () => {
    expect(previewDeliveryFee(OWNER_DEFAULTS, 5).feeMinor).toBe(500);
  });

  it('is 11.00 at 7 km — the owner’s own worked example', () => {
    const row = previewDeliveryFee(OWNER_DEFAULTS, 7);

    expect(row.chargeableKm).toBe(2);
    expect(row.feeMinor).toBe(1100);
  });

  it('charges a started kilometre in full', () => {
    expect(previewDeliveryFee(OWNER_DEFAULTS, 5.1).feeMinor).toBe(800);
  });

  it('never goes below the base fee on a nonsense distance', () => {
    expect(previewDeliveryFee(OWNER_DEFAULTS, -4).feeMinor).toBe(500);
  });
});

describe('previewLadder', () => {
  it('anchors on the covered distance rather than a fixed 1/5/10', () => {
    // An owner whose base covers 2 km must see the step at 2, not three
    // identical rows followed by a jump.
    const ladder = previewLadder({ ...OWNER_DEFAULTS, baseFeeCoversKm: 2 });

    expect(ladder.map((r) => r.distanceKm)).toEqual([2, 3, 5, 7]);
    expect(ladder[0]?.feeMinor).toBe(500);
    expect(ladder[1]?.feeMinor).toBe(800);
  });
});

describe('a rule that has not arrived yet', () => {
  it('shows zero rather than NaN when the columns are missing', () => {
    // The deploy-ordering case: this build reaches a browser before the backend
    // that serves these columns. "NaN SAR" on the owner's settings screen is
    // the failure this guards.
    const missing = {} as unknown as {
      baseFeeMinor: number;
      baseFeeCoversKm: number;
      perKmFeeMinor: number;
    };

    expect(previewDeliveryFee(missing, 7).feeMinor).toBe(0);
    expect(previewLadder(missing).every((r) => Number.isFinite(r.feeMinor))).toBe(true);
    expect(previewUpliftedPrice(undefined as unknown as number, 8)).toBe(0);
  });
});

describe('previewUpliftedPrice', () => {
  it('leaves a price alone at zero percent', () => {
    expect(previewUpliftedPrice(3250, 0)).toBe(3250);
  });

  it('raises 32.50 to 35.10 at 8 percent', () => {
    expect(previewUpliftedPrice(3250, 8)).toBe(3510);
  });

  it('rounds to the halala, matching the backend', () => {
    expect(previewUpliftedPrice(1299, 7)).toBe(1390);
  });
});
