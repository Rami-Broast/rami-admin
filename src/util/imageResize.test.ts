import { describe, expect, it } from 'vitest';

import { scaledDimensions } from './imageResize';

describe('scaledDimensions', () => {
  it('leaves an image that already fits unchanged', () => {
    expect(scaledDimensions(800, 600, 1600)).toEqual({ width: 800, height: 600 });
    // Exactly at the limit is still "fits".
    expect(scaledDimensions(1600, 900, 1600)).toEqual({ width: 1600, height: 900 });
  });

  it('scales the longer edge down to the limit, preserving aspect ratio', () => {
    // Landscape: width is the longer edge.
    expect(scaledDimensions(4000, 2000, 1600)).toEqual({ width: 1600, height: 800 });
    // Portrait: height is the longer edge.
    expect(scaledDimensions(2000, 4000, 1600)).toEqual({ width: 800, height: 1600 });
  });

  it('rounds and never produces a zero edge', () => {
    // A very wide panorama still keeps at least 1px of height.
    expect(scaledDimensions(16000, 100, 1600)).toEqual({ width: 1600, height: 10 });
    const r = scaledDimensions(3000, 3001, 1600);
    expect(Number.isInteger(r.width)).toBe(true);
    expect(Number.isInteger(r.height)).toBe(true);
  });

  it('is defensive about nonsense input rather than dividing by zero', () => {
    expect(scaledDimensions(0, 0, 1600)).toEqual({ width: 0, height: 0 });
    expect(scaledDimensions(Number.NaN, 10, 1600)).toEqual({ width: Number.NaN, height: 10 });
  });
});
