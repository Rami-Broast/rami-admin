import React from 'react';

import { useTheme } from '../theme/ThemeProvider';
import { APP_VERSION } from '../version';

export function SettingsPage(): React.JSX.Element {
  const { theme, toggle } = useTheme();
  const isDark = theme === 'dark';

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Settings</h1>

      <div className="card" style={{ maxWidth: 520 }}>
        <h3 style={{ marginTop: 0 }}>Appearance</h3>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 600 }}>Dark mode</div>
            <div className="muted" style={{ fontSize: 14, marginTop: 2 }}>
              {isDark ? 'Dark theme is active' : 'Switch to dark theme'}
            </div>
          </div>
          <button
            onClick={toggle}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            style={{
              width: 52,
              height: 28,
              borderRadius: 14,
              border: 'none',
              background: isDark ? 'var(--magenta)' : 'var(--border)',
              position: 'relative',
              cursor: 'pointer',
              transition: 'background var(--dur-fast) var(--ease-standard)',
            }}
          >
            <span
              style={{
                position: 'absolute',
                top: 3,
                left: isDark ? 27 : 3,
                width: 22,
                height: 22,
                borderRadius: 11,
                background: '#fff',
                transition: 'left var(--dur-normal) var(--ease-standard)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 13,
              }}
            >
              {isDark ? '🌙' : '☀️'}
            </span>
          </button>
        </div>
      </div>

      <p className="muted" style={{ marginTop: 24, fontSize: 13 }}>
        Rami Broast Admin · v{APP_VERSION}
      </p>
    </div>
  );
}
