import { describe, expect, it } from 'vitest';

import { formatMinor, formatSar } from './money';

describe('formatMinor', () => {
  it('renders whole and fractional halalas', () => {
    expect(formatMinor(0)).toBe('0.00');
    expect(formatMinor(5)).toBe('0.05');
    expect(formatMinor(150)).toBe('1.50');
    expect(formatMinor(12345)).toBe('123.45');
  });

  it('pads the fractional part to two digits', () => {
    expect(formatMinor(101)).toBe('1.01');
    expect(formatMinor(110)).toBe('1.10');
  });

  it('handles negatives (a refund line)', () => {
    expect(formatMinor(-2500)).toBe('-25.00');
    expect(formatMinor(-5)).toBe('-0.05');
  });

  it('truncates non-integer input rather than rounding into halalas', () => {
    expect(formatMinor(150.9)).toBe('1.50');
  });
});

describe('formatSar', () => {
  it('prefixes the currency', () => {
    expect(formatSar(0)).toBe('SAR 0.00');
    expect(formatSar(12345)).toBe('SAR 123.45');
    expect(formatSar(-2500)).toBe('SAR -25.00');
  });
});
