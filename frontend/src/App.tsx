import { useEffect, useMemo, useState } from 'react';
import api from './api/client';
import { usePosStore } from './store/posStore';

type HealthStatus = {
  status: string;
  timestamp: string;
  dependencies: {
    database: 'up' | 'down';
    cache: 'up' | 'down';
  };
};

const currency = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
});

export default function App() {
  const {
    catalog,
    cart,
    addToCart,
    removeFromCart,
    simulatePayment,
    clearCart,
    paymentState,
    latestSale,
    error,
  } = usePosStore();

  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);

  const cartWithDetails = useMemo(() =>
    cart
      .map(item => {
        const product = catalog.find(productItem => productItem.id === item.id);
        if (!product) return null;
        const lineTotal = product.price * item.quantity;
        return {
          ...product,
          quantity: item.quantity,
          lineTotal,
        };
      })
      .filter(Boolean) as Array<{
      id: string;
      name: string;
      price: number;
      category: string;
      quantity: number;
      lineTotal: number;
    }>,
  [cart, catalog],
  );

  const total = useMemo(
    () => cartWithDetails.reduce((sum, item) => sum + item.lineTotal, 0),
    [cartWithDetails],
  );

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const { data } = await api.get<HealthStatus>('/health');
        setHealth(data);
        setHealthError(null);
      } catch (err: any) {
        setHealth(null);
        setHealthError(err?.message ?? 'Health-Check fehlgeschlagen');
      }
    };

    fetchHealth();
    const interval = setInterval(fetchHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      <header className="sticky top-0 z-10 backdrop-blur bg-slate-950/70 border-b border-white/10">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">FuchsPOS</p>
            <h1 className="text-2xl font-semibold">Point of Sale Cockpit</h1>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="rounded-full bg-emerald-500/20 px-3 py-1 font-medium text-emerald-300">
              {cart.length} Artikel
            </span>
            <span className="rounded-full bg-brand/20 px-3 py-1 font-medium text-brand">
              {currency.format(total)}
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-8 md:flex-row">
        <section className="flex-1 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-200">Schnellwahl</h2>
            <button
              type="button"
              onClick={clearCart}
              className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-brand hover:text-brand"
            >
              Warenkorb leeren
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {catalog.map(product => (
              <article
                key={product.id}
                className="group rounded-2xl border border-white/5 bg-white/5 p-5 shadow-lg shadow-slate-950/40 transition hover:border-brand hover:bg-brand/10"
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-wide text-slate-400">{product.category}</p>
                  <span className="rounded-full bg-slate-900/60 px-2 py-1 text-xs text-slate-300">
                    {currency.format(product.price)}
                  </span>
                </div>
                <h3 className="mt-3 text-lg font-semibold text-slate-100">{product.name}</h3>
                <button
                  type="button"
                  onClick={() => addToCart(product.id)}
                  className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-brand-dark"
                >
                  Hinzufügen
                </button>
              </article>
            ))}
          </div>
        </section>

        <aside className="w-full max-w-md space-y-6 rounded-3xl border border-white/10 bg-slate-950/60 p-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-200">Warenkorb</h2>
            <p className="text-sm text-slate-400">Zusammenfassung deines aktuellen Vorgangs.</p>
          </div>

          <div className="space-y-3">
            {cartWithDetails.length === 0 ? (
              <p className="rounded-xl border border-dashed border-white/10 p-4 text-sm text-slate-400">
                Noch keine Produkte ausgewählt. Tippe links auf einen Artikel, um ihn
                hinzuzufügen.
              </p>
            ) : (
              cartWithDetails.map(item => (
                <div key={item.id} className="flex items-center justify-between rounded-xl bg-white/5 p-3">
                  <div>
                    <p className="font-medium text-slate-100">{item.name}</p>
                    <p className="text-xs text-slate-400">
                      {item.quantity} × {currency.format(item.price)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => removeFromCart(item.id)}
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-lg text-slate-200 hover:border-brand hover:text-brand"
                    >
                      −
                    </button>
                    <span className="w-10 text-center text-sm font-semibold">{item.quantity}</span>
                    <button
                      type="button"
                      onClick={() => addToCart(item.id)}
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-lg text-slate-200 hover:border-brand hover:text-brand"
                    >
                      +
                    </button>
                  </div>
                  <span className="w-20 text-right text-sm font-semibold text-slate-100">
                    {currency.format(item.lineTotal)}
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="space-y-2 rounded-2xl border border-brand/40 bg-brand/10 p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-300">Zwischensumme</span>
              <span className="font-semibold text-slate-100">{currency.format(total)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-300">MwSt. (7%)</span>
              <span className="font-semibold text-slate-100">{currency.format(total * 0.07)}</span>
            </div>
            <div className="flex items-center justify-between text-base font-semibold text-slate-100">
              <span>Gesamt</span>
              <span>{currency.format(total * 1.07)}</span>
            </div>
          </div>

          <div className="space-y-2">
            <button
              type="button"
              onClick={() => simulatePayment('CARD')}
              disabled={paymentState === 'processing'}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-base font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-500/60"
            >
              {paymentState === 'processing' ? 'Kartenzahlung läuft …' : 'Kartenzahlung abschließen'}
            </button>
            <button
              type="button"
              onClick={() => simulatePayment('CASH')}
              disabled={paymentState === 'processing'}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-base font-semibold text-slate-100 transition hover:border-amber-400 hover:text-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Barzahlung verbuchen
            </button>
          </div>

          {paymentState === 'success' && latestSale && (
            <div className="space-y-2 rounded-2xl border border-emerald-400/40 bg-emerald-500/10 p-4 text-sm text-emerald-200">
              <p className="font-semibold text-emerald-100">Beleg gespeichert</p>
              <p>Bonnummer: {latestSale.receiptNo}</p>
              <p>Gesamt: {currency.format(latestSale.total)}</p>
            </div>
          )}

          {paymentState === 'error' && error && (
            <div className="rounded-2xl border border-rose-400/40 bg-rose-500/10 p-4 text-sm text-rose-200">
              {error}
            </div>
          )}

          <section className="rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-slate-400">
            <h3 className="text-sm font-semibold text-slate-200">Systemstatus</h3>
            {health ? (
              <div className="mt-2 space-y-1">
                <p>
                  Backend:{' '}
                  <span className={health.status === 'ok' ? 'text-emerald-300' : 'text-amber-300'}>
                    {health.status.toUpperCase()}
                  </span>
                </p>
                <p>
                  Datenbank:{' '}
                  <span className={health.dependencies.database === 'up' ? 'text-emerald-300' : 'text-rose-300'}>
                    {health.dependencies.database.toUpperCase()}
                  </span>
                </p>
                <p>
                  Cache:{' '}
                  <span className={health.dependencies.cache === 'up' ? 'text-emerald-300' : 'text-rose-300'}>
                    {health.dependencies.cache.toUpperCase()}
                  </span>
                </p>
                <p>Stand: {new Date(health.timestamp).toLocaleTimeString('de-DE')}</p>
              </div>
            ) : (
              <p className="mt-2 text-rose-300">{healthError ?? 'Keine Health-Daten verfügbar.'}</p>
            )}
          </section>
        </aside>
      </main>
    </div>
  );
}
