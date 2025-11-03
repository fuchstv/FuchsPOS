import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  CreateInventoryCountPayload,
  FinalizeInventoryCountPayload,
  FinalizeInventoryCountResponse,
  InventoryCountItem,
  InventoryCountResponse,
  createInventoryCount,
  finalizeInventoryCount,
} from '../../../api/inventory';
import { useInventoryRealtime } from '../InventoryRealtimeContext';

const differenceFormatter = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
});

type CountLineDraft = {
  productSku: string;
  expectedQuantity: string;
  countedQuantity: string;
  batchLotNumber: string;
};

type FinalizeLineDraft = {
  id?: number;
  productSku: string;
  countedQuantity: string;
  batchLotNumber: string;
  adjustmentReason: string;
};

const defaultCountLine: CountLineDraft = {
  productSku: '',
  expectedQuantity: '',
  countedQuantity: '',
  batchLotNumber: '',
};

const defaultFinalizeLine: FinalizeLineDraft = {
  productSku: '',
  countedQuantity: '',
  batchLotNumber: '',
  adjustmentReason: '',
};

function toNumber(value: string) {
  if (!value.trim()) return undefined;
  const parsed = Number(value.replace(',', '.'));
  return Number.isNaN(parsed) ? undefined : parsed;
}

function differenceBadge(difference: string) {
  const numeric = Number(difference);
  if (Number.isNaN(numeric) || numeric === 0) {
    return 'border-slate-500/50 bg-slate-500/10 text-slate-200';
  }
  return numeric > 0
    ? 'border-emerald-400/50 bg-emerald-500/10 text-emerald-200'
    : 'border-rose-400/50 bg-rose-500/10 text-rose-200';
}

function differenceLabel(difference: string) {
  const numeric = Number(difference);
  if (Number.isNaN(numeric)) {
    return difference;
  }
  const formatted = differenceFormatter.format(numeric);
  if (numeric === 0) return `±${formatted}`;
  return numeric > 0 ? `+${formatted}` : formatted;
}

function InventoryItemsTable({ items }: { items: InventoryCountItem[] }) {
  if (!items.length) {
    return (
      <p className="rounded-md border border-slate-800 bg-slate-900/50 p-4 text-sm text-slate-300">
        Keine Positionen hinterlegt.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900/60">
      <table className="min-w-full divide-y divide-slate-800 text-sm">
        <thead className="bg-slate-900/60 text-left text-slate-400">
          <tr>
            <th className="px-4 py-3 font-medium">SKU</th>
            <th className="px-4 py-3 font-medium">Produkt</th>
            <th className="px-4 py-3 font-medium text-right">Soll</th>
            <th className="px-4 py-3 font-medium text-right">Ist</th>
            <th className="px-4 py-3 font-medium text-right">Differenz</th>
            <th className="px-4 py-3 font-medium">Los</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {items.map(item => (
            <tr key={item.id} className="hover:bg-slate-900/70">
              <td className="px-4 py-3 font-mono text-xs text-indigo-200">{item.product.sku}</td>
              <td className="px-4 py-3 text-slate-200">{item.product.name}</td>
              <td className="px-4 py-3 text-right text-slate-300">
                {item.expectedQuantity ? differenceFormatter.format(Number(item.expectedQuantity)) : '—'}
              </td>
              <td className="px-4 py-3 text-right text-slate-100">
                {differenceFormatter.format(Number(item.countedQuantity))}
              </td>
              <td className="px-4 py-3">
                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${differenceBadge(item.difference)}`}>
                  {differenceLabel(item.difference)}
                </span>
              </td>
              <td className="px-4 py-3 text-slate-300">{item.batch?.lotNumber ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function InventoryCounts() {
  const { pushEvent } = useInventoryRealtime();
  const [createForm, setCreateForm] = useState({
    tenantId: '',
    locationCode: '',
    locationDescription: '',
    items: [defaultCountLine],
  });
  const [createResult, setCreateResult] = useState<InventoryCountResponse | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [finalizeForm, setFinalizeForm] = useState({
    tenantId: '',
    inventoryCountId: '',
    bookDifferences: true,
    defaultAdjustmentReason: 'Inventurdifferenz',
    items: [defaultFinalizeLine],
  });
  const [finalizeResult, setFinalizeResult] = useState<FinalizeInventoryCountResponse | null>(null);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);

  useEffect(() => {
    if (createResult) {
      setFinalizeForm(previous => ({
        ...previous,
        inventoryCountId: String(createResult.id),
        tenantId: previous.tenantId || createResult.tenantId,
        items:
          createResult.items.length > 0
            ? createResult.items.map(item => ({
                id: item.id,
                productSku: item.product.sku,
                countedQuantity: String(Number(item.countedQuantity)),
                batchLotNumber: item.batch?.lotNumber ?? '',
                adjustmentReason: '',
              }))
            : previous.items,
      }));
    }
  }, [createResult]);

  const handleCreateSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!createForm.tenantId.trim()) {
        setCreateError('Bitte Tenant-ID angeben.');
        return;
      }
      setCreateError(null);
      setCreating(true);
      try {
        const payload: CreateInventoryCountPayload = {
          tenantId: createForm.tenantId.trim(),
          locationCode: createForm.locationCode.trim() || undefined,
          locationDescription: createForm.locationDescription.trim() || undefined,
          items: createForm.items
            .filter(line => line.productSku.trim())
            .map(line => ({
              productSku: line.productSku.trim(),
              batchLotNumber: line.batchLotNumber.trim() || undefined,
              expectedQuantity: toNumber(line.expectedQuantity),
              countedQuantity: toNumber(line.countedQuantity),
            })),
        };

        const count = await createInventoryCount(payload);
        setCreateResult(count);
        pushEvent({
          id: `count-created-${count.id}-${Date.now()}`,
          type: 'count-created',
          title: 'Inventurzählung gestartet',
          timestamp: new Date().toISOString(),
          description: `Inventur #${count.id}`,
          payload: count,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Inventurzählung konnte nicht erstellt werden.';
        setCreateError(message);
      } finally {
        setCreating(false);
      }
    },
    [createForm, pushEvent],
  );

  const handleFinalizeSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!finalizeForm.tenantId.trim()) {
        setFinalizeError('Bitte Tenant-ID für den Abschluss angeben.');
        return;
      }
      const countId = Number(finalizeForm.inventoryCountId);
      if (!countId) {
        setFinalizeError('Bitte eine gültige Inventur-ID angeben.');
        return;
      }

      setFinalizing(true);
      setFinalizeError(null);
      try {
        const payload: FinalizeInventoryCountPayload = {
          tenantId: finalizeForm.tenantId.trim(),
          bookDifferences: finalizeForm.bookDifferences,
          defaultAdjustmentReason: finalizeForm.defaultAdjustmentReason.trim() || undefined,
          items: finalizeForm.items
            .filter(line => line.productSku.trim())
            .map(line => ({
              id: line.id,
              productSku: line.productSku.trim(),
              batchLotNumber: line.batchLotNumber.trim() || undefined,
              countedQuantity: Number(line.countedQuantity.replace(',', '.')),
              adjustmentReason: line.adjustmentReason.trim() || undefined,
            })),
        };

        const finalized = await finalizeInventoryCount(countId, payload);
        setFinalizeResult(finalized);
        pushEvent({
          id: `count-finalized-${finalized.id}-${Date.now()}`,
          type: 'count-finalized',
          title: 'Inventurzählung abgeschlossen',
          timestamp: new Date().toISOString(),
          description: `Inventur #${finalized.id}`,
          payload: finalized,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Inventur konnte nicht abgeschlossen werden.';
        setFinalizeError(message);
      } finally {
        setFinalizing(false);
      }
    },
    [finalizeForm, pushEvent],
  );

  const adjustments = useMemo(() => finalizeResult?.adjustments ?? [], [finalizeResult]);

  return (
    <section className="space-y-6">
      <header>
        <h2 className="text-lg font-semibold text-white">Inventurzählungen</h2>
        <p className="text-sm text-slate-400">
          Erfassen Sie Zählungen pro Standort und schließen Sie Inventuren mit wenigen Klicks ab.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <form onSubmit={handleCreateSubmit} className="space-y-4 rounded-xl border border-slate-800 bg-slate-950/60 p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-white">Zählung starten</h3>
            <span className="text-xs uppercase tracking-wide text-slate-500">Neu</span>
          </div>

          <div className="grid gap-3">
            <label className="space-y-1 text-sm">
              <span className="text-slate-300">Tenant-ID</span>
              <input
                value={createForm.tenantId}
                onChange={event => setCreateForm(previous => ({ ...previous, tenantId: event.target.value }))}
                className="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                placeholder="tenant-123"
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="text-slate-300">Standort-Code</span>
                <input
                  value={createForm.locationCode}
                  onChange={event => setCreateForm(previous => ({ ...previous, locationCode: event.target.value }))}
                  className="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="REGAL-01"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-slate-300">Beschreibung</span>
                <input
                  value={createForm.locationDescription}
                  onChange={event =>
                    setCreateForm(previous => ({ ...previous, locationDescription: event.target.value }))
                  }
                  className="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="Trockenlager"
                />
              </label>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-500">
              <span>Positionen</span>
              <button
                type="button"
                onClick={() =>
                  setCreateForm(previous => ({
                    ...previous,
                    items: [...previous.items, { ...defaultCountLine }],
                  }))
                }
                className="rounded-md border border-slate-800 px-2 py-1 font-semibold text-slate-200 transition hover:border-indigo-500 hover:text-indigo-200"
              >
                Position hinzufügen
              </button>
            </div>

            <div className="space-y-3">
              {createForm.items.map((line, index) => (
                <div key={index} className="grid gap-3 sm:grid-cols-5">
                  <input
                    placeholder="SKU"
                    value={line.productSku}
                    onChange={event =>
                      setCreateForm(previous => {
                        const next = [...previous.items];
                        next[index] = { ...next[index], productSku: event.target.value };
                        return { ...previous, items: next };
                      })
                    }
                    className="sm:col-span-2 rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <input
                    placeholder="Soll"
                    value={line.expectedQuantity}
                    onChange={event =>
                      setCreateForm(previous => {
                        const next = [...previous.items];
                        next[index] = { ...next[index], expectedQuantity: event.target.value };
                        return { ...previous, items: next };
                      })
                    }
                    className="rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <input
                    placeholder="Ist"
                    value={line.countedQuantity}
                    onChange={event =>
                      setCreateForm(previous => {
                        const next = [...previous.items];
                        next[index] = { ...next[index], countedQuantity: event.target.value };
                        return { ...previous, items: next };
                      })
                    }
                    className="rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <div className="flex gap-2">
                    <input
                      placeholder="Los / Charge"
                      value={line.batchLotNumber}
                      onChange={event =>
                        setCreateForm(previous => {
                          const next = [...previous.items];
                          next[index] = { ...next[index], batchLotNumber: event.target.value };
                          return { ...previous, items: next };
                        })
                      }
                      className="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    {createForm.items.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setCreateForm(previous => ({
                            ...previous,
                            items: previous.items.filter((_, itemIndex) => itemIndex !== index),
                          }))
                        }
                        className="rounded-md border border-slate-800 px-2 py-2 text-xs font-semibold uppercase tracking-wide text-rose-300 transition hover:border-rose-500 hover:text-rose-200"
                      >
                        Entfernen
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {createError && (
            <p className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{createError}</p>
          )}

          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-wide text-slate-500">Differenzen werden beim Abschluss verbucht.</p>
            <button
              type="submit"
              disabled={creating}
              className="rounded-md bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-indigo-500/60"
            >
              {creating ? 'Speichere…' : 'Zählung anlegen'}
            </button>
          </div>
        </form>

        <form onSubmit={handleFinalizeSubmit} className="space-y-4 rounded-xl border border-slate-800 bg-slate-950/60 p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-white">Zählung abschließen</h3>
            <span className="text-xs uppercase tracking-wide text-slate-500">Buchen</span>
          </div>

          <div className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="text-slate-300">Inventur-ID</span>
                <input
                  value={finalizeForm.inventoryCountId}
                  onChange={event =>
                    setFinalizeForm(previous => ({ ...previous, inventoryCountId: event.target.value }))
                  }
                  className="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="123"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-slate-300">Tenant-ID</span>
                <input
                  value={finalizeForm.tenantId}
                  onChange={event => setFinalizeForm(previous => ({ ...previous, tenantId: event.target.value }))}
                  className="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="tenant-123"
                />
              </label>
            </div>

            <label className="flex items-center gap-3 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={finalizeForm.bookDifferences}
                onChange={event =>
                  setFinalizeForm(previous => ({ ...previous, bookDifferences: event.target.checked }))
                }
                className="h-4 w-4 rounded border border-slate-700 bg-slate-900 text-indigo-500 focus:ring-indigo-500"
              />
              Differenzen automatisch verbuchen
            </label>

            <label className="space-y-1 text-sm">
              <span className="text-slate-300">Standard-Begründung</span>
              <input
                value={finalizeForm.defaultAdjustmentReason}
                onChange={event =>
                  setFinalizeForm(previous => ({ ...previous, defaultAdjustmentReason: event.target.value }))
                }
                className="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                placeholder="Inventurdifferenz"
              />
            </label>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-500">
              <span>Zählpositionen</span>
              <button
                type="button"
                onClick={() =>
                  setFinalizeForm(previous => ({
                    ...previous,
                    items: [...previous.items, { ...defaultFinalizeLine }],
                  }))
                }
                className="rounded-md border border-slate-800 px-2 py-1 font-semibold text-slate-200 transition hover:border-indigo-500 hover:text-indigo-200"
              >
                Position hinzufügen
              </button>
            </div>

            <div className="space-y-3">
              {finalizeForm.items.map((line, index) => (
                <div key={index} className="grid gap-3 sm:grid-cols-5">
                  <input
                    placeholder="SKU"
                    value={line.productSku}
                    onChange={event =>
                      setFinalizeForm(previous => {
                        const next = [...previous.items];
                        next[index] = { ...next[index], productSku: event.target.value };
                        return { ...previous, items: next };
                      })
                    }
                    className="sm:col-span-2 rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <input
                    placeholder="Ist"
                    value={line.countedQuantity}
                    onChange={event =>
                      setFinalizeForm(previous => {
                        const next = [...previous.items];
                        next[index] = { ...next[index], countedQuantity: event.target.value };
                        return { ...previous, items: next };
                      })
                    }
                    className="rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <input
                    placeholder="Los / Charge"
                    value={line.batchLotNumber}
                    onChange={event =>
                      setFinalizeForm(previous => {
                        const next = [...previous.items];
                        next[index] = { ...next[index], batchLotNumber: event.target.value };
                        return { ...previous, items: next };
                      })
                    }
                    className="rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <input
                    placeholder="Begründung"
                    value={line.adjustmentReason}
                    onChange={event =>
                      setFinalizeForm(previous => {
                        const next = [...previous.items];
                        next[index] = { ...next[index], adjustmentReason: event.target.value };
                        return { ...previous, items: next };
                      })
                    }
                    className="rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  {finalizeForm.items.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setFinalizeForm(previous => ({
                          ...previous,
                          items: previous.items.filter((_, itemIndex) => itemIndex !== index),
                        }))
                      }
                      className="rounded-md border border-slate-800 px-2 py-2 text-xs font-semibold uppercase tracking-wide text-rose-300 transition hover:border-rose-500 hover:text-rose-200"
                    >
                      Entfernen
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {finalizeError && (
            <p className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{finalizeError}</p>
          )}

          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-wide text-slate-500">Abschlüsse erzeugen automatisch Anpassungsbuchungen.</p>
            <button
              type="submit"
              disabled={finalizing}
              className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-500/60"
            >
              {finalizing ? 'Buchen…' : 'Inventur abschließen'}
            </button>
          </div>
        </form>
      </div>

      {createResult && (
        <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/60 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm">
                <span className="inline-flex items-center rounded-full border border-sky-400/50 bg-sky-500/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-sky-200">
                  Offen
                </span>
                <span className="text-slate-400">Inventur #{createResult.id}</span>
              </div>
              <h3 className="text-base font-semibold text-white">Erfasste Zählpositionen</h3>
            </div>
            <div className="text-xs text-slate-400">
              Gestartet am {new Date(createResult.startedAt).toLocaleString('de-DE')}
            </div>
          </div>
          <InventoryItemsTable items={createResult.items} />
        </div>
      )}

      {finalizeResult && (
        <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-950/60 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm">
                <span className="inline-flex items-center rounded-full border border-emerald-400/60 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-200">
                  Abgeschlossen
                </span>
                <span className="text-slate-400">Inventur #{finalizeResult.id}</span>
              </div>
              <h3 className="text-base font-semibold text-white">Ergebnis der Inventurzählung</h3>
            </div>
            <div className="text-xs text-slate-400">
              {finalizeResult.completedAt
                ? `Abgeschlossen am ${new Date(finalizeResult.completedAt).toLocaleString('de-DE')}`
                : 'Abschluss ohne Zeitstempel'}
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-slate-200">Aktualisierte Positionen</h4>
            <InventoryItemsTable items={finalizeResult.updatedItems.length ? finalizeResult.updatedItems : finalizeResult.items} />
          </div>

          {adjustments.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-slate-200">Erzeugte Anpassungen</h4>
              <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900/60">
                <table className="min-w-full divide-y divide-slate-800 text-sm">
                  <thead className="bg-slate-900/60 text-left text-slate-400">
                    <tr>
                      <th className="px-4 py-3 font-medium">SKU</th>
                      <th className="px-4 py-3 font-medium">Los</th>
                      <th className="px-4 py-3 font-medium text-right">Mengenänderung</th>
                      <th className="px-4 py-3 font-medium">Grund</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {adjustments.map(adjustment => (
                      <tr key={adjustment.id} className="hover:bg-slate-900/70">
                        <td className="px-4 py-3 font-mono text-xs text-indigo-200">
                          {adjustment.product?.sku ?? adjustment.productId}
                        </td>
                        <td className="px-4 py-3 text-slate-300">
                          {adjustment.batch?.lotNumber ?? adjustment.batchId ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-100">
                          {differenceLabel(adjustment.quantityChange)}
                        </td>
                        <td className="px-4 py-3 text-slate-300">{adjustment.reason ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
