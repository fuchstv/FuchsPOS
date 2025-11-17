import axios from 'axios';
import { useEffect, useMemo, useState } from 'react';

const ALL_MODULES = [
  {
    key: 'OPS_ORDERS',
    title: 'Bestell-Backlog',
    description: 'Alle Kundenaufträge inklusive Status, Slot und Fulfillment-Verknüpfung.',
  },
  {
    key: 'OPS_DELIVERY_SLOTS',
    title: 'Liefer-Slots',
    description: 'Kapazitätsplanung mit aktueller Auslastung pro Zeitfenster.',
  },
  {
    key: 'OPS_KITCHEN_TASKS',
    title: 'Fulfillment-Aufgaben',
    description: 'Küchen- und Lageraufgaben inklusive Status- und Verantwortlichen-Tracking.',
  },
  {
    key: 'OPS_DISPATCH_ASSIGNMENTS',
    title: 'Dispatch & Fahrer',
    description: 'Auslieferungsaufträge mit Fahrerplanung, ETA und Status.',
  },
] as const;

type TenantModuleKey = (typeof ALL_MODULES)[number]['key'];

type TenantProfile = {
  id: string;
  name: string;
};

type TenantModuleRecord = {
  id: number;
  tenantId: string;
  module: TenantModuleKey;
  enabled: boolean;
};

type CustomerOrder = {
  id: number;
  customerName?: string | null;
  status: string;
  totalAmount?: number | string | null;
  createdAt: string;
  slot?: {
    startTime: string;
    endTime: string;
  } | null;
};

type DeliverySlotWithUsage = {
  id: number;
  startTime: string;
  endTime: string;
  maxOrders: number;
  maxKitchenLoad: number;
  maxStorageLoad: number;
  usage: {
    orders: number;
    kitchenLoad: number;
    storageLoad: number;
  };
  remaining: {
    orders: number;
    kitchenLoad: number;
    storageLoad: number;
  };
};

type FulfillmentTask = {
  id: number;
  description: string | null;
  status: string;
  taskType: string;
  orderId: number;
  assignee?: string | null;
};

type DriverAssignment = {
  id: number;
  driverName?: string | null;
  vehicleId?: string | null;
  status: string;
  eta?: string | null;
  order: {
    id: number;
    customerName?: string | null;
  };
};

type FlowState<T> = {
  loading: boolean;
  data: T;
  error?: string;
};

const currencyFormatter = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
});

const ACTIVE_ORDER_STATES = ['SUBMITTED', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY'];

export default function TenantControlCenter() {
  const [tenants, setTenants] = useState<TenantProfile[]>([]);
  const [tenantsLoading, setTenantsLoading] = useState(true);
  const [tenantError, setTenantError] = useState<string | null>(null);
  const [selectedTenant, setSelectedTenant] = useState('');

  const [modules, setModules] = useState<TenantModuleKey[]>([]);
  const [modulesLoading, setModulesLoading] = useState(false);
  const [modulesError, setModulesError] = useState<string | null>(null);
  const [pendingModules, setPendingModules] = useState<TenantModuleKey[]>([]);
  const [savingModules, setSavingModules] = useState(false);
  const [moduleMessage, setModuleMessage] = useState<string | null>(null);

  const [ordersState, setOrdersState] = useState<FlowState<CustomerOrder[]>>({ loading: false, data: [] });
  const [slotsState, setSlotsState] = useState<FlowState<DeliverySlotWithUsage[]>>({ loading: false, data: [] });
  const [tasksState, setTasksState] = useState<FlowState<FulfillmentTask[]>>({ loading: false, data: [] });
  const [dispatchState, setDispatchState] = useState<FlowState<DriverAssignment[]>>({ loading: false, data: [] });

  useEffect(() => {
    const controller = new AbortController();
    setTenantsLoading(true);
    setTenantError(null);
    axios
      .get<TenantProfile[]>('/api/tenant-config/tenants', { signal: controller.signal })
      .then(response => {
        const tenantList = response.data ?? [];
        setTenants(tenantList);
        setSelectedTenant(current => current || tenantList[0]?.id || '');
      })
      .catch(error => {
        if (isAbortError(error)) {
          return;
        }
        setTenantError('Mandanten konnten nicht geladen werden.');
      })
      .finally(() => setTenantsLoading(false));

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!selectedTenant) {
      setModules([]);
      setPendingModules([]);
      return;
    }

    const controller = new AbortController();
    setModulesLoading(true);
    setModulesError(null);
    setModuleMessage(null);

    axios
      .get<TenantModuleRecord[]>(`/api/tenants/${selectedTenant}/modules`, { signal: controller.signal })
      .then(response => {
        const enabledModules = (response.data ?? [])
          .filter(entry => entry.enabled !== false)
          .map(entry => entry.module);
        setModules(enabledModules);
        setPendingModules(enabledModules);
      })
      .catch(error => {
        if (isAbortError(error)) {
          return;
        }
        setModulesError('Module konnten nicht geladen werden.');
        setModules([]);
        setPendingModules([]);
      })
      .finally(() => setModulesLoading(false));

    return () => controller.abort();
  }, [selectedTenant]);

  const hasOrdersModule = modules.includes('OPS_ORDERS');
  const hasSlotsModule = modules.includes('OPS_DELIVERY_SLOTS');
  const hasTasksModule = modules.includes('OPS_KITCHEN_TASKS');
  const hasDispatchModule = modules.includes('OPS_DISPATCH_ASSIGNMENTS');

  useEffect(() => {
    if (!selectedTenant || !hasOrdersModule) {
      setOrdersState({ loading: false, data: [] });
      return;
    }
    const controller = new AbortController();
    setOrdersState(prev => ({ ...prev, loading: true, error: undefined }));
    axios
      .get<CustomerOrder[]>('/api/orders', {
        params: { tenantId: selectedTenant },
        signal: controller.signal,
      })
      .then(response => {
        setOrdersState({ loading: false, data: response.data ?? [] });
      })
      .catch(error => {
        if (isAbortError(error)) {
          return;
        }
        setOrdersState({ loading: false, data: [], error: 'Bestellungen konnten nicht geladen werden.' });
      });

    return () => controller.abort();
  }, [selectedTenant, hasOrdersModule]);

  useEffect(() => {
    if (!selectedTenant || !hasSlotsModule) {
      setSlotsState({ loading: false, data: [] });
      return;
    }
    const controller = new AbortController();
    setSlotsState(prev => ({ ...prev, loading: true, error: undefined }));
    axios
      .get<DeliverySlotWithUsage[]>('/api/delivery-slots', {
        params: { tenantId: selectedTenant },
        signal: controller.signal,
      })
      .then(response => {
        setSlotsState({ loading: false, data: response.data ?? [] });
      })
      .catch(error => {
        if (isAbortError(error)) {
          return;
        }
        setSlotsState({ loading: false, data: [], error: 'Liefer-Slots konnten nicht geladen werden.' });
      });

    return () => controller.abort();
  }, [selectedTenant, hasSlotsModule]);

  useEffect(() => {
    if (!selectedTenant || !hasTasksModule) {
      setTasksState({ loading: false, data: [] });
      return;
    }
    const controller = new AbortController();
    setTasksState(prev => ({ ...prev, loading: true, error: undefined }));
    axios
      .get<FulfillmentTask[]>('/api/kitchen/tasks', {
        params: { tenantId: selectedTenant },
        signal: controller.signal,
      })
      .then(response => {
        setTasksState({ loading: false, data: response.data ?? [] });
      })
      .catch(error => {
        if (isAbortError(error)) {
          return;
        }
        setTasksState({ loading: false, data: [], error: 'Fulfillment-Aufgaben konnten nicht geladen werden.' });
      });

    return () => controller.abort();
  }, [selectedTenant, hasTasksModule]);

  useEffect(() => {
    if (!selectedTenant || !hasDispatchModule) {
      setDispatchState({ loading: false, data: [] });
      return;
    }
    const controller = new AbortController();
    setDispatchState(prev => ({ ...prev, loading: true, error: undefined }));
    axios
      .get<DriverAssignment[]>('/api/dispatch/assignments', {
        params: { tenantId: selectedTenant },
        signal: controller.signal,
      })
      .then(response => {
        setDispatchState({ loading: false, data: response.data ?? [] });
      })
      .catch(error => {
        if (isAbortError(error)) {
          return;
        }
        setDispatchState({ loading: false, data: [], error: 'Dispatch-Daten konnten nicht geladen werden.' });
      });

    return () => controller.abort();
  }, [selectedTenant, hasDispatchModule]);

  const dirtyModuleSelection = useMemo(() => {
    if (pendingModules.length !== modules.length) {
      return true;
    }
    return pendingModules.some(module => !modules.includes(module));
  }, [modules, pendingModules]);

  const handleToggleModule = (key: TenantModuleKey) => {
    setPendingModules(current =>
      current.includes(key) ? current.filter(module => module !== key) : [...current, key],
    );
  };

  const handleSaveModules = async () => {
    if (!selectedTenant) {
      return;
    }
    setSavingModules(true);
    setModuleMessage(null);
    try {
      const response = await axios.put<TenantModuleRecord[]>(`/api/tenants/${selectedTenant}/modules`, {
        modules: pendingModules,
      });
      const enabled = (response.data ?? [])
        .filter(entry => entry.enabled !== false)
        .map(entry => entry.module);
      setModules(enabled);
      setPendingModules(enabled);
      setModuleMessage('Module erfolgreich gespeichert.');
    } catch (error) {
      setModuleMessage('Module konnten nicht gespeichert werden.');
    } finally {
      setSavingModules(false);
    }
  };

  const insightCards = useMemo<Array<{ label: string; value: number | string }>>(() => {
    return [
      {
        label: 'Aktive Bestellungen',
        value: hasOrdersModule
          ? ordersState.data.filter(order => ACTIVE_ORDER_STATES.includes(order.status)).length
          : '—',
      },
      {
        label: 'Offene Fulfillment-Aufgaben',
        value: hasTasksModule
          ? tasksState.data.filter(task => task.status !== 'DONE' && task.status !== 'CANCELLED').length
          : '—',
      },
      {
        label: 'Verfügbare Slots heute',
        value: hasSlotsModule
          ? slotsState.data.filter(slot => slot.remaining.orders > 0).length
          : '—',
      },
      {
        label: 'Fahrer en Route',
        value: hasDispatchModule
          ? dispatchState.data.filter(assignment => assignment.status === 'EN_ROUTE').length
          : '—',
      },
    ];
  }, [
    hasOrdersModule,
    hasTasksModule,
    hasSlotsModule,
    hasDispatchModule,
    ordersState.data,
    tasksState.data,
    slotsState.data,
    dispatchState.data,
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-indigo-400">Operations</p>
        <h1 className="text-2xl font-semibold text-white">Tenant Control Center</h1>
        <p className="text-sm text-slate-400">
          Aggregierte Ops-Sicht auf Bestellungen, Slots, Fulfillment und Dispatch – filterbar pro Mandant.
        </p>
      </header>

      <section className="rounded-2xl border border-slate-800 bg-slate-950/60 p-6">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium text-white" htmlFor="tenant-select">
              Mandant auswählen
            </label>
            <select
              id="tenant-select"
              value={selectedTenant}
              onChange={event => setSelectedTenant(event.target.value)}
              className="w-full rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
              disabled={tenantsLoading || !!tenantError}
            >
              {tenants.map(tenant => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.name}
                </option>
              ))}
            </select>
            {tenantError && <p className="text-sm text-rose-400">{tenantError}</p>}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-white">Sichtbare Fulfillment-Flows</p>
            {modulesLoading && <p className="text-sm text-slate-400">Module werden geladen …</p>}
            {modulesError && <p className="text-sm text-rose-400">{modulesError}</p>}
            <div className="grid gap-2 sm:grid-cols-2">
              {ALL_MODULES.map(module => (
                <label
                  key={module.key}
                  className="flex items-start gap-2 rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-sm text-slate-200"
                >
                  <input
                    type="checkbox"
                    className="mt-1 rounded border-slate-700 bg-slate-900 text-indigo-500 focus:ring-indigo-500"
                    checked={pendingModules.includes(module.key)}
                    onChange={() => handleToggleModule(module.key)}
                    disabled={modulesLoading || savingModules}
                  />
                  <span>
                    <span className="block font-semibold text-white">{module.title}</span>
                    <span className="text-xs text-slate-400">{module.description}</span>
                  </span>
                </label>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleSaveModules}
                disabled={!dirtyModuleSelection || modulesLoading || savingModules}
                className="inline-flex items-center rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-slate-700"
              >
                {savingModules ? 'Speichern …' : 'Module speichern'}
              </button>
              {moduleMessage && <p className="text-sm text-slate-400">{moduleMessage}</p>}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {insightCards.map(card => (
          <article key={card.label} className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">{card.label}</p>
            <p className="mt-2 text-2xl font-semibold text-white">{card.value as string | number}</p>
          </article>
        ))}
      </section>

      {modules.length === 0 && !modulesLoading ? (
        <p className="rounded-xl border border-dashed border-slate-800 bg-slate-950/40 p-6 text-center text-sm text-slate-400">
          Für diesen Mandanten sind keine Fulfillment-Flows aktiv. Aktivieren Sie mindestens ein Modul.
        </p>
      ) : (
        <div className="space-y-6">
          {hasOrdersModule && (
            <FlowPanel
              title="Bestellungen"
              description="Aktuelle Kundenaufträge mit Status, Slot und Gesamtwert."
              state={ordersState}
              emptyLabel="Keine Bestellungen gefunden."
            >
              <table className="min-w-full divide-y divide-slate-900/80 text-sm">
                <thead className="bg-slate-900/50 text-left text-slate-400">
                  <tr>
                    <th className="px-4 py-3 font-medium">#</th>
                    <th className="px-4 py-3 font-medium">Kunde</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Slot</th>
                    <th className="px-4 py-3 font-medium">Gesamt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900/80 text-slate-300">
                  {ordersState.data.map(order => (
                    <tr key={order.id} className="hover:bg-slate-900/40">
                      <td className="px-4 py-3 text-white">#{order.id}</td>
                      <td className="px-4 py-3">{order.customerName ?? 'Unbekannt'}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={order.status} />
                      </td>
                      <td className="px-4 py-3 text-slate-400">
                        {order.slot ? formatDateRange(order.slot.startTime, order.slot.endTime) : '—'}
                      </td>
                      <td className="px-4 py-3 text-white">{formatAmount(order.totalAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </FlowPanel>
          )}

          {hasSlotsModule && (
            <FlowPanel
              title="Liefer-Slots"
              description="Kapazitätsübersicht inklusive Restmengen."
              state={slotsState}
              emptyLabel="Keine Slots im gewählten Zeitraum."
            >
              <table className="min-w-full divide-y divide-slate-900/80 text-sm">
                <thead className="bg-slate-900/50 text-left text-slate-400">
                  <tr>
                    <th className="px-4 py-3 font-medium">Zeitraum</th>
                    <th className="px-4 py-3 font-medium">Bestellungen</th>
                    <th className="px-4 py-3 font-medium">Küche</th>
                    <th className="px-4 py-3 font-medium">Lager</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900/80 text-slate-300">
                  {slotsState.data.map(slot => (
                    <tr key={slot.id} className="hover:bg-slate-900/40">
                      <td className="px-4 py-3 text-white">{formatDateRange(slot.startTime, slot.endTime)}</td>
                      <td className="px-4 py-3">
                        {slot.usage.orders} / {slot.maxOrders} ({slot.remaining.orders} frei)
                      </td>
                      <td className="px-4 py-3">
                        {slot.usage.kitchenLoad} / {slot.maxKitchenLoad}
                      </td>
                      <td className="px-4 py-3">
                        {slot.usage.storageLoad} / {slot.maxStorageLoad}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </FlowPanel>
          )}

          {hasTasksModule && (
            <FlowPanel
              title="Fulfillment-Aufgaben"
              description="Küchen- und Lageraufgaben pro Bestellung."
              state={tasksState}
              emptyLabel="Keine Aufgaben vorhanden."
            >
              <table className="min-w-full divide-y divide-slate-900/80 text-sm">
                <thead className="bg-slate-900/50 text-left text-slate-400">
                  <tr>
                    <th className="px-4 py-3 font-medium">Aufgabe</th>
                    <th className="px-4 py-3 font-medium">Typ</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Bestellung</th>
                    <th className="px-4 py-3 font-medium">Mitarbeiter</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900/80 text-slate-300">
                  {tasksState.data.map(task => (
                    <tr key={task.id} className="hover:bg-slate-900/40">
                      <td className="px-4 py-3 text-white">{task.description ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-400">{task.taskType}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={task.status} />
                      </td>
                      <td className="px-4 py-3">#{task.orderId}</td>
                      <td className="px-4 py-3">{task.assignee ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </FlowPanel>
          )}

          {hasDispatchModule && (
            <FlowPanel
              title="Dispatch"
              description="Fahrerzuordnungen und Lieferstatus."
              state={dispatchState}
              emptyLabel="Keine Dispatch-Aufträge."
            >
              <table className="min-w-full divide-y divide-slate-900/80 text-sm">
                <thead className="bg-slate-900/50 text-left text-slate-400">
                  <tr>
                    <th className="px-4 py-3 font-medium">Fahrer</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Bestellung</th>
                    <th className="px-4 py-3 font-medium">ETA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900/80 text-slate-300">
                  {dispatchState.data.map(assignment => (
                    <tr key={assignment.id} className="hover:bg-slate-900/40">
                      <td className="px-4 py-3 text-white">{assignment.driverName ?? 'Noch nicht geplant'}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={assignment.status} />
                      </td>
                      <td className="px-4 py-3">#{assignment.order?.id ?? '—'} </td>
                      <td className="px-4 py-3 text-slate-400">
                        {assignment.eta ? new Date(assignment.eta).toLocaleString('de-DE') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </FlowPanel>
          )}
        </div>
      )}
    </div>
  );
}

type FlowPanelProps<T> = {
  title: string;
  description: string;
  state: FlowState<T[]>;
  emptyLabel: string;
  children: React.ReactNode;
};

function FlowPanel<T>({ title, description, state, emptyLabel, children }: FlowPanelProps<T>) {
  return (
    <section className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950/60 p-6">
      <div>
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        <p className="text-sm text-slate-400">{description}</p>
      </div>
      {state.loading ? (
        <p className="text-sm text-slate-400">Wird geladen …</p>
      ) : state.error ? (
        <p className="text-sm text-rose-400">{state.error}</p>
      ) : state.data.length === 0 ? (
        <p className="text-sm text-slate-400">{emptyLabel}</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-900/80 bg-slate-950/40">{children}</div>
      )}
    </section>
  );
}

function StatusBadge({ status }: { status: string }) {
  const palette: Record<string, string> = {
    SUBMITTED: 'bg-slate-900/60 text-slate-200 border-slate-700',
    CONFIRMED: 'bg-sky-500/10 text-sky-200 border-sky-500/50',
    PREPARING: 'bg-amber-500/10 text-amber-200 border-amber-500/50',
    READY: 'bg-emerald-500/10 text-emerald-200 border-emerald-500/50',
    OUT_FOR_DELIVERY: 'bg-indigo-500/10 text-indigo-200 border-indigo-500/50',
    DELIVERED: 'bg-emerald-500/10 text-emerald-200 border-emerald-500/50',
    CANCELLED: 'bg-rose-500/10 text-rose-200 border-rose-500/50',
    PLANNED: 'bg-slate-900/60 text-slate-200 border-slate-700',
    EN_ROUTE: 'bg-indigo-500/10 text-indigo-200 border-indigo-500/50',
    FAILED: 'bg-rose-500/10 text-rose-200 border-rose-500/50',
    DONE: 'bg-emerald-500/10 text-emerald-200 border-emerald-500/50',
  };

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${palette[status] ?? 'bg-slate-900/60 text-slate-200 border-slate-800'}`}>
      {status}
    </span>
  );
}

function formatDateRange(start: string, end?: string | null) {
  const from = new Date(start);
  const to = end ? new Date(end) : null;
  const dateFormatter = new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  return [dateFormatter.format(from), to ? dateFormatter.format(to) : null].filter(Boolean).join(' – ');
}

function formatAmount(value: number | string | null | undefined) {
  if (value === null || value === undefined) {
    return '—';
  }
  const numeric = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(numeric)) {
    return '—';
  }
  return currencyFormatter.format(numeric);
}

function isAbortError(error: unknown) {
  if (!error) {
    return false;
  }
  const maybeError = error as { name?: string; code?: string };
  return maybeError.name === 'CanceledError' || maybeError.code === 'ERR_CANCELED' || error instanceof DOMException;
}
