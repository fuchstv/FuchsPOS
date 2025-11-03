import { useEffect, useMemo, useState } from 'react';
import { usePosStore } from '../../store/posStore';
import { loadOfflineDiagnostics, type OfflineDiagnostics } from '../../store/offlineStorage';
import { usePosRealtime } from '../../realtime/PosRealtimeContext';

function formatDateTime(value?: string | null) {
  if (!value) {
    return '—';
  }
  return new Date(value).toLocaleString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatRelative(value?: string | null) {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  const diffMs = date.getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / 60000);
  const formatter = new Intl.RelativeTimeFormat('de-DE', { numeric: 'auto' });
  if (Math.abs(diffMinutes) > 60) {
    const diffHours = Math.round(diffMs / 3600000);
    return formatter.format(diffHours, 'hour');
  }
  return formatter.format(diffMinutes, 'minute');
}

export default function DiagnosticsPage() {
  const queuedPayments = usePosStore(state => state.queuedPayments);
  const syncQueuedPayments = usePosStore(state => state.syncQueuedPayments);
  const retryQueuedPayment = usePosStore(state => state.retryQueuedPayment);
  const removeQueuedPayment = usePosStore(state => state.removeQueuedPayment);
  const isOffline = usePosStore(state => state.isOffline);

  const { status: realtimeStatus, metrics, errors, reconnect, lastDisconnect } = usePosRealtime();

  const [storageStatus, setStorageStatus] = useState<OfflineDiagnostics | null>(null);
  const [storageLoading, setStorageLoading] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);

  const refreshStorageStatus = async () => {
    if (typeof window === 'undefined') {
      setStorageStatus({
        supported: false,
        cart: null,
        catalog: null,
        payments: { total: 0, pending: 0, failed: 0, conflict: 0 },
        terminalId: null,
      });
      return;
    }

    setStorageLoading(true);
    try {
      const diagnostics = await loadOfflineDiagnostics();
      setStorageStatus(diagnostics);
      setStorageError(null);
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : 'Status konnte nicht geladen werden.');
    } finally {
      setStorageLoading(false);
    }
  };

  useEffect(() => {
    void refreshStorageStatus();
  }, []);

  const pendingQueued = useMemo(
    () => queuedPayments.filter(payment => payment.status === 'pending'),
    [queuedPayments],
  );

  const conflictedPayments = useMemo(
    () => queuedPayments.filter(payment => payment.status === 'conflict'),
    [queuedPayments],
  );

  const failedPayments = useMemo(
    () => queuedPayments.filter(payment => payment.status === 'failed'),
    [queuedPayments],
  );

  const handleSyncQueuedPayments = async () => {
    await syncQueuedPayments();
    await refreshStorageStatus();
  };

  const handleRetryPayment = async (id: string) => {
    await retryQueuedPayment(id);
    await refreshStorageStatus();
  };

  const handleRemovePayment = async (id: string) => {
    await removeQueuedPayment(id);
    await refreshStorageStatus();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="mb-8">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Diagnose</p>
          <h1 className="text-3xl font-semibold text-white">Systemdiagnosen &amp; Offline-Verwaltung</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-300">
            Überwache Offline-Speicherstände, WebSocket-Verbindungen und die Zahlungswarteschlange. Von hier
            aus kannst du manuelle Synchronisationsläufe starten oder Konflikte bereinigen.
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-3xl border border-white/10 bg-slate-900/60 p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">IndexedDB &amp; Offline-Speicher</h2>
                <p className="text-sm text-slate-400">
                  Übersicht über lokal zwischengespeicherte Daten auf diesem Gerät.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void refreshStorageStatus()}
                className="rounded-lg border border-white/10 px-3 py-1 text-xs font-medium text-slate-200 transition hover:border-brand hover:text-brand"
                disabled={storageLoading}
              >
                {storageLoading ? 'Aktualisiere …' : 'Neu laden'}
              </button>
            </div>

            {storageError && <p className="mt-4 text-sm text-rose-300">{storageError}</p>}

            {storageStatus && (
              <dl className="mt-4 space-y-3 text-sm text-slate-300">
                <div className="flex items-center justify-between">
                  <dt>IndexedDB verfügbar</dt>
                  <dd className={storageStatus.supported ? 'text-emerald-300' : 'text-amber-300'}>
                    {storageStatus.supported ? 'Ja' : 'Nur In-Memory-Fallback'}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt>Terminal-ID</dt>
                  <dd className="font-mono text-xs text-slate-200">
                    {storageStatus.terminalId ?? 'nicht gesetzt'}
                  </dd>
                </div>
                <div className="rounded-2xl border border-white/5 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-widest text-slate-400">Warenkorb</p>
                  {storageStatus.cart ? (
                    <ul className="mt-2 space-y-1 text-sm">
                      <li>{storageStatus.cart.items} Positionen gespeichert</li>
                      <li>Letzte Aktualisierung: {formatDateTime(storageStatus.cart.updatedAt)}</li>
                      {typeof storageStatus.cart.grossTotal === 'number' && (
                        <li>Bruttosumme: {storageStatus.cart.grossTotal.toFixed(2)} €</li>
                      )}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-slate-400">Keine lokalen Warenkorbdaten vorhanden.</p>
                  )}
                </div>
                <div className="rounded-2xl border border-white/5 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-widest text-slate-400">Katalog</p>
                  {storageStatus.catalog ? (
                    <ul className="mt-2 space-y-1 text-sm">
                      <li>{storageStatus.catalog.items} Artikel im Cache</li>
                      <li>Letzte Aktualisierung: {formatDateTime(storageStatus.catalog.updatedAt)}</li>
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-slate-400">Noch kein Katalog lokal gespeichert.</p>
                  )}
                </div>
                <div className="rounded-2xl border border-white/5 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-widest text-slate-400">Zahlungswarteschlange</p>
                  <ul className="mt-2 space-y-1 text-sm">
                    <li>Gesamt: {storageStatus.payments.total}</li>
                    <li>Ausstehend: {storageStatus.payments.pending}</li>
                    <li>Fehlgeschlagen: {storageStatus.payments.failed}</li>
                    <li>Konflikte: {storageStatus.payments.conflict}</li>
                    <li>Nächster Versuch: {formatRelative(storageStatus.payments.nextRetryAt)}</li>
                    <li>Letzter Versuch: {formatRelative(storageStatus.payments.latestAttemptAt)}</li>
                  </ul>
                </div>
              </dl>
            )}
          </section>

          <section className="rounded-3xl border border-white/10 bg-slate-900/60 p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Realtime-Verbindung</h2>
                <p className="text-sm text-slate-400">
                  Status der POS-WebSocket-Verbindung und gemeldete Backend-Metriken.
                </p>
              </div>
              <button
                type="button"
                onClick={() => reconnect()}
                className="rounded-lg border border-white/10 px-3 py-1 text-xs font-medium text-slate-200 transition hover:border-brand hover:text-brand"
              >
                Verbindung neu aufbauen
              </button>
            </div>

            <dl className="mt-4 space-y-2 text-sm text-slate-300">
              <div className="flex items-center justify-between">
                <dt>Status</dt>
                <dd
                  className={
                    realtimeStatus === 'connected'
                      ? 'text-emerald-300'
                      : realtimeStatus === 'connecting'
                      ? 'text-amber-300'
                      : 'text-rose-300'
                  }
                >
                  {realtimeStatus === 'connected'
                    ? 'Verbunden'
                    : realtimeStatus === 'connecting'
                    ? 'Verbindungsaufbau'
                    : 'Getrennt'}
                </dd>
              </div>
              {lastDisconnect && (
                <div className="flex items-center justify-between">
                  <dt>Letzte Trennung</dt>
                  <dd className="text-xs text-slate-300">
                    Code {lastDisconnect.code ?? '-'} · {lastDisconnect.reason || 'ohne Grundangabe'}
                  </dd>
                </div>
              )}
            </dl>

            <div className="mt-4 space-y-3">
              <h3 className="text-xs uppercase tracking-widest text-slate-400">Queue-Metriken</h3>
              {metrics.length === 0 ? (
                <p className="text-sm text-slate-400">Keine Live-Metriken empfangen.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {metrics.map(metric => (
                    <li
                      key={metric.queue}
                      className="rounded-xl border border-white/5 bg-white/5 p-3 text-slate-200"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs uppercase tracking-wide text-slate-400">{metric.queue}</span>
                        <span className="text-xs text-slate-400">Aktualisiert {formatRelative(metric.updatedAt)}</span>
                      </div>
                      <pre className="mt-2 overflow-x-auto rounded bg-slate-950/60 p-2 text-[11px] text-slate-300">
                        {JSON.stringify(metric, null, 2)}
                      </pre>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-4 space-y-3">
              <h3 className="text-xs uppercase tracking-widest text-slate-400">Letzte Fehlermeldungen</h3>
              {errors.length === 0 ? (
                <p className="text-sm text-slate-400">Keine Fehler gemeldet.</p>
              ) : (
                <ul className="space-y-2 text-sm text-rose-200">
                  {errors.slice(0, 5).map((event, index) => (
                    <li key={`${event.occurredAt}-${index}`} className="rounded border border-rose-400/30 bg-rose-500/10 p-3">
                      <p className="font-medium text-rose-100">{event.message}</p>
                      <p className="text-xs text-rose-200/80">
                        Quelle: {event.source} · {formatDateTime(event.occurredAt)}
                      </p>
                      {event.details && (
                        <pre className="mt-2 overflow-x-auto rounded bg-rose-900/30 p-2 text-[11px] text-rose-200/80">
                          {JSON.stringify(event.details, null, 2)}
                        </pre>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>

        <section className="mt-6 rounded-3xl border border-white/10 bg-slate-900/60 p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Zahlungswarteschlange verwalten</h2>
              <p className="text-sm text-slate-400">
                Aktuelle Offline-Zahlungen inklusive Retry-Status und Konfliktinformationen.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void handleSyncQueuedPayments()}
                className="rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-slate-950 transition hover:bg-brand-dark"
              >
                Offline-Zahlungen synchronisieren
              </button>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  isOffline ? 'bg-amber-500/20 text-amber-200' : 'bg-emerald-500/20 text-emerald-200'
                }`}
              >
                {isOffline ? 'Terminal offline' : 'Online'}
              </span>
            </div>
          </div>

          <div className="mt-4 grid gap-3 text-sm text-slate-300 md:grid-cols-3">
            <div className="rounded-2xl border border-white/5 bg-white/5 p-4 text-center">
              <p className="text-xs uppercase tracking-widest text-slate-400">Ausstehend</p>
              <p className="mt-2 text-2xl font-semibold text-white">{pendingQueued.length}</p>
            </div>
            <div className="rounded-2xl border border-white/5 bg-white/5 p-4 text-center">
              <p className="text-xs uppercase tracking-widest text-slate-400">Konflikte</p>
              <p className="mt-2 text-2xl font-semibold text-amber-200">{conflictedPayments.length}</p>
            </div>
            <div className="rounded-2xl border border-white/5 bg-white/5 p-4 text-center">
              <p className="text-xs uppercase tracking-widest text-slate-400">Fehlgeschlagen</p>
              <p className="mt-2 text-2xl font-semibold text-rose-200">{failedPayments.length}</p>
            </div>
          </div>

          {queuedPayments.length === 0 ? (
            <p className="mt-6 rounded-2xl border border-dashed border-white/10 p-4 text-sm text-slate-400">
              Aktuell befinden sich keine Zahlungen in der Warteschlange.
            </p>
          ) : (
            <div className="mt-6 overflow-x-auto">
              <table className="min-w-full divide-y divide-white/10 text-left text-sm">
                <thead className="text-xs uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="px-4 py-2">Erstellt</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2">Versuche</th>
                    <th className="px-4 py-2">Nächster Versuch</th>
                    <th className="px-4 py-2">Hinweis</th>
                    <th className="px-4 py-2 text-right">Aktionen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-slate-200">
                  {queuedPayments.map(payment => (
                    <tr key={payment.id}>
                      <td className="px-4 py-3 font-mono text-xs text-slate-400">
                        {formatDateTime(payment.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-semibold ${
                            payment.status === 'failed'
                              ? 'bg-rose-500/10 text-rose-200'
                              : payment.status === 'conflict'
                              ? 'bg-amber-500/10 text-amber-200'
                              : 'bg-emerald-500/10 text-emerald-200'
                          }`}
                        >
                          {payment.status === 'failed'
                            ? 'Fehlgeschlagen'
                            : payment.status === 'conflict'
                            ? 'Konflikt'
                            : 'Ausstehend'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm">{payment.retryCount}</td>
                      <td className="px-4 py-3 text-sm">{formatRelative(payment.nextRetryAt)}</td>
                      <td className="px-4 py-3 text-sm">
                        {payment.status === 'conflict' && payment.conflict ? (
                          <span className="text-amber-200">{payment.conflict.message}</span>
                        ) : payment.error ? (
                          <span className="text-slate-300">{payment.error}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-xs">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => void handleRetryPayment(payment.id)}
                            className="rounded border border-white/10 px-2 py-1 text-xs text-slate-200 transition hover:border-brand hover:text-brand"
                          >
                            Erneut versuchen
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleRemovePayment(payment.id)}
                            className="rounded border border-rose-400/40 px-2 py-1 text-xs text-rose-200 transition hover:bg-rose-500/10"
                          >
                            Entfernen
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
