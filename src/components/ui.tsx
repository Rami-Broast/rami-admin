import React from 'react';

/** A colour-coded status chip. */
export function StatusChip({ label, tone }: { label: string; tone?: 'progress' | 'success' | 'danger' | 'warning' | 'neutral' }): React.JSX.Element {
  const bg =
    tone === 'success'
      ? 'var(--success)'
      : tone === 'danger'
        ? 'var(--danger)'
        : tone === 'warning'
          ? 'var(--warning)'
          : tone === 'neutral'
            ? 'var(--muted)'
            : 'var(--magenta)';
  return (
    <span className="chip" style={{ background: bg }}>
      {label}
    </span>
  );
}

/** A small live/reconnecting indicator for realtime-driven pages. */
export function LiveBadge({ status }: { status: 'connecting' | 'connected' | 'disconnected' }): React.JSX.Element {
  const map = {
    connected: { label: 'Live', color: 'var(--success)' },
    connecting: { label: 'Connecting…', color: 'var(--warning)' },
    disconnected: { label: 'Offline', color: 'var(--muted)' },
  } as const;
  const { label, color } = map[status];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)' }}>
      <span style={{ width: 8, height: 8, borderRadius: 999, background: color, display: 'inline-block' }} />
      {label}
    </span>
  );
}

/** A labelled on/off switch. */
export function Toggle({ label, value, onChange, disabled }: { label: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }): React.JSX.Element {
  return (
    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', cursor: disabled ? 'default' : 'pointer' }}>
      <span style={{ fontWeight: 600 }}>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!value)}
        style={{
          width: 46,
          height: 28,
          borderRadius: 999,
          border: 'none',
          background: value ? 'var(--magenta)' : 'var(--border)',
          position: 'relative',
          transition: 'background var(--dur-fast) var(--ease-standard)',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 3,
            left: value ? 21 : 3,
            width: 22,
            height: 22,
            borderRadius: 999,
            background: '#fff',
            transition: 'left var(--dur-fast) var(--ease-standard)',
          }}
        />
      </button>
    </label>
  );
}

/** A simple loading/error/empty wrapper for a data region. */
export function DataState({ loading, error, empty, onRetry, children }: { loading: boolean; error: string | null; empty?: boolean; onRetry?: () => void; children: React.ReactNode }): React.JSX.Element {
  if (loading) {
    return <p className="muted">Loading…</p>;
  }
  if (error) {
    return (
      <div>
        <p style={{ color: 'var(--danger)' }}>{error}</p>
        {onRetry ? (
          <button className="btn btn-ghost" onClick={onRetry}>
            Retry
          </button>
        ) : null}
      </div>
    );
  }
  if (empty) {
    return <p className="muted">Nothing here yet.</p>;
  }
  return <>{children}</>;
}

/**
 * The order's globally unique 12-digit reference, with one-click copy.
 *
 * Order numbers count per branch from 1000000, so they repeat across branches
 * and cannot identify an order on their own. This reference can, which makes
 * it the thing staff quote on a support call or paste into a search — hence
 * the copy button rather than asking anyone to retype twelve digits.
 *
 * Falls back to a dash when the reference is missing, so a page never renders
 * an empty gap for an order the API returned without one.
 */
export function OrderReference({ referenceId, label = 'Ref' }: { referenceId?: string | null; label?: string }): React.JSX.Element {
  const [copied, setCopied] = React.useState(false);

  if (!referenceId) {
    return <span className="muted">—</span>;
  }

  const copy = (): void => {
    // Clipboard access can be denied (insecure origin, permission), and a
    // failed copy must not break the page — the number stays readable and
    // selectable either way.
    void navigator.clipboard
      ?.writeText(referenceId)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => setCopied(false));
  };

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span className="muted" style={{ fontSize: 12 }}>{label}</span>
      <code style={{ fontSize: 13, letterSpacing: 0.5 }}>{referenceId}</code>
      <button
        type="button"
        className="btn btn-ghost"
        style={{ padding: '0 6px', fontSize: 11, lineHeight: '18px' }}
        onClick={copy}
        aria-label={`Copy reference ${referenceId}`}
        title="Copy reference"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </span>
  );
}
