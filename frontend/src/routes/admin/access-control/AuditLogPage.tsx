import { useEffect, useMemo, useState } from 'react';
import { AuditLogEntry, listAuditLogs } from '../../../api/accessControl';
import { useTenantAccessScope } from './TenantAccessContext';

/**
 * Formats a date string into a localized format.
 * @param {string} value - The date string to format.
 * @returns {string} The formatted date string.
 */
function formatDate(value: string) {
  return new Date(value).toLocaleString('de-DE');
}

/**
 * A page component for displaying and filtering audit logs.
 *
 * This component fetches audit log entries from the API and provides
 * UI controls for filtering by action, a free-text search, and a date range.
 * It displays the filtered results in a table.
 *
 * @returns {JSX.Element} The rendered audit log page.
 */
export default function AuditLogPage() {
  const { tenantId } = useTenantAccessScope();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(100);
  const [filters, setFilters] = useState({
    action: '',
    search: '',
    from: '',
    to: '',
  });

  useEffect(() => {
    void loadLogs(limit);
  }, [limit, tenantId]);

  const loadLogs = async (currentLimit: number) => {
    try {
      setLoading(true);
      const entries = await listAuditLogs(tenantId, { limit: currentLimit });
      setLogs(entries);
      setError(null);
    } catch (cause) {
      console.error(cause);
      setError('Audit-Logs konnten nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  };

  const filteredLogs = useMemo(() => {
    const fromDate = filters.from ? new Date(filters.from) : null;
    const toDate = filters.to ? new Date(filters.to) : null;
    const searchLower = filters.search.trim().toLowerCase();
    const actionLower = filters.action.trim().toLowerCase();

    return logs.filter(log => {
      if (fromDate && new Date(log.createdAt) < fromDate) {
        return false;
      }
      if (toDate && new Date(log.createdAt) > toDate) {
        return false;
      }
      if (actionLower && !log.action.toLowerCase().includes(actionLower)) {
        return false;
      }
      if (searchLower) {
        const haystack = [
          log.action,
          log.entity ?? '',
          log.entityId ?? '',
          log.actorEmail ?? '',
          log.tenantId ?? '',
          JSON.stringify(log.metadata ?? {}),
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(searchLower)) {
          return false;
        }
      }
      return true;
    });
  }, [logs, filters]);

  return (
    <div className="space-y-6 p-6">
      <header>
        <h2 className="text-xl font-semibold text-white">Audit-Log</h2>
        <p className="mt-1 text-sm text-slate-400">
          Prüfen Sie sicherheitsrelevante Änderungen und behalten Sie kritische Aktionen im Blick.
        </p>
      </header>

      {error ? (
        <div className="rounded-lg border border-red-400/40 bg-red-500/10 p-4 text-sm text-red-200">{error}</div>
      ) : null}

      <div className="grid gap-4 rounded-lg border border-slate-800/80 bg-slate-950/40 p-6 md:grid-cols-4">
        <div className="md:col-span-1 flex flex-col gap-2 text-sm">
          <span className="text-slate-300">Max. Einträge</span>
          <select
            value={limit}
            onChange={event => setLimit(Number(event.target.value))}
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 focus:border-indigo-400 focus:outline-none"
          >
            {[50, 100, 200, 500].map(value => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>

        <label className="flex flex-col gap-2 text-sm">
          <span className="text-slate-300">Aktion</span>
          <input
            type="text"
            value={filters.action}
            onChange={event => setFilters(previous => ({ ...previous, action: event.target.value }))}
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 focus:border-indigo-400 focus:outline-none"
            placeholder="z. B. user.created"
          />
        </label>

        <label className="flex flex-col gap-2 text-sm">
          <span className="text-slate-300">Suche</span>
          <input
            type="text"
            value={filters.search}
            onChange={event => setFilters(previous => ({ ...previous, search: event.target.value }))}
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 focus:border-indigo-400 focus:outline-none"
            placeholder="E-Mail, Entity oder Metadaten"
          />
        </label>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <label className="flex flex-col gap-2">
            <span className="text-slate-300">Von</span>
            <input
              type="date"
              value={filters.from}
              onChange={event => setFilters(previous => ({ ...previous, from: event.target.value }))}
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 focus:border-indigo-400 focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-slate-300">Bis</span>
            <input
              type="date"
              value={filters.to}
              onChange={event => setFilters(previous => ({ ...previous, to: event.target.value }))}
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 focus:border-indigo-400 focus:outline-none"
            />
          </label>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-800/80">
        <table className="min-w-full divide-y divide-slate-800 text-sm">
          <thead className="bg-slate-900/60 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3 text-left">Zeitpunkt</th>
              <th className="px-4 py-3 text-left">Aktion</th>
              <th className="px-4 py-3 text-left">Entity</th>
              <th className="px-4 py-3 text-left">Akteur</th>
              <th className="px-4 py-3 text-left">Tenant</th>
              <th className="px-4 py-3 text-left">Metadaten</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {filteredLogs.map(entry => (
              <tr key={entry.id} className="hover:bg-slate-900/50">
                <td className="px-4 py-3 text-slate-300">{formatDate(entry.createdAt)}</td>
                <td className="px-4 py-3 font-mono text-xs text-indigo-200">{entry.action}</td>
                <td className="px-4 py-3 text-slate-200">
                  <div className="text-sm text-slate-100">{entry.entity ?? '—'}</div>
                  <div className="text-xs text-slate-500">{entry.entityId ?? '—'}</div>
                </td>
                <td className="px-4 py-3 text-slate-200">
                  <div>{entry.actorEmail ?? '—'}</div>
                  <div className="text-xs text-slate-500">User #{entry.userId ?? '—'}</div>
                </td>
                <td className="px-4 py-3 text-slate-200">{entry.tenantId ?? '—'}</td>
                <td className="px-4 py-3 text-slate-200">
                  <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded-md bg-slate-950/60 p-3 text-xs text-slate-300">
                    {JSON.stringify(entry.metadata ?? {}, null, 2)}
                  </pre>
                </td>
              </tr>
            ))}

            {!loading && filteredLogs.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-500">
                  Keine Einträge für die aktuelle Filterung gefunden.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
