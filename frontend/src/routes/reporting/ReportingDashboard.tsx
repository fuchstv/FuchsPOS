import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  buildDownloadUrl,
  fetchDashboard,
  fetchExports,
  fetchLocations,
  requestExport,
} from './api';
import type {
  CategoryPerformanceRow,
  DashboardResponse,
  Granularity,
  LocationOption,
  ReportExportFormat,
  ReportExportSummary,
  ReportExportType,
  ReportingFilters,
} from './types';

const GRANULARITY_OPTIONS: { value: Granularity; label: string }[] = [
  { value: 'day', label: 'Täglich' },
  { value: 'week', label: 'Wöchentlich' },
  { value: 'month', label: 'Monatlich' },
  { value: 'quarter', label: 'Quartalsweise' },
  { value: 'year', label: 'Jährlich' },
];

const EXPORT_TYPES: { value: ReportExportType; label: string }[] = [
  { value: 'SALES_SUMMARY', label: 'Umsatzübersicht' },
  { value: 'EMPLOYEE_PERFORMANCE', label: 'Mitarbeiterleistung' },
  { value: 'CATEGORY_PERFORMANCE', label: 'Kategorie-Performance' },
];

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Wartend',
  PROCESSING: 'In Arbeit',
  READY: 'Bereit',
  FAILED: 'Fehlgeschlagen',
};

const STATUS_CLASSES: Record<string, string> = {
  PENDING: 'bg-slate-800/80 text-slate-300',
  PROCESSING: 'bg-blue-500/20 text-blue-200',
  READY: 'bg-emerald-500/20 text-emerald-200',
  FAILED: 'bg-rose-500/20 text-rose-200',
};

const CATEGORY_COLORS = ['#6366f1', '#22d3ee', '#f97316', '#16a34a', '#a855f7', '#facc15', '#ec4899'];

const currencyFormatter = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
});

const numberFormatter = new Intl.NumberFormat('de-DE');

const toDateInput = (date: Date) => date.toISOString().slice(0, 10);

const formatDateTime = (value?: string | null) =>
  value ? new Date(value).toLocaleString('de-DE') : '–';

const formatDateRange = (filters: { startDate?: string; endDate?: string }) => {
  const start = filters.startDate ? new Date(filters.startDate).toLocaleDateString('de-DE') : '–';
  const end = filters.endDate ? new Date(filters.endDate).toLocaleDateString('de-DE') : '–';
  return `${start} – ${end}`;
};

const defaultEnd = new Date();
const defaultStart = new Date(defaultEnd.getTime() - 6 * 24 * 60 * 60 * 1000);

type FilterState = {
  startDate: string;
  endDate: string;
  granularity: Granularity;
  locationId: string;
};

/**
 * Renders the reporting dashboard, providing a comprehensive overview of business metrics.
 * It allows users to filter data by date range, granularity, and location.
 * The dashboard visualizes sales trends, employee performance, and category-wise revenue distribution.
 * It also includes a section for monitoring expiring product batches and a service for requesting
 * and downloading detailed reports in CSV or XLSX format.
 * @returns {JSX.Element} The reporting dashboard component.
 */
export default function ReportingDashboard() {
  const [filters, setFilters] = useState<FilterState>({
    startDate: toDateInput(defaultStart),
    endDate: toDateInput(defaultEnd),
    granularity: 'day',
    locationId: '',
  });
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [exports, setExports] = useState<ReportExportSummary[]>([]);
  const [exportsLoading, setExportsLoading] = useState(false);
  const [exportsError, setExportsError] = useState<string | null>(null);
  const [selectedExportType, setSelectedExportType] = useState<ReportExportType>('SALES_SUMMARY');
  const [notificationEmail, setNotificationEmail] = useState('');
  const [requestInFlight, setRequestInFlight] = useState(false);

  const normalisedFilters = useMemo<ReportingFilters>(() => {
    const payload: ReportingFilters = {};
    if (filters.startDate) {
      payload.startDate = filters.startDate;
    }
    if (filters.endDate) {
      payload.endDate = filters.endDate;
    }
    if (filters.granularity) {
      payload.granularity = filters.granularity;
    }
    if (filters.locationId) {
      payload.locationId = filters.locationId;
    }
    return payload;
  }, [filters.startDate, filters.endDate, filters.granularity, filters.locationId]);

  useEffect(() => {
    fetchLocations()
      .then((data) => setLocations(data))
      .catch(() => setLocations([]));
  }, []);

  const loadDashboard = useCallback(async () => {
    setDashboardLoading(true);
    setDashboardError(null);
    try {
      const data = await fetchDashboard(normalisedFilters);
      setDashboard(data);
    } catch (error) {
      setDashboardError('Die Dashboard-Daten konnten nicht geladen werden.');
    } finally {
      setDashboardLoading(false);
    }
  }, [normalisedFilters]);

  const loadExports = useCallback(async () => {
    setExportsLoading(true);
    setExportsError(null);
    try {
      const data = await fetchExports({ ...normalisedFilters, limit: 25 });
      setExports(data);
    } catch (error) {
      setExportsError('Die Exporte konnten nicht geladen werden.');
    } finally {
      setExportsLoading(false);
    }
  }, [normalisedFilters]);

  useEffect(() => {
    loadDashboard();
    loadExports();
  }, [loadDashboard, loadExports]);

  const handleRequestExport = async (format: ReportExportFormat) => {
    setRequestInFlight(true);
    setExportsError(null);
    try {
      await requestExport({
        type: selectedExportType,
        format,
        ...normalisedFilters,
        notificationEmail: notificationEmail.trim() ? notificationEmail.trim() : undefined,
      });
      await loadExports();
    } catch (error) {
      setExportsError('Der Export konnte nicht angestoßen werden.');
    } finally {
      setRequestInFlight(false);
    }
  };

  const totalRevenue = useMemo(() => {
    if (!dashboard?.sales?.length) {
      return 0;
    }
    return dashboard.sales.reduce((sum, bucket) => sum + bucket.total, 0);
  }, [dashboard]);

  const topCategories = useMemo<CategoryPerformanceRow[]>(() => {
    if (!dashboard?.categories?.length) {
      return [];
    }
    return dashboard.categories.slice(0, 6);
  }, [dashboard]);

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 text-slate-100">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-white">Reporting Dashboard</h1>
        <p className="text-slate-400">Kennzahlen zu Umsatz, Performance und geplanten Datenexporten.</p>
      </header>

      <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 shadow">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">
          Filter
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-2 text-sm text-slate-300">
            <span>Startdatum</span>
            <input
              type="date"
              value={filters.startDate}
              onChange={(event) => setFilters((prev) => ({ ...prev, startDate: event.target.value }))}
              className="rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-slate-300">
            <span>Enddatum</span>
            <input
              type="date"
              value={filters.endDate}
              onChange={(event) => setFilters((prev) => ({ ...prev, endDate: event.target.value }))}
              className="rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-slate-300">
            <span>Granularität</span>
            <select
              value={filters.granularity}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, granularity: event.target.value as Granularity }))
              }
              className="rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {GRANULARITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2 text-sm text-slate-300">
            <span>Standort</span>
            <select
              value={filters.locationId}
              onChange={(event) => setFilters((prev) => ({ ...prev, locationId: event.target.value }))}
              className="rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">Alle Standorte</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="space-y-6">
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 shadow">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-white">Umsatzentwicklung</h2>
              <p className="text-sm text-slate-400">
                Summe aller erfolgreichen Verkäufe im gewählten Zeitraum.
              </p>
            </div>
            <div className="text-sm text-slate-300">
              Gesamtumsatz: <span className="font-semibold text-indigo-300">{currencyFormatter.format(totalRevenue)}</span>
            </div>
          </div>
          {dashboardError ? (
            <div className="rounded-md border border-rose-500/60 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
              {dashboardError}
            </div>
          ) : (
            <div className="h-72">
              {dashboardLoading ? (
                <div className="flex h-full items-center justify-center text-sm text-slate-400">
                  Lade Umsatzdaten …
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dashboard?.sales ?? []}>
                    <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                    <XAxis dataKey="period" stroke="#94a3b8" tick={{ fontSize: 12 }} interval="preserveStartEnd" />
                    <YAxis stroke="#94a3b8" tickFormatter={(value) => currencyFormatter.format(value as number)} width={90} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b' }}
                      formatter={(value: number) => currencyFormatter.format(value)}
                    />
                    <Line type="monotone" dataKey="total" stroke="#6366f1" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          )}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 shadow">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-white">Top Mitarbeiter:innen</h2>
              <p className="text-sm text-slate-400">Sortiert nach Umsatz.</p>
            </div>
            <div className="h-72">
              {dashboardLoading ? (
                <div className="flex h-full items-center justify-center text-sm text-slate-400">
                  Lade Mitarbeiterdaten …
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dashboard?.employees ?? []}>
                    <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                    <XAxis dataKey="employeeId" stroke="#94a3b8" tick={{ fontSize: 12 }} />
                    <YAxis stroke="#94a3b8" tickFormatter={(value) => currencyFormatter.format(value as number)} width={90} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b' }}
                      formatter={(value: number) => currencyFormatter.format(value)}
                    />
                    <Bar dataKey="revenue" fill="#22d3ee" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 shadow">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-white">Kategorieanteile</h2>
                <p className="text-sm text-slate-400">Top-Seller nach Umsatzanteil.</p>
              </div>
              {dashboard?.categories?.length ? (
                <span className="text-xs uppercase tracking-wide text-slate-500">Top {topCategories.length}</span>
              ) : null}
            </div>
            <div className="h-72">
              {dashboardLoading ? (
                <div className="flex h-full items-center justify-center text-sm text-slate-400">
                  Lade Kategorien …
                </div>
              ) : topCategories.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={topCategories}
                      dataKey="shareOfRevenue"
                      nameKey="category"
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      label={(entry: CategoryPerformanceRow) => `${Math.round(entry.shareOfRevenue)}%`}
                    >
                      {topCategories.map((entry, index) => (
                        <Cell key={entry.category} fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number, _name, props) => [
                        `${value.toFixed(2)}%`,
                        (props.payload?.category as string) ?? '',
                      ]}
                      contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b' }}
                    />
                    <Legend
                      layout="vertical"
                      align="right"
                      verticalAlign="middle"
                      wrapperStyle={{ color: '#cbd5f5', fontSize: 12 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-slate-400">
                  Keine Daten für den Zeitraum verfügbar.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 shadow">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-white">Ablaufüberwachung</h2>
              <p className="text-sm text-slate-400">
                Kritische Chargen innerhalb des gewählten Zeitraums. Datenbasis: Lagerbestände.
              </p>
            </div>
            <span className="text-sm text-slate-300">
              {dashboard?.expiry?.length ?? 0} Einträge
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-800 text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-3 py-2 text-left">Produkt</th>
                  <th className="px-3 py-2 text-left">Charge</th>
                  <th className="px-3 py-2 text-left">Standort</th>
                  <th className="px-3 py-2 text-right">Menge</th>
                  <th className="px-3 py-2 text-right">Tage verbleibend</th>
                  <th className="px-3 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {(dashboard?.expiry ?? []).slice(0, 8).map((item) => (
                  <tr key={item.batchId}>
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-100">{item.product?.name ?? 'Unbekannt'}</div>
                      <div className="text-xs text-slate-400">SKU: {item.product?.sku ?? '–'}</div>
                    </td>
                    <td className="px-3 py-2 text-sm text-slate-300">{item.lotNumber ?? '–'}</td>
                    <td className="px-3 py-2 text-sm text-slate-300">
                      {item.storageLocation?.code ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-right text-sm text-slate-200">
                      {numberFormatter.format(item.quantity ?? 0)}
                    </td>
                    <td className="px-3 py-2 text-right text-sm text-slate-200">
                      {item.daysRemaining === null ? '–' : item.daysRemaining}
                    </td>
                    <td className="px-3 py-2">
                      <span className="rounded-full bg-slate-800/60 px-2 py-1 text-xs uppercase tracking-wide text-slate-300">
                        {item.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {!dashboard?.expiry?.length && !dashboardLoading ? (
                  <tr>
                    <td className="px-3 py-6 text-center text-sm text-slate-400" colSpan={6}>
                      Keine ablaufenden Chargen im gewählten Zeitraum.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 shadow">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Export-Service</h2>
            <p className="text-sm text-slate-400">
              Geplante Hintergrundexporte und verfügbare Download-Links.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <select
              value={selectedExportType}
              onChange={(event) => setSelectedExportType(event.target.value as ReportExportType)}
              className="rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {EXPORT_TYPES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <input
              type="email"
              placeholder="Benachrichtigung (optional)"
              value={notificationEmail}
              onChange={(event) => setNotificationEmail(event.target.value)}
              className="w-56 rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <button
              type="button"
              onClick={() => handleRequestExport('CSV')}
              disabled={requestInFlight}
              className="rounded-md bg-indigo-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-slate-700"
            >
              {requestInFlight ? 'Export …' : 'CSV Export'}
            </button>
            <button
              type="button"
              onClick={() => handleRequestExport('XLSX')}
              disabled={requestInFlight}
              className="rounded-md border border-indigo-400 px-3 py-2 text-sm font-medium text-indigo-200 transition hover:bg-indigo-500/10 disabled:cursor-not-allowed disabled:border-slate-600 disabled:text-slate-400"
            >
              {requestInFlight ? 'Export …' : 'Excel Export'}
            </button>
          </div>
        </div>

        {exportsError ? (
          <div className="mb-4 rounded-md border border-rose-500/60 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            {exportsError}
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-800 text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-3 py-2 text-left">Typ</th>
                <th className="px-3 py-2 text-left">Format</th>
                <th className="px-3 py-2 text-left">Filter</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Erstellt</th>
                <th className="px-3 py-2 text-left">Fertig</th>
                <th className="px-3 py-2 text-left">Download</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {exportsLoading ? (
                <tr>
                  <td className="px-3 py-6 text-center text-sm text-slate-400" colSpan={7}>
                    Lade Exportdaten …
                  </td>
                </tr>
              ) : exports.length ? (
                exports.map((item) => (
                  <tr key={item.id}>
                    <td className="px-3 py-2 text-sm text-slate-200">
                      {EXPORT_TYPES.find((type) => type.value === item.type)?.label ?? item.type}
                    </td>
                    <td className="px-3 py-2 text-sm text-slate-300">{item.format}</td>
                    <td className="px-3 py-2 text-sm text-slate-200">
                      <div>{formatDateRange(item.filters)}</div>
                      <div className="text-xs text-slate-400">
                        Granularität: {item.filters.granularity ?? 'Standard'}
                      </div>
                      <div className="text-xs text-slate-400">
                        Standort: {item.filters.locationId ?? 'Alle'}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-medium ${
                          STATUS_CLASSES[item.status] ?? 'bg-slate-800/80 text-slate-300'
                        }`}
                      >
                        {STATUS_LABELS[item.status] ?? item.status}
                      </span>
                      {item.error ? (
                        <div className="mt-1 text-xs text-rose-300">{item.error}</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-sm text-slate-300">{formatDateTime(item.createdAt)}</td>
                    <td className="px-3 py-2 text-sm text-slate-300">{formatDateTime(item.completedAt)}</td>
                    <td className="px-3 py-2 text-sm text-indigo-300">
                      {item.status === 'READY' && item.downloadPath ? (
                        <a
                          href={buildDownloadUrl(item.downloadPath)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-md border border-indigo-400 px-3 py-1 text-xs font-medium text-indigo-200 transition hover:bg-indigo-500/10"
                        >
                          Download
                        </a>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-3 py-6 text-center text-sm text-slate-400" colSpan={7}>
                    Noch keine Exporte generiert.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
