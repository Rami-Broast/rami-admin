import { waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { authState, makeApi, paged, renderPage, BRANCH_ACTOR } from '../test/harness';

/**
 * Mounts every admin page against a stubbed API.
 *
 * This app had 47 tests and not one of them rendered a page — in the app where
 * refunds are issued, staff accounts are created and branches are closed. A
 * render error unmounts React's whole tree, so a single unexpected null turns a
 * page into a blank screen; the `ErrorBoundary` added earlier keeps that local
 * but does not make the page work.
 *
 * Every response here is **empty**: no branches, no orders, no users, no
 * report rows. A page that renders against a comfortable fixture is not known
 * to survive the first morning at a new branch, and the empty state is the one
 * a real user meets first.
 */

vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({
    api: authState.api,
    actor: authState.actor,
    isAuthenticated: true,
    isOwner: authState.actor.roles.includes('OWNER'),
    isBranchAdmin: authState.actor.roles.includes('BRANCH_ADMIN'),
    hasRole: (r: string) => authState.actor.roles.includes(r),
    hasPermission: () => true,
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// The realtime client opens a socket on mount. A page test has no server, and
// a failed connection retries on a timer that outlives the test.
vi.mock('../realtime/RealtimeProvider', () => ({
  useRealtime: () => ({ status: 'connected', subscribe: () => () => {} }),
  useRealtimeReload: () => 'connected',
  RealtimeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { AuditLogPage } from './AuditLogPage';
import { BannersPage } from './BannersPage';
import { BranchComparisonPage } from './BranchComparisonPage';
import { BranchSettingsPage } from './BranchSettingsPage';
import { BranchWizardPage } from './BranchWizardPage';
import { CashReconciliationPage } from './CashReconciliationPage';
import { CouponsPage } from './CouponsPage';
import { CustomerAppPage } from './CustomerAppPage';
import { CustomersPage } from './CustomersPage';
import { DashboardPage } from './DashboardPage';
import { DeliveriesPage } from './DeliveriesPage';
import { DriverPerformancePage } from './DriverPerformancePage';
import { DriversPage } from './DriversPage';
import { LiveOpsPage } from './LiveOpsPage';
import { LoginPage } from './LoginPage';
import { LoyaltyPage } from './LoyaltyPage';
import { MenuPage } from './MenuPage';
import { NewOrdersPage } from './NewOrdersPage';
import { OrderDetailPage } from './OrderDetailPage';
import { OrdersListPage } from './OrdersListPage';
import { OrdersPage } from './OrdersPage';
import { PaymentsPage } from './PaymentsPage';
import { RefundsPage } from './RefundsPage';
import { PricingPage } from './PricingPage';
import { PrintSettingsPage } from './PrintSettingsPage';
import { PromotionsPage } from './PromotionsPage';
import { ReportsPage } from './ReportsPage';
import { SettingsPage } from './SettingsPage';
import { SettlementsPage } from './SettlementsPage';

beforeEach(() => {
  authState.api = makeApi();
});

const PAGES: [string, () => React.ReactElement][] = [
  ['Login', () => <LoginPage />],
  ['Dashboard', () => <DashboardPage />],
  ['LiveOps', () => <LiveOpsPage />],
  ['NewOrders', () => <NewOrdersPage />],
  ['Orders (kitchen)', () => <OrdersPage />],
  ['OrdersList', () => <OrdersListPage onOpen={() => {}} />],
  ['OrderDetail', () => <OrderDetailPage />],
  ['Deliveries', () => <DeliveriesPage />],
  ['Menu', () => <MenuPage />],
  ['Payments', () => <PaymentsPage />],
  ['Refunds', () => <RefundsPage />],
  ['Coupons', () => <CouponsPage />],
  ['Promotions', () => <PromotionsPage />],
  ['Loyalty', () => <LoyaltyPage />],
  ['Reports', () => <ReportsPage />],
  ['BranchComparison', () => <BranchComparisonPage />],
  ['Settlements', () => <SettlementsPage />],
  ['Drivers', () => <DriversPage />],
  ['DriverPerformance', () => <DriverPerformancePage />],
  ['BranchSettings', () => <BranchSettingsPage />],
  ['BranchWizard', () => <BranchWizardPage />],
  ['Pricing', () => <PricingPage />],
  ['CustomerApp', () => <CustomerAppPage />],
  ['Banners', () => <BannersPage />],
  ['Customers', () => <CustomersPage />],
  ['AuditLog', () => <AuditLogPage />],
  ['CashReconciliation', () => <CashReconciliationPage />],
  ['PrintSettings', () => <PrintSettingsPage />],
  ['Settings', () => <SettingsPage />],
];

describe('every admin page mounts', () => {
  it.each(PAGES)('%s', async (_name, build) => {
    const view = renderPage(build(), { route: '/orders/o1' });

    // Let the effect-driven loads settle. A page that renders on its first
    // pass and throws once the data arrives is the more common failure, and
    // asserting only the initial mount would miss every one of them.
    await waitFor(() => expect(view.container).toBeTruthy());
    await new Promise((r) => setTimeout(r, 0));
    expect(view.container.innerHTML.length).toBeGreaterThan(0);
  });
});

describe('pages survive what the API actually returns', () => {
  it('renders the orders list when the API errors', async () => {
    // A 500 on a list must show an error state, not a blank page.
    const api = makeApi({
      listOrders: vi.fn().mockRejectedValue(new Error('server exploded')),
    });
    const view = renderPage(<OrdersListPage onOpen={() => {}} />, { api });

    await waitFor(() => expect(api.listOrders).toHaveBeenCalled());
    expect(view.container.innerHTML.length).toBeGreaterThan(0);
  });

  it('renders an order with no delivery, payment or items', async () => {
    // A pickup order that was never paid online has all three missing, and it
    // is the shape most likely to be absent from a hand-written fixture.
    const api = makeApi({
      getOrder: {
        id: 'o1',
        orderNumber: '1000000',
        referenceId: null,
        status: 'CONFIRMED',
        paymentStatus: 'PENDING',
        type: 'PICKUP',
        branch: null,
        customer: null,
        items: [],
        statusHistory: [],
        delivery: null,
        payment: null,
        subtotalMinor: 0,
        discountMinor: 0,
        deliveryFeeMinor: 0,
        vatMinor: 0,
        totalMinor: 0,
        placedAt: '2026-09-04T00:00:00.000Z',
      },
    });
    const view = renderPage(<OrderDetailPage />, { api, route: '/orders/o1' });

    await waitFor(() => expect(api.getOrder).toHaveBeenCalled());
    expect(view.container.innerHTML.length).toBeGreaterThan(0);
  });

  it('renders the users page for a branch admin, not only an owner', async () => {
    // Owner-only routing lives in App.tsx, so the page itself still has to
    // render for a non-owner rather than assuming owner-shaped data.
    const api = makeApi({ listUsers: paged([]) });
    const view = renderPage(<CustomersPage />, { api, actor: BRANCH_ACTOR });

    await waitFor(() => expect(view.container).toBeTruthy());
    expect(view.container.innerHTML.length).toBeGreaterThan(0);
  });
});
