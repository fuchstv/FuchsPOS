import { BrowserRouter, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import PosDashboard from './routes/pos/PosDashboard';
import AccessControl from './routes/admin/AccessControl';
import InventoryDashboard from './routes/inventory/InventoryDashboard';
import { InventoryRealtimeProvider } from './routes/inventory/InventoryRealtimeProvider';
import ReportingDashboard from './routes/reporting/ReportingDashboard';
import DiagnosticsPage from './routes/diagnostics/DiagnosticsPage';
import { PosRealtimeProvider } from './realtime/PosRealtimeProvider';
import CustomerOrderLayout from './routes/order/CustomerOrderLayout';
import ProductCatalogPage from './routes/order/ProductCatalogPage';
import CheckoutPage from './routes/order/CheckoutPage';
import OrderConfirmationPage from './routes/order/OrderConfirmationPage';
import OrderTrackingPage from './routes/order/TrackingPage';
import TenantSettings from './routes/admin/TenantSettings';
import TenantControlCenter from './routes/ops/TenantControlCenter';

const navLinks = [
  { to: '/', label: 'POS', end: true },
  { to: '/inventory', label: 'Inventur' },
  { to: '/reporting', label: 'Reporting' },
  { to: '/ops/tenant-control', label: 'Ops Center' },
  { to: '/diagnostics', label: 'Diagnose' },
  { to: '/admin/access-control', label: 'Access Control' },
  { to: '/admin/tenant-settings', label: 'Mandanten' },
  { to: '/order', label: 'Kundenbestellung' },
];

/**
 * The main application component.
 *
 * This component sets up the main layout, including the header and navigation,
 * and defines the routing for the entire application using React Router.
 * It also wraps the application in the necessary context providers for real-time updates.
 *
 * @returns {JSX.Element} The rendered application structure.
 */
export default function App() {
  return (
    <PosRealtimeProvider>
      <InventoryRealtimeProvider>
        <BrowserRouter>
          <AppContainer />
        </BrowserRouter>
      </InventoryRealtimeProvider>
    </PosRealtimeProvider>
  );
}

const customerPaths = ['/order', '/checkout', '/confirmation', '/order/tracking'];

function AppContainer() {
  const location = useLocation();
  const isCustomerRoute = customerPaths.some(path => location.pathname.startsWith(path));

  return (
    <div className={isCustomerRoute ? 'min-h-screen bg-slate-50 text-slate-900' : 'min-h-screen bg-slate-950 text-slate-100'}>
      {!isCustomerRoute && (
        <header className="border-b border-slate-900/80 bg-slate-950/80 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
            <NavLink to="/" className="text-lg font-semibold tracking-tight text-white">
              FuchsPOS
            </NavLink>
            <nav className="flex items-center gap-2 text-sm">
              {navLinks.map(link => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.end}
                  className={({ isActive }) =>
                    [
                      'rounded-md px-3 py-2 font-medium transition-colors',
                      isActive
                        ? 'bg-indigo-500 text-white shadow'
                        : 'text-slate-300 hover:bg-slate-900/70 hover:text-white',
                    ].join(' ')
                  }
                >
                  {link.label}
                </NavLink>
              ))}
            </nav>
          </div>
        </header>
      )}

      <main>
        <Routes>
          <Route path="/" element={<PosDashboard />} />
          <Route path="/inventory" element={<InventoryDashboard />} />
          <Route path="/reporting" element={<ReportingDashboard />} />
          <Route path="/ops/tenant-control" element={<TenantControlCenter />} />
          <Route path="/diagnostics" element={<DiagnosticsPage />} />
          <Route path="/admin/tenant-settings" element={<TenantSettings />} />
          <Route path="/admin/access-control/*" element={<AccessControl />} />
          <Route element={<CustomerOrderLayout />}>
            <Route path="/order" element={<ProductCatalogPage />} />
            <Route path="/checkout" element={<CheckoutPage />} />
            <Route path="/confirmation" element={<OrderConfirmationPage />} />
          </Route>
          <Route path="/order/tracking/:orderId" element={<OrderTrackingPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
