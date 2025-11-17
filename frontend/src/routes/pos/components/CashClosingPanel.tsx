import { useEffect, useState } from 'react';
import api from '../../../api/client';
import type { CashClosingRecord } from '../../../store/types';

const currency = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
});

const formatDateTime = (value: string) =>
  new Date(value).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

const formatDateOnly = (value: string) =>
  new Date(value).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

type ClosingType = 'X' | 'Z';

const typeLabel: Record<ClosingType, string> = {
  X: 'X-Bon',
  Z: 'Z-Bon',
};

const HISTORY_LIMIT = 5;

export function CashClosingPanel() {
  const [closings, setClosings] = useState<CashClosingRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadingType, setLoadingType] = useState<ClosingType | null>(null);

  useEffect(() => {
    void fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      const { data } = await api.get<{ closings: CashClosingRecord[] }>(
        `/pos/closings?limit=${HISTORY_LIMIT}`,
      );
      setClosings(Array.isArray(data?.closings) ? data.closings : []);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Kassenabschlüsse konnten nicht geladen werden.',
      );
    }
  };

  const triggerClosing = async (type: ClosingType) => {
    setLoadingType(type);
    setError(null);
    try {
      const endpoint = type === 'X' ? '/pos/closings/x' : '/pos/closings/z';
      const { data } = await api.post<{ closing: CashClosingRecord }>(endpoint);
      if (data?.closing) {
        setClosings(prev => [data.closing, ...prev].slice(0, HISTORY_LIMIT));
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Der Kassenabschluss konnte nicht erstellt werden.',
      );
    } finally {
      setLoadingType(null);
    }
  };

  return (
    <section className="rounded-2xl border border-amber-400/40 bg-amber-500/10 p-4 text-xs text-amber-50">
      <div className="flex items-center justify-between text-sm">
        <h3 className="font-semibold text-amber-100">Kassenabschluss</h3>
        <span className="text-amber-200/80">{closings.length}</span>
      </div>
      <p className="mt-1 text-amber-100/80">
        Erstellt sofort einen X- oder Z-Bon auf Basis der verbuchten Verkäufe.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => triggerClosing('X')}
          disabled={loadingType !== null}
          className="rounded-xl border border-amber-200/40 bg-amber-900/30 px-3 py-2 text-left text-amber-100 transition hover:border-amber-200/70 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <p className="text-sm font-semibold">Zwischenstand (X-Bon)</p>
          <p className="text-[11px] text-amber-200/70">
            Zeigt alle Bewegungen seit dem letzten Z-Abschluss.
          </p>
          {loadingType === 'X' && <p className="mt-1 text-[11px] text-amber-200">Wird erstellt …</p>}
        </button>
        <button
          type="button"
          onClick={() => triggerClosing('Z')}
          disabled={loadingType !== null}
          className="rounded-xl border border-amber-200/40 bg-amber-900/30 px-3 py-2 text-left text-amber-100 transition hover:border-amber-200/70 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <p className="text-sm font-semibold">Tagesabschluss (Z-Bon)</p>
          <p className="text-[11px] text-amber-200/70">
            Schließt den Zeitraum dauerhaft ab und startet neu.
          </p>
          {loadingType === 'Z' && <p className="mt-1 text-[11px] text-amber-200">Wird erstellt …</p>}
        </button>
      </div>
      {error && <p className="mt-3 text-[11px] text-rose-200">{error}</p>}
      <div className="mt-4 space-y-3">
        {closings.length === 0 ? (
          <p className="text-[11px] text-amber-200/70">Noch keine Abschlüsse vorhanden.</p>
        ) : (
          closings.map(closing => (
            <article
              key={closing.id}
              className="space-y-1 rounded-xl border border-amber-200/30 bg-amber-900/20 p-3 text-amber-100"
            >
              <div className="flex items-center justify-between text-[11px] uppercase tracking-wide">
                <span className="font-semibold">{typeLabel[closing.type]}</span>
                <span className="text-amber-200/70">{formatDateTime(closing.createdAt)}</span>
              </div>
              <p className="text-[11px] text-amber-200/80">
                Zeitraum {formatDateOnly(closing.fromDate)} – {formatDateTime(closing.toDate)}
              </p>
              <div className="mt-2 flex items-center justify-between text-sm">
                <span>Umsatz</span>
                <span className="font-semibold">{currency.format(closing.totalGross)}</span>
              </div>
              <p className="text-[11px] text-amber-200/80">{closing.saleCount} Bons erfasst</p>
              {Object.keys(closing.paymentMethods ?? {}).length > 0 && (
                <div className="mt-2 space-y-1 rounded-lg border border-amber-200/20 bg-amber-900/30 p-2">
                  <p className="text-[10px] uppercase tracking-wide text-amber-200/70">Zahlarten</p>
                  {Object.entries(closing.paymentMethods).map(([method, summary]) => (
                    <div key={method} className="flex items-center justify-between text-[11px]">
                      <span className="text-amber-100/90">{method}</span>
                      <span>
                        {currency.format(summary.total)} · {summary.count}x
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {closing.cashAdjustments && (
                <div className="mt-2 space-y-1 rounded-lg border border-amber-200/20 bg-amber-900/30 p-2">
                  <p className="text-[10px] uppercase tracking-wide text-amber-200/70">Bargeldbewegungen</p>
                  <div className="flex items-center justify-between text-[11px] text-emerald-100/90">
                    <span>Einzahlungen</span>
                    <span>{currency.format(closing.cashAdjustments.deposits ?? 0)}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-rose-100/90">
                    <span>Entnahmen</span>
                    <span>{currency.format(closing.cashAdjustments.withdrawals ?? 0)}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-semibold text-amber-100">
                    <span>Netto</span>
                    <span>{currency.format(closing.cashAdjustments.net ?? 0)}</span>
                  </div>
                </div>
              )}
            </article>
          ))
        )}
      </div>
    </section>
  );
}
