import React from 'react';

/** Two <input type=date> controls that update `from`/`to` (ISO date, UTC-safe). */
export function DateRange({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}): React.JSX.Element {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span className="muted" style={{ fontSize: 12 }}>From</span>
        <input
          type="date"
          value={from.slice(0, 10)}
          onChange={(e) => onChange(`${e.target.value}T00:00:00.000Z`, to)}
          style={{ width: 160 }}
        />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span className="muted" style={{ fontSize: 12 }}>To</span>
        <input
          type="date"
          value={to.slice(0, 10)}
          onChange={(e) => onChange(from, `${e.target.value}T23:59:59.999Z`)}
          style={{ width: 160 }}
        />
      </label>
    </div>
  );
}

/** Sensible default: the last 30 days ending today (UTC). */
export function defaultRange(): { from: string; to: string } {
  return lastDays(30);
}

function lastDays(days: number): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - days);
  from.setUTCHours(0, 0, 0, 0);
  const to = new Date(now);
  to.setUTCHours(23, 59, 59, 999);
  return { from: from.toISOString(), to: to.toISOString() };
}

function startOf(kind: 'day' | 'week' | 'month', offsetDays = 0): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setUTCDate(from.getUTCDate() - offsetDays);
  if (kind === 'day') {
    from.setUTCHours(0, 0, 0, 0);
  } else if (kind === 'week') {
    // ISO week — Monday start (UTC).
    const day = from.getUTCDay() || 7;
    from.setUTCDate(from.getUTCDate() - (day - 1));
    from.setUTCHours(0, 0, 0, 0);
  } else {
    from.setUTCDate(1);
    from.setUTCHours(0, 0, 0, 0);
  }
  if (offsetDays > 0) {
    // "yesterday" — clip `to` to end-of-yesterday.
    const y = new Date();
    y.setUTCDate(y.getUTCDate() - offsetDays);
    y.setUTCHours(23, 59, 59, 999);
    return { from: from.toISOString(), to: y.toISOString() };
  }
  to.setUTCHours(23, 59, 59, 999);
  return { from: from.toISOString(), to: to.toISOString() };
}

export const DATE_PRESETS: { label: string; get: () => { from: string; to: string } }[] = [
  { label: 'Today', get: () => startOf('day') },
  { label: 'Yesterday', get: () => startOf('day', 1) },
  { label: 'This week', get: () => startOf('week') },
  { label: 'This month', get: () => startOf('month') },
  { label: 'Last 30d', get: () => lastDays(30) },
];

/** Quick chip row that shortcuts common ranges. */
export function DatePresets({
  onPick,
}: {
  onPick: (range: { from: string; to: string }) => void;
}): React.JSX.Element {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {DATE_PRESETS.map((p) => (
        <button
          key={p.label}
          type="button"
          className="btn btn-ghost"
          onClick={() => onPick(p.get())}
          style={{ padding: '4px 12px', fontSize: 13 }}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
