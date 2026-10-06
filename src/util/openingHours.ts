/**
 * Turning what the server stores into a week an owner can actually edit.
 *
 * The hours editor existed and could not be used. `GET /branches/:id/hours`
 * returns **only the rows that exist**, the editor mapped straight over them,
 * and every branch on the platform has none — so the panel rendered a heading,
 * a Save button and nothing between them. There was no way to add a day, which
 * meant no branch could ever get its first schedule, which is why the whole
 * opening-hours feature was dead: the backend enforced nothing because nothing
 * could ever be set.
 *
 * `weekFrom` is the fix and it is deliberately pure. A screen that renders a
 * seven-row form is easy to eyeball and hard to test; the question "does an
 * empty response still produce seven days" is neither.
 */

export interface OpeningHoursEntry {
  /** 0 = Sunday … 6 = Saturday. */
  dayOfWeek: number;
  openMinute: number;
  closeMinute: number;
  isClosed?: boolean;
}

export const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

/**
 * What an unset day starts as: **closed**, not 09:00–17:00.
 *
 * A default of "open" would be this app inventing trading hours on the owner's
 * behalf and then enforcing them against their customers. Closed is the
 * direction that is visibly wrong rather than quietly wrong — an owner who
 * leaves a day untouched sees "Closed" and fixes it, where they would never
 * notice invented hours until a customer was refused inside them.
 *
 * The times are still filled in so the pickers have something to show the
 * moment the day is switched on.
 */
const UNSET_DAY: Omit<OpeningHoursEntry, 'dayOfWeek'> = {
  openMinute: 9 * 60,
  closeMinute: 23 * 60,
  isClosed: true,
};

/**
 * Seven days, in order, whatever the server sent.
 *
 * A day the server has no row for comes back closed and editable rather than
 * absent. Multiple rows for one day — a split shift, which the backend supports
 * — collapse to the first; the editor is a one-window-per-day form and
 * pretending otherwise would let it silently drop the second window on save.
 * A branch running split shifts keeps them until someone edits that day here.
 */
export function weekFrom(stored: readonly OpeningHoursEntry[] | null | undefined): OpeningHoursEntry[] {
  const rows = Array.isArray(stored) ? stored : [];
  return DAY_NAMES.map((_, dayOfWeek) => {
    const found = rows.find((r) => r.dayOfWeek === dayOfWeek);
    return found
      ? { ...found, dayOfWeek, isClosed: found.isClosed ?? false }
      : { dayOfWeek, ...UNSET_DAY };
  });
}

/** True when the branch has genuinely never had hours set. */
export function isUnscheduled(stored: readonly OpeningHoursEntry[] | null | undefined): boolean {
  return !Array.isArray(stored) || stored.length === 0;
}

/** `540` → `"09:00"`, for a `<input type="time">`. */
export function minuteToTime(minute: number): string {
  const m = Number.isFinite(minute) ? Math.max(0, Math.min(1439, Math.trunc(minute))) : 0;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * `"09:00"` → `540`.
 *
 * An unreadable value falls back to `0` rather than `NaN`: a half-typed time
 * must not be saved as a number the backend rejects with a validation error the
 * owner cannot connect to anything on screen.
 */
export function timeToMinute(value: string): number {
  const parts = value.split(':').map(Number);
  const hours = Number.isFinite(parts[0]) ? (parts[0] as number) : 0;
  const mins = Number.isFinite(parts[1]) ? (parts[1] as number) : 0;
  return Math.max(0, Math.min(1439, hours * 60 + mins));
}

/** Open all day — the shape the "24h" shortcut writes. */
export function is24h(entry: OpeningHoursEntry): boolean {
  return !entry.isClosed && entry.openMinute === 0 && entry.closeMinute === 1439;
}

/**
 * True when the window runs past midnight — 18:00–02:00 is an ordinary
 * restaurant shift, and the backend honours it (the late half is read off the
 * previous day's row). Worth saying on screen, because a form that shows
 * "18:00 – 02:00" with no comment looks like a typo.
 */
export function crossesMidnight(entry: OpeningHoursEntry): boolean {
  return !entry.isClosed && entry.closeMinute < entry.openMinute;
}

/**
 * What is wrong with this week, in words, or null.
 *
 * Only one thing is genuinely wrong: a day that is open for zero minutes. The
 * backend would accept it and then report the branch closed all day, which is
 * the kind of setting whose effect is invisible here and loud in a customer's
 * app — the same failure the delivery-radius field was fixed for.
 */
export function weekProblem(week: readonly OpeningHoursEntry[]): string | null {
  const zeroLength = week.find((d) => !d.isClosed && d.openMinute === d.closeMinute);
  if (zeroLength) {
    return `${DAY_NAMES[zeroLength.dayOfWeek]} opens and closes at the same time. Mark it closed, or give it a window.`;
  }
  return null;
}

/** `"2026-09-07"` for a `<input type="date">`, in the viewer's own timezone. */
export function todayISO(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
