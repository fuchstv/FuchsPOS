import { FormEvent, useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useTenantAccessScope } from './TenantAccessContext';

const tabs = [
  { to: '/admin/access-control', label: 'Benutzer', end: true },
  { to: '/admin/access-control/roles', label: 'Rollen' },
  { to: '/admin/access-control/audit-log', label: 'Audit-Log' },
];

/**
 * Provides the layout for the access control section of the admin panel.
 *
 * This component includes a header with a title, a brief description,
 * and tab-based navigation for the different access control pages (Users, Roles, Audit Log).
 * It uses React Router's `Outlet` to render the content of the active nested route.
 *
 * @returns {JSX.Element} The rendered layout component.
 */
export default function AccessControlLayout() {
  const { tenantId, setTenantId } = useTenantAccessScope();
  const [draftTenantId, setDraftTenantId] = useState(tenantId);

  useEffect(() => {
    setDraftTenantId(tenantId);
  }, [tenantId]);

  const handleTenantSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = draftTenantId.trim();
    if (normalized && normalized !== tenantId) {
      setTenantId(normalized);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold text-white">Access-Control</h1>
        <p className="mt-2 text-sm text-slate-400">
          Verwalten Sie Benutzer, Rollen und Audit-Protokolle für Ihre POS-Instanzen.
        </p>
        <form
          onSubmit={handleTenantSubmit}
          className="mt-4 flex flex-col gap-3 rounded-lg border border-slate-800/80 bg-slate-900/40 p-4 text-sm text-slate-200 md:flex-row md:items-end"
        >
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-xs uppercase tracking-wide text-slate-400">Aktiver Mandant</span>
            <input
              type="text"
              value={draftTenantId}
              onChange={event => setDraftTenantId(event.target.value)}
              className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-indigo-400 focus:outline-none"
              placeholder="tenant-123"
              required
            />
          </label>
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-md bg-indigo-500 px-4 py-2 font-medium text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-indigo-500/60"
            disabled={!draftTenantId.trim() || draftTenantId.trim() === tenantId}
          >
            Tenant setzen
          </button>
        </form>
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
