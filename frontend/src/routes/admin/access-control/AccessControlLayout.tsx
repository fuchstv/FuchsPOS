import { NavLink, Outlet } from 'react-router-dom';

const tabs = [
  { to: '/admin/access-control', label: 'Benutzer', end: true },
  { to: '/admin/access-control/roles', label: 'Rollen' },
  { to: '/admin/access-control/audit-log', label: 'Audit-Log' },
];

export default function AccessControlLayout() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold text-white">Access-Control</h1>
        <p className="mt-2 text-sm text-slate-400">
          Verwalten Sie Benutzer, Rollen und Audit-Protokolle für Ihre POS-Instanzen.
        </p>
        <nav className="mt-6 flex gap-2">
          {tabs.map(tab => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                [
                  'rounded-md px-4 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-slate-200 text-slate-900 shadow'
                    : 'bg-slate-900/40 text-slate-200 hover:bg-slate-800/60',
                ].join(' ')
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <section className="rounded-xl border border-slate-800/80 bg-slate-900/60 shadow-xl backdrop-blur">
        <Outlet />
      </section>
    </div>
  );
}
