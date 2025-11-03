import { BrowserRouter, Navigate, NavLink, Route, Routes } from 'react-router-dom';
import PosDashboard from './routes/pos/PosDashboard';
import {
  AccessControlLayout,
  AuditLogPage,
  RolesPage,
  UsersPage,
} from './routes/admin/access-control';
import InventoryDashboard from './routes/inventory/InventoryDashboard';
import { InventoryRealtimeProvider } from './routes/inventory/InventoryRealtimeContext';
import ReportingDashboard from './routes/reporting/ReportingDashboard';

const navLinks = [
  { to: '/', label: 'POS', end: true },
  { to: '/inventory', label: 'Inventur' },
  { to: '/reporting', label: 'Reporting' },
  { to: '/admin/access-control', label: 'Access Control' },
];

export default function App() {
  return (
    <InventoryRealtimeProvider>
      <BrowserRouter>
        <div className="min-h-screen bg-slate-950 text-slate-100">
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

          <main>
            <Routes>
              <Route path="/" element={<PosDashboard />} />
              <Route path="/inventory" element={<InventoryDashboard />} />
              <Route path="/reporting" element={<ReportingDashboard />} />
              <Route path="/admin/access-control" element={<AccessControlLayout />}>
                <Route index element={<UsersPage />} />
                <Route path="roles" element={<RolesPage />} />
                <Route path="audit-log" element={<AuditLogPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </InventoryRealtimeProvider>
  );
}
