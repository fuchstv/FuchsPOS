import { NavLink, Outlet } from 'react-router-dom';

const steps = [
  { path: '/order', label: 'Produkte' },
  { path: '/checkout', label: 'Checkout' },
  { path: '/confirmation', label: 'Bestätigung' },
];

export default function CustomerOrderLayout() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-indigo-600">Fuchs Markt</p>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              Kundenbestellung
            </h1>
            <p className="text-sm text-slate-500">
              Stelle dir deine Lieblingsprodukte zusammen und reserviere einen passenden Liefer- oder
              Abholslot.
            </p>
          </div>
          <nav className="flex gap-2 text-sm font-medium">
            {steps.map(step => (
              <NavLink
                key={step.path}
                to={step.path}
                className={({ isActive }) =>
                  [
                    'rounded-full border px-4 py-2 transition-colors',
                    isActive
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                      : 'border-slate-200 text-slate-500 hover:border-indigo-200 hover:text-indigo-600',
                  ].join(' ')
                }
              >
                {step.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
