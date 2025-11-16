import GoodsReceiptImport from './components/GoodsReceiptImport';
import InventoryCounts from './components/InventoryCounts';
import PriceChangeForm from './components/PriceChangeForm';
import EanLookup from './components/EanLookup';
import { useInventoryRealtime } from './InventoryRealtimeContext';

const badgeTone: Record<string, string> = {
  'goods-receipt': 'border-emerald-400/60 bg-emerald-500/10 text-emerald-200',
  'count-created': 'border-sky-400/60 bg-sky-500/10 text-sky-200',
  'count-finalized': 'border-indigo-400/60 bg-indigo-500/10 text-indigo-200',
  'price-change': 'border-amber-400/60 bg-amber-500/10 text-amber-200',
};

/**
 * Renders the inventory dashboard, which provides an overview of inventory-related activities.
 * It includes components for importing goods receipts, managing inventory counts, and changing prices.
 * It also displays a real-time log of inventory events.
 * @returns {JSX.Element} The inventory dashboard component.
 */
export default function InventoryDashboard() {
  const { events } = useInventoryRealtime();

  return (
    <div className="mx-auto max-w-6xl space-y-10 px-4 py-6">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-indigo-400">Inventur</p>
        <h1 className="text-2xl font-semibold text-white">Inventur- und Preisverwaltung</h1>
        <p className="text-sm text-slate-400">
          Verwalten Sie Wareneingänge, Inventurzählungen und Preisänderungen. Live-Updates zeigen den aktuellen
          Fortschritt.
        </p>
      </header>

      <GoodsReceiptImport />
      <InventoryCounts />
      <PriceChangeForm />
      <EanLookup />

      <section className="space-y-4">
        <header className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Live-Updates</h2>
            <p className="text-sm text-slate-400">Neueste Ereignisse aus der Inventur in Echtzeit.</p>
          </div>
          <span className="text-xs uppercase tracking-wide text-slate-500">{events.length} Ereignisse</span>
        </header>

        {events.length ? (
          <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/60">
            <table className="min-w-full divide-y divide-slate-800 text-sm">
              <thead className="bg-slate-900/60 text-left text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Ereignis</th>
                  <th className="px-4 py-3 font-medium">Beschreibung</th>
                  <th className="px-4 py-3 font-medium">Zeitpunkt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900/80">
                {events.map(event => (
                  <tr key={event.id} className="hover:bg-slate-900/70">
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${
                          badgeTone[event.type] ?? 'border-slate-500/60 bg-slate-500/10 text-slate-200'
                        }`}
                      >
                        {event.title}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-300">{event.description ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-400">
                      {new Date(event.timestamp).toLocaleString('de-DE')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rounded-md border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-400">
            Noch keine Inventur-Ereignisse eingegangen.
          </p>
        )}
      </section>
    </div>
  );
}
