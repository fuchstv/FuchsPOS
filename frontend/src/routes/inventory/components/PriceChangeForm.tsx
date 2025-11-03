import { FormEvent, useCallback, useState } from 'react';
import { PriceChangeResponse, recordPriceChange } from '../../../api/inventory';
import { useInventoryRealtime } from '../InventoryRealtimeContext';

const currencyFormatter = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export default function PriceChangeForm() {
  const { pushEvent } = useInventoryRealtime();
  const [form, setForm] = useState({
    tenantId: '',
    productSku: '',
    newPrice: '',
    reason: '',
    effectiveFrom: '',
    effectiveTo: '',
    promotionEnabled: false,
    promotionName: '',
    promotionDescription: '',
    promotionStartsAt: '',
    promotionEndsAt: '',
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PriceChangeResponse | null>(null);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!form.tenantId.trim() || !form.productSku.trim()) {
        setError('Bitte Tenant-ID und SKU ausfüllen.');
        return;
      }
      if (!form.newPrice.trim() || Number.isNaN(Number(form.newPrice.replace(',', '.')))) {
        setError('Bitte einen gültigen neuen Preis angeben.');
        return;
      }

      setSubmitting(true);
      setError(null);
      try {
        const newPriceValue = Number(form.newPrice.replace(',', '.'));
        const payload = {
          tenantId: form.tenantId.trim(),
          productSku: form.productSku.trim(),
          newPrice: newPriceValue,
          reason: form.reason.trim() || undefined,
          effectiveFrom: form.effectiveFrom ? new Date(form.effectiveFrom).toISOString() : undefined,
          effectiveTo: form.effectiveTo ? new Date(form.effectiveTo).toISOString() : undefined,
          promotion:
            form.promotionEnabled && form.promotionName.trim()
              ? {
                  name: form.promotionName.trim(),
                  description: form.promotionDescription.trim() || undefined,
                  startsAt: form.promotionStartsAt ? new Date(form.promotionStartsAt).toISOString() : undefined,
                  endsAt: form.promotionEndsAt ? new Date(form.promotionEndsAt).toISOString() : undefined,
                }
              : undefined,
        } as const;

        const response = await recordPriceChange(payload);
        setResult(response);
        pushEvent({
          id: `price-change-${response.product.sku}-${Date.now()}`,
          type: 'price-change',
          title: 'Preisänderung verbucht',
          timestamp: new Date().toISOString(),
          description: `SKU ${response.product.sku}`,
          payload: response,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Preisänderung konnte nicht gespeichert werden.';
        setError(message);
      } finally {
        setSubmitting(false);
      }
    },
    [form, pushEvent],
  );

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-lg font-semibold text-white">Preisänderungen</h2>
        <p className="text-sm text-slate-400">
          Aktualisieren Sie Verkaufspreise und optionale Promotions mit einer strukturierten Eingabemaske.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-slate-800 bg-slate-950/60 p-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="space-y-1 text-sm">
            <span className="text-slate-300">Tenant-ID</span>
            <input
              value={form.tenantId}
              onChange={event => setForm(previous => ({ ...previous, tenantId: event.target.value }))}
              className="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="tenant-123"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-slate-300">Produkt-SKU</span>
            <input
              value={form.productSku}
              onChange={event => setForm(previous => ({ ...previous, productSku: event.target.value }))}
              className="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="SKU-123"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-slate-300">Neuer Preis</span>
            <input
              value={form.newPrice}
              onChange={event => setForm(previous => ({ ...previous, newPrice: event.target.value }))}
              className="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="9,99"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-slate-300">Grund</span>
            <input
              value={form.reason}
              onChange={event => setForm(previous => ({ ...previous, reason: event.target.value }))}
              className="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="Sortimentsanpassung"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-slate-300">Gültig ab</span>
            <input
              type="datetime-local"
              value={form.effectiveFrom}
              onChange={event => setForm(previous => ({ ...previous, effectiveFrom: event.target.value }))}
              className="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-slate-300">Gültig bis</span>
            <input
              type="datetime-local"
              value={form.effectiveTo}
              onChange={event => setForm(previous => ({ ...previous, effectiveTo: event.target.value }))}
              className="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </label>
        </div>

        <div className="space-y-3 rounded-lg border border-slate-900 bg-slate-900/40 p-4">
          <label className="flex items-center gap-3 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={form.promotionEnabled}
              onChange={event => setForm(previous => ({ ...previous, promotionEnabled: event.target.checked }))}
              className="h-4 w-4 rounded border border-slate-700 bg-slate-900 text-indigo-500 focus:ring-indigo-500"
            />
            Promotion anlegen
          </label>

          {form.promotionEnabled && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="space-y-1 text-sm sm:col-span-2">
                <span className="text-slate-300">Name der Promotion</span>
                <input
                  value={form.promotionName}
                  onChange={event => setForm(previous => ({ ...previous, promotionName: event.target.value }))}
                  className="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="Sommer-Special"
                />
              </label>
              <label className="space-y-1 text-sm sm:col-span-2">
                <span className="text-slate-300">Beschreibung</span>
                <input
                  value={form.promotionDescription}
                  onChange={event => setForm(previous => ({ ...previous, promotionDescription: event.target.value }))}
                  className="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="Rabatt auf das gesamte Sortiment"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-slate-300">Startdatum</span>
                <input
                  type="datetime-local"
                  value={form.promotionStartsAt}
                  onChange={event => setForm(previous => ({ ...previous, promotionStartsAt: event.target.value }))}
                  className="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-slate-300">Enddatum</span>
                <input
                  type="datetime-local"
                  value={form.promotionEndsAt}
                  onChange={event => setForm(previous => ({ ...previous, promotionEndsAt: event.target.value }))}
                  className="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </label>
            </div>
          )}
        </div>

        {error && <p className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>}

        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-wide text-slate-500">Preisänderungen werden sofort aktiv.</p>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-indigo-500/60"
          >
            {submitting ? 'Speichere…' : 'Preisänderung speichern'}
          </button>
        </div>
      </form>

      {result && (
        <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-950/60 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm">
                <span className="inline-flex items-center rounded-full border border-emerald-400/60 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-200">
                  Aktualisiert
                </span>
                <span className="text-slate-400">SKU {result.product.sku}</span>
              </div>
              <h3 className="text-base font-semibold text-white">{result.product.name}</h3>
              {result.product.supplier?.name && (
                <p className="text-sm text-slate-400">Lieferant: {result.product.supplier.name}</p>
              )}
            </div>
            <div className="text-sm text-slate-300">
              <p>Alt: {currencyFormatter.format(Number(result.priceHistory.oldPrice))}</p>
              <p className="text-emerald-300">Neu: {currencyFormatter.format(Number(result.priceHistory.newPrice))}</p>
            </div>
          </div>

          {result.priceHistory.reason && (
            <p className="rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-300">
              Grund: {result.priceHistory.reason}
            </p>
          )}

          {result.promotion && (
            <div className="rounded-lg border border-indigo-500/40 bg-indigo-500/10 p-4 text-sm text-indigo-100">
              <h4 className="text-sm font-semibold uppercase tracking-wide text-indigo-200">Promotion</h4>
              <p className="text-base font-medium text-white">{result.promotion.name}</p>
              {result.promotion.description && <p className="text-indigo-100/80">{result.promotion.description}</p>}
              <p className="text-xs uppercase tracking-wide text-indigo-300">
                {result.priceHistory.effectiveFrom
                  ? `Ab ${new Date(result.priceHistory.effectiveFrom).toLocaleString('de-DE')}`
                  : 'Startdatum unbekannt'}
                {result.priceHistory.effectiveTo
                  ? ` · Bis ${new Date(result.priceHistory.effectiveTo).toLocaleString('de-DE')}`
                  : ''}
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
