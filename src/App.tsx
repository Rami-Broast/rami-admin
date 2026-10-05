import React from 'react';
import { Navigate, Route, BrowserRouter, Routes, useNavigate } from 'react-router-dom';

import { AuthProvider, useAuth } from './auth/AuthProvider';
import { RealtimeProvider } from './realtime/RealtimeProvider';
import { ThemeProvider } from './theme/ThemeProvider';
import { BannersPage } from './pages/BannersPage';
import { BranchComparisonPage } from './pages/BranchComparisonPage';
import { AuditLogPage } from './pages/AuditLogPage';
import { BranchSettingsPage } from './pages/BranchSettingsPage';
import { BranchWizardPage } from './pages/BranchWizardPage';
import { CashReconciliationPage } from './pages/CashReconciliationPage';
import { CouponsPage } from './pages/CouponsPage';
import { PromotionsPage } from './pages/PromotionsPage';
import { CustomerAppPage } from './pages/CustomerAppPage';
import { CustomersPage } from './pages/CustomersPage';
import { DashboardPage } from './pages/DashboardPage';
import { DeliveriesPage } from './pages/DeliveriesPage';
import { DriverPerformancePage } from './pages/DriverPerformancePage';
import { DriversPage } from './pages/DriversPage';
import { Layout } from './pages/Layout';
import { LiveOpsPage } from './pages/LiveOpsPage';
import { LoginPage } from './pages/LoginPage';
import { LoyaltyPage } from './pages/LoyaltyPage';
import { MenuPage } from './pages/MenuPage';
import { NewOrdersPage } from './pages/NewOrdersPage';
import { OrderDetailPage } from './pages/OrderDetailPage';
import { OrdersListPage } from './pages/OrdersListPage';
import { OrdersPage } from './pages/OrdersPage';
import { PaymentsPage } from './pages/PaymentsPage';
import { RefundsPage } from './pages/RefundsPage';
import { PricingPage } from './pages/PricingPage';
import { PrintSettingsPage } from './pages/PrintSettingsPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';
import { SettlementsPage } from './pages/SettlementsPage';
import { UsersPage } from './pages/UsersPage';

function OrdersRoute(): React.JSX.Element {
  const nav = useNavigate();
  return <OrdersListPage onOpen={(id) => nav(`/orders/${id}`)} />;
}

/** Blocks a route to owner-only pages so a branch admin who bookmarked one
 *  gets a friendly explainer instead of empty owner-only data. */
function OwnerOnly({ children }: { children: React.JSX.Element }): React.JSX.Element {
  const { isOwner } = useAuth();
  if (isOwner) return children;
  return (
    <div className="card" style={{ maxWidth: 520, margin: '40px auto' }}>
      <h2 style={{ marginTop: 0 }}>Owner only</h2>
      <p className="muted">
        This page is part of the owner view. Your account is scoped to a branch — use the tabs
        above for your branch&apos;s orders, kitchen, deliveries and reports.
      </p>
    </div>
  );
}

function Routed(): React.JSX.Element {
  const { isAuthenticated, isBranchAdmin } = useAuth();
  if (!isAuthenticated) {
    return <LoginPage />;
  }
  const home = isBranchAdmin ? '/new-orders' : '/dashboard';
  return (
    <Routes>
      <Route element={<Layout />}>
        {/* Shared with a branch admin */}
        <Route path="/new-orders" element={<NewOrdersPage />} />
        <Route path="/kitchen" element={<OrdersPage />} />
        <Route path="/orders" element={<OrdersRoute />} />
        <Route path="/orders/:id" element={<OrderDetailPage />} />
        <Route path="/deliveries" element={<DeliveriesPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/print" element={<PrintSettingsPage />} />
        <Route path="/settings" element={<SettingsPage />} />

        {/* Owner-only */}
        <Route path="/dashboard" element={<OwnerOnly><DashboardPage /></OwnerOnly>} />
        <Route path="/live" element={<OwnerOnly><LiveOpsPage /></OwnerOnly>} />
        <Route path="/menu" element={<OwnerOnly><MenuPage /></OwnerOnly>} />
        <Route path="/payments" element={<OwnerOnly><PaymentsPage /></OwnerOnly>} />
        {/* Not owner-only: a branch admin holds `refunds:read` and their own
            queue of customer requests is theirs to work. The decision buttons
            are gated on `refunds:write` inside the page. */}
        <Route path="/refunds" element={<RefundsPage />} />
        <Route path="/coupons" element={<OwnerOnly><CouponsPage /></OwnerOnly>} />
        <Route path="/promotions" element={<OwnerOnly><PromotionsPage /></OwnerOnly>} />
        <Route path="/loyalty" element={<OwnerOnly><LoyaltyPage /></OwnerOnly>} />
        <Route path="/branch-comparison" element={<OwnerOnly><BranchComparisonPage /></OwnerOnly>} />
        <Route path="/settlements" element={<OwnerOnly><SettlementsPage /></OwnerOnly>} />
        <Route path="/drivers" element={<OwnerOnly><DriversPage /></OwnerOnly>} />
        <Route path="/branches" element={<OwnerOnly><BranchSettingsPage /></OwnerOnly>} />
        <Route path="/branches/new" element={<OwnerOnly><BranchWizardPage /></OwnerOnly>} />
        <Route path="/pricing" element={<OwnerOnly><PricingPage /></OwnerOnly>} />
        <Route path="/customer-app" element={<OwnerOnly><CustomerAppPage /></OwnerOnly>} />
        <Route path="/banners" element={<OwnerOnly><BannersPage /></OwnerOnly>} />
        <Route path="/users" element={<OwnerOnly><UsersPage /></OwnerOnly>} />
        <Route path="/customers" element={<OwnerOnly><CustomersPage /></OwnerOnly>} />
        <Route path="/audit" element={<OwnerOnly><AuditLogPage /></OwnerOnly>} />
        <Route path="/cash" element={<OwnerOnly><CashReconciliationPage /></OwnerOnly>} />
        <Route path="/driver-performance" element={<OwnerOnly><DriverPerformancePage /></OwnerOnly>} />

        <Route path="*" element={<Navigate to={home} replace />} />
      </Route>
    </Routes>
  );
}

export function App(): React.JSX.Element {
  return (
    <ThemeProvider>
      <AuthProvider>
        <RealtimeProvider>
          <BrowserRouter>
            <Routed />
          </BrowserRouter>
        </RealtimeProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
