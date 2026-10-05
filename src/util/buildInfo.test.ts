import { describe, expect, it } from 'vitest';

import { buildLabel } from './buildInfo';

const NOW = new Date('2026-09-05T18:00:00Z');

describe('buildLabel', () => {
  it('says "today" for a build from today, so the question is answerable at a glance', () => {
    const label = buildLabel('a3f9c21', '2026-09-05T14:23:00Z', NOW);

    expect(label).toContain('a3f9c21');
    expect(label).toContain('today');
  });

  it('gives the date once the build is not from today', () => {
    // Past a day the question stops being "did my change land" and becomes
    // "how stale is this", which wants a date rather than a time.
    const label = buildLabel('a3f9c21', '2026-09-01T14:23:00Z', NOW);

    expect(label).not.toContain('today');
    expect(label).toContain('Sep');
  });

  it('falls back to the commit alone rather than printing an invalid date', () => {
    expect(buildLabel('a3f9c21', '', NOW)).toBe('a3f9c21');
    expect(buildLabel('a3f9c21', 'not a date', NOW)).toBe('a3f9c21');
  });

  it('says "local" for a build made outside CI', () => {
    // No commit is honest about a hand-made build; inventing one would be worse
    // than admitting there is nothing to compare against.
    expect(buildLabel('local', '', NOW)).toBe('local');
  });
});
