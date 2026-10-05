import { describe, expect, it } from 'vitest';

import { AssignableDriver, driverOptionLabel, loadLabel, loadOf, sortByAvailability } from './driverPicker';

const driver = (name: string, overrides: Partial<AssignableDriver> = {}): AssignableDriver => ({
  id: name,
  isOnline: true,
  isAvailable: true,
  activeDeliveryCount: 0,
  user: { fullName: name },
  ...overrides,
});

describe('driverPicker', () => {
  it('puts free drivers first, then the lightest load', () => {
    const ordered = sortByAvailability([
      driver('Three', { isAvailable: false, activeDeliveryCount: 3 }),
      driver('One', { isAvailable: false, activeDeliveryCount: 1 }),
      driver('Free'),
    ]);
    expect(ordered.map((d) => d.id)).toEqual(['Free', 'One', 'Three']);
  });

  it('breaks a tie by name, so the list does not reshuffle on every poll', () => {
    const ordered = sortByAvailability([driver('Zaid'), driver('Ahmed')]);
    expect(ordered.map((d) => d.id)).toEqual(['Ahmed', 'Zaid']);
  });

  it('says nothing about a free driver’s load', () => {
    // "carrying 0 deliveries" on eleven rows out of twelve is noise.
    expect(loadLabel(driver('Free'))).toBeNull();
    expect(driverOptionLabel(driver('Free'))).toBe('Free');
  });

  it('names the load, singular and plural', () => {
    expect(loadLabel(driver('A', { isAvailable: false, activeDeliveryCount: 1 }))).toBe(
      'carrying 1 delivery',
    );
    expect(loadLabel(driver('B', { isAvailable: false, activeDeliveryCount: 2 }))).toBe(
      'carrying 2 deliveries',
    );
    expect(driverOptionLabel(driver('B', { isAvailable: false, activeDeliveryCount: 2 }))).toBe(
      'B — carrying 2 deliveries',
    );
  });

  it('falls back to the flag when an older backend sends no count', () => {
    // Not zero. A missing count is unknown, and inventing "0 deliveries" for a
    // driver the server said is busy would put them at the top of the list.
    const legacy = driver('Legacy', { isAvailable: false, activeDeliveryCount: undefined });
    expect(loadOf(legacy)).toBeNull();
    expect(loadLabel(legacy)).toBe('on a job');
    expect(sortByAvailability([legacy, driver('Free')]).map((d) => d.id)).toEqual([
      'Free',
      'Legacy',
    ]);
  });
});
