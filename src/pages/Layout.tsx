import React from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';

import { BUILD_SHA, BUILT_AT, buildLabel } from '../util/buildInfo';
import { useAuth } from '../auth/AuthProvider';
import { ErrorBoundary } from '../components/ErrorBoundary';

const linkStyle = ({ isActive }: { isActive: boolean }): React.CSSProperties => ({
  padding: '8px 14px',
  borderRadius: 999,
  fontWeight: 700,
  fontSize: 14,
  color: isActive ? '#fff' : 'var(--text)',
  background: isActive ? 'var(--magenta)' : 'transparent',
  whiteSpace: 'nowrap',
});

/**
 * The two role-scoped nav sets.
 *
 * BRANCH_ADMIN's tabs match the user's explicit scope: orders received/
 * completed with full details, daily reports, and print settings. Everything
 * else — org-wide menu/coupons/loyalty/settlements/drivers/branches, cross-
 * branch dashboard and live ops — is OWNER only.
 *
 * Backend still enforces this on every request. This is the UI mirror so a
 * branch user isn't offered a link they can't use.
 */
const OWNER_NAV: { to: string; label: string }[] = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/live', label: 'Live' },
  { to: '/new-orders', label: 'New orders' },
  { to: '/orders', label: 'Orders' },
  { to: '/kitchen', label: 'Kitchen' },
  { to: '/deliveries', label: 'Deliveries' },
  { to: '/menu', label: 'Menu' },
  { to: '/payments', label: 'Payments' },
  { to: '/refunds', label: 'Refunds' },
  { to: '/coupons', label: 'Coupons' },
  { to: '/promotions', label: 'Promotions' },
  { to: '/loyalty', label: 'Loyalty' },
  { to: '/reports', label: 'Reports' },
  { to: '/driver-performance', label: 'Driver stats' },
  { to: '/branch-comparison', label: 'Compare' },
  { to: '/settlements', label: 'Settlements' },
  { to: '/cash', label: 'Cash' },
  { to: '/drivers', label: 'Drivers' },
  { to: '/customers', label: 'Customers' },
  { to: '/audit', label: 'Audit' },
  { to: '/branches', label: 'Branches' },
  { to: '/users', label: 'Users' },
  { to: '/print', label: 'Print' },
  { to: '/settings', label: 'Settings' },
];

const BRANCH_NAV: { to: string; label: string }[] = [
  { to: '/new-orders', label: 'New orders' },
  { to: '/kitchen', label: 'Kitchen' },
  { to: '/orders', label: 'Orders' },
  { to: '/deliveries', label: 'Deliveries' },
  // A branch admin holds `refunds:read`, so their own queue of customer
  // requests is theirs to see. Deciding one needs `refunds:write`, which they
  // do not hold — the page shows the queue without the buttons rather than
  // offering an action that answers 403.
  { to: '/refunds', label: 'Refunds' },
  { to: '/reports', label: 'Reports' },
  { to: '/print', label: 'Print' },
  { to: '/settings', label: 'Settings' },
];

/** App shell: top nav + routed content. */
export function Layout(): React.JSX.Element {
  const { signOut, isOwner, isBranchAdmin, actor } = useAuth();
  const { pathname } = useLocation();
  const nav = isOwner ? OWNER_NAV : isBranchAdmin ? BRANCH_NAV : OWNER_NAV;

  return (
    <div>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 20px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface)',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <img src="/logo.jpeg" alt="Rami Broast" style={{ height: 32, objectFit: 'contain', marginRight: 4 }} />
        <span
          className="chip"
          style={{
            background: isOwner ? 'var(--blue)' : 'var(--orange)',
            marginRight: 4,
          }}
          title={actor?.email ?? ''}
        >
          {isOwner ? 'Owner' : isBranchAdmin ? 'Branch' : 'Staff'}
        </span>
        <nav style={{ display: 'flex', gap: 4, flex: 1, overflowX: 'auto' }}>
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to} style={linkStyle}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        {/* Which build this is.
            A change can be merged, its CI green, and an owner still unable to
            tell whether the panel in front of them contains it — which is
            exactly what happened when this app's Vercel project stopped
            deploying and nothing on screen said so. Every bug report made under
            that uncertainty costs a round trip. */}
        <span
          className="muted"
          title={`Build ${BUILD_SHA}${BUILT_AT ? ` · ${BUILT_AT}` : ''}`}
          style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}
        >
          {buildLabel()}
        </span>
        <button className="btn btn-ghost" onClick={() => void signOut()}>
          Sign out
        </button>
      </header>
      <main style={{ maxWidth: 1200, margin: '0 auto', padding: 20 }}>
        {/* Keyed on the path so navigating away from a broken page clears the
            error: without the key the boundary would stay tripped and every
            subsequent page would show the failure of the first one. */}
        <ErrorBoundary key={pathname} title="This page couldn’t be displayed">
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
  );
}
