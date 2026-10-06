import { describe, expect, it } from 'vitest';

import {
  DAY_NAMES,
  crossesMidnight,
  is24h,
  isUnscheduled,
  minuteToTime,
  timeToMinute,
  todayISO,
  weekFrom,
  weekProblem,
} from './openingHours';

describe('weekFrom', () => {
  /**
   * The bug that made the whole opening-hours feature inert. `GET /hours`
   * returns only the rows that exist and every branch has none, so an editor
   * that mapped straight over the response rendered a heading, a Save button
   * and nothing between them. No branch could get a first schedule, so the
   * backend had nothing to enforce.
   */
  it('gives a full week for a branch that has never had hours', () => {
    const week = weekFrom([]);
    expect(week).toHaveLength(7);
    expect(week.map((d) => d.dayOfWeek)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('survives a response that is not an array at all', () => {
    // The panel must not blank because a server sent something unexpected.
    expect(weekFrom(null)).toHaveLength(7);
    expect(weekFrom(undefined)).toHaveLength(7);
  });

  it('starts every unset day closed, never on invented trading hours', () => {
    // Defaulting to 09:00–17:00 would be this app making up when a shop opens
    // and then enforcing it against customers. Closed is the wrong an owner
    // can see; invented hours are the wrong nobody notices until a refusal.
    expect(weekFrom([]).every((d) => d.isClosed)).toBe(true);
  });

  it('keeps the days that are set, and fills in only the rest', () => {
    const week = weekFrom([{ dayOfWeek: 1, openMinute: 600, closeMinute: 1320, isClosed: false }]);
    expect(week[1]).toMatchObject({ openMinute: 600, closeMinute: 1320, isClosed: false });
    expect(week[0]?.isClosed).toBe(true);
    expect(week).toHaveLength(7);
  });

  it('orders the week Sunday-first regardless of what came back', () => {
    const week = weekFrom([
      { dayOfWeek: 5, openMinute: 600, closeMinute: 1320 },
      { dayOfWeek: 0, openMinute: 540, closeMinute: 1200 },
    ]);
    expect(week.map((d) => d.dayOfWeek)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('normalises a missing isClosed to false rather than undefined', () => {
    expect(weekFrom([{ dayOfWeek: 3, openMinute: 540, closeMinute: 1320 }])[3]?.isClosed).toBe(
      false,
    );
  });
});

describe('isUnscheduled', () => {
  it('separates "no schedule" from "a schedule that says closed"', () => {
    // The distinction the backend enforces on: no schedule means the branch
    // takes orders at any hour, and the panel has to be able to say so.
    expect(isUnscheduled([])).toBe(true);
    expect(isUnscheduled(null)).toBe(true);
    expect(isUnscheduled([{ dayOfWeek: 0, openMinute: 0, closeMinute: 0, isClosed: true }])).toBe(
      false,
    );
  });
});

describe('time conversion', () => {
  it('round-trips a wall-clock time', () => {
    expect(minuteToTime(540)).toBe('09:00');
    expect(timeToMinute('09:00')).toBe(540);
    expect(timeToMinute(minuteToTime(1337))).toBe(1337);
  });

  it('clamps rather than producing a value the backend would reject', () => {
    expect(minuteToTime(-5)).toBe('00:00');
    expect(minuteToTime(99999)).toBe('23:59');
    expect(timeToMinute('99:99')).toBe(1439);
  });

  it('reads a half-typed time as 0, never as NaN', () => {
    // NaN reaches the API as a validation error the owner cannot connect to
    // anything on the screen in front of them.
    expect(timeToMinute('')).toBe(0);
    expect(timeToMinute('nonsense')).toBe(0);
    expect(Number.isNaN(timeToMinute('1:'))).toBe(false);
  });
});

describe('is24h', () => {
  it('recognises an all-day window', () => {
    expect(is24h({ dayOfWeek: 0, openMinute: 0, closeMinute: 1439, isClosed: false })).toBe(true);
  });

  it('is never true for a closed day, whatever its times say', () => {
    expect(is24h({ dayOfWeek: 0, openMinute: 0, closeMinute: 1439, isClosed: true })).toBe(false);
  });
});

describe('crossesMidnight', () => {
  it('spots a late-night shift', () => {
    // 18:00–02:00 is an ordinary restaurant shift; the row says so rather than
    // leaving an owner to wonder whether it saved backwards.
    expect(crossesMidnight({ dayOfWeek: 5, openMinute: 1080, closeMinute: 120 })).toBe(true);
    expect(crossesMidnight({ dayOfWeek: 5, openMinute: 540, closeMinute: 1320 })).toBe(false);
  });
});

describe('weekProblem', () => {
  it('refuses a day that opens and closes at the same minute', () => {
    // The backend accepts it and then reports the branch closed all day —
    // invisible here, loud in the customer's app.
    const problem = weekProblem([
      { dayOfWeek: 2, openMinute: 600, closeMinute: 600, isClosed: false },
    ]);
    expect(problem).toContain(DAY_NAMES[2]);
  });

  it('is silent about a closed day with equal times', () => {
    expect(
      weekProblem([{ dayOfWeek: 2, openMinute: 0, closeMinute: 0, isClosed: true }]),
    ).toBeNull();
  });

  it('is silent about a normal week', () => {
    expect(weekProblem(weekFrom([]))).toBeNull();
  });
});

describe('todayISO', () => {
  it('formats the local date, not the UTC one', () => {
    // A holiday set on the 1st must not be saved as the 31st for anyone east
    // of Greenwich late in the evening.
    const lateEvening = new Date(2026, 8, 7, 23, 30);
    expect(todayISO(lateEvening)).toBe('2026-09-07');
  });

  it('pads a single-digit month and day', () => {
    expect(todayISO(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
