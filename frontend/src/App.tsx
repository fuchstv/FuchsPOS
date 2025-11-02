import { useEffect, useMemo, useState } from 'react';
import api from './api/client';
import { usePosStore } from './store/posStore';
import type { PaymentMethod } from './store/types';

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
    processPayment,
    clearCart,
    paymentState,
    latestSale,
    error,
    paymentMethods,
    queuedPayments,
    isOffline,
    initialize,
    setOffline,
    syncQueuedPayments,
  } = usePosStore();

  const [customerEmail, setCustomerEmail] = useState('');
  const [receiptEmail, setReceiptEmail] = useState('');
  const [emailStatus, setEmailStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [processingMethod, setProcessingMethod] = useState<PaymentMethod | null>(null);

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

  const pendingQueuedCount = useMemo(
    () => queuedPayments.filter(payment => payment.status === 'pending').length,
    [queuedPayments],
  );

  const failedQueuedPayments = useMemo(
    () => queuedPayments.filter(payment => payment.status === 'failed'),
    [queuedPayments],
  );

  useEffect(() => {
    void initialize();
  }, [initialize]);

  useEffect(() => {
    const handleOnline = () => {
      setOffline(false);
      void syncQueuedPayments();
    };
    const handleOffline = () => setOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [setOffline, syncQueuedPayments]);

  useEffect(() => {
    if (paymentState === 'success' && customerEmail) {
      setReceiptEmail(customerEmail);
      setEmailStatus('idle');
      setEmailError(null);
    }
  }, [paymentState, customerEmail]);

  const handleProcessPayment = (method: PaymentMethod) => {
    setProcessingMethod(method);
    setEmailStatus('idle');
    setEmailError(null);

    void processPayment({
      paymentMethod: method,
      customerEmail: customerEmail.trim() ? customerEmail.trim() : undefined,
    }).finally(() => {
      setProcessingMethod(previous => (previous === method ? null : previous));
    });
  };

  const handleSendReceiptEmail = async () => {
    if (!latestSale) {
      return;
    }
    if (!receiptEmail.trim()) {
      setEmailStatus('error');
      setEmailError('Bitte eine E-Mail-Adresse angeben.');
      return;
    }

    setEmailStatus('sending');
    setEmailError(null);

    try {
      await api.post('/pos/receipts/email', {
        saleId: latestSale.id,
        email: receiptEmail.trim(),
      });
      setEmailStatus('sent');
    } catch (err: any) {
      const message =
        err?.response?.data?.message ?? err?.message ?? 'E-Mail konnte nicht versendet werden.';
      setEmailStatus('error');
      setEmailError(message);
    }
  };

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

          <div className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="customer-email" className="text-xs uppercase tracking-wide text-slate-400">
                Kunden-E-Mail (optional)
              </label>
              <input
                id="customer-email"
                type="email"
                value={customerEmail}
                onChange={event => setCustomerEmail(event.target.value)}
                placeholder="kunde@example.com"
                className="w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-brand focus:outline-none"
              />
              <p className="text-xs text-slate-500">
                Wenn angegeben, wird der digitale Bon automatisch nach erfolgreicher Zahlung versendet.
              </p>
            </div>

            <div className="space-y-2">
              {paymentMethods.map(method => {
                const disabled =
                  paymentState === 'processing' || (isOffline && !method.supportsOffline) || cartWithDetails.length === 0;
                const isProcessing = processingMethod === method.type && paymentState === 'processing';
                const baseButtonClasses =
                  method.type === 'CARD' || method.type === 'MOBILE'
                    ? 'bg-emerald-500 text-emerald-950 hover:bg-emerald-400 disabled:bg-emerald-500/60'
                    : 'border border-white/10 text-slate-100 hover:border-amber-400 hover:text-amber-200 disabled:opacity-60';

                return (
                  <button
                    key={method.type}
                    type="button"
                    onClick={() => handleProcessPayment(method.type)}
                    disabled={disabled}
                    className={`flex w-full items-center justify-between rounded-xl px-4 py-3 text-left transition focus:outline-none focus:ring-2 focus:ring-brand disabled:cursor-not-allowed ${baseButtonClasses}`}
                  >
                    <div>
                      <p className="text-sm font-semibold">
                        {isProcessing ? `${method.label} läuft …` : method.label}
                      </p>
                      <p className="text-xs text-slate-200/80">{method.description}</p>
                    </div>
                    <span
                      className={`text-xs font-medium ${
                        method.supportsOffline ? 'text-emerald-200' : 'text-slate-400'
                      }`}
                    >
                      {method.supportsOffline ? (isOffline ? 'Offline-fähig' : 'Offline möglich') : 'Online erforderlich'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {isOffline && (
            <div className="rounded-2xl border border-amber-400/40 bg-amber-500/10 p-4 text-sm text-amber-100">
              Offline-Modus aktiv.{' '}
              {pendingQueuedCount > 0
                ? `Noch ${pendingQueuedCount} Zahlung${pendingQueuedCount > 1 ? 'en' : ''} in der Warteschlange.`
                : 'Neue Zahlungen werden lokal zwischengespeichert.'}
            </div>
          )}

          {paymentState === 'success' && latestSale && (
            <div className="space-y-2 rounded-2xl border border-emerald-400/40 bg-emerald-500/10 p-4 text-sm text-emerald-200">
              <p className="font-semibold text-emerald-100">Beleg gespeichert</p>
              <p>Bonnummer: {latestSale.receiptNo}</p>
              <p>Gesamt: {currency.format(latestSale.total)}</p>
              <div className="mt-3 space-y-2 text-emerald-100/90">
                <label htmlFor="receipt-email" className="text-xs uppercase tracking-wide text-emerald-200/70">
                  Bon erneut per E-Mail senden
                </label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    id="receipt-email"
                    type="email"
                    value={receiptEmail}
                    onChange={event => {
                      setReceiptEmail(event.target.value);
                      setEmailStatus('idle');
                      setEmailError(null);
                    }}
                    placeholder="kunde@example.com"
                    className="flex-1 rounded-xl border border-emerald-300/40 bg-emerald-900/40 px-3 py-2 text-sm text-emerald-50 placeholder:text-emerald-200/60 focus:border-emerald-300 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleSendReceiptEmail}
                    disabled={emailStatus === 'sending' || !receiptEmail.trim()}
                    className="rounded-xl bg-emerald-400 px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-emerald-400/60"
                  >
                    {emailStatus === 'sending' ? 'Versand …' : 'E-Mail senden'}
                  </button>
                </div>
                {emailError && <p className="text-xs text-rose-200">{emailError}</p>}
                {emailStatus === 'sent' && (
                  <p className="text-xs text-emerald-200">E-Mail wurde erfolgreich verschickt.</p>
                )}
              </div>
            </div>
          )}

          {paymentState === 'queued' && (
            <div className="rounded-2xl border border-amber-400/40 bg-amber-500/10 p-4 text-sm text-amber-100">
              {error ?? 'Zahlung wurde offline gespeichert und wird bei Verbindung automatisch übertragen.'}
            </div>
          )}

          {paymentState === 'error' && error && (
            <div className="rounded-2xl border border-rose-400/40 bg-rose-500/10 p-4 text-sm text-rose-200">
              {error}
            </div>
          )}

          {queuedPayments.length > 0 && (
            <section className="space-y-2 rounded-2xl border border-white/10 bg-slate-900/70 p-4 text-xs text-slate-300">
              <div className="flex items-center justify-between text-sm text-slate-200">
                <h3 className="font-semibold">Offline-Warteschlange</h3>
                <span>{queuedPayments.length} Vorgang{queuedPayments.length > 1 ? 'e' : ''}</span>
              </div>
              <ul className="space-y-1">
                {queuedPayments.map(payment => (
                  <li
                    key={payment.id}
                    className="flex items-center justify-between rounded-lg bg-slate-950/60 px-3 py-2"
                  >
                    <span>{new Date(payment.createdAt).toLocaleTimeString('de-DE')}</span>
                    <span
                      className={`text-xs font-semibold ${
                        payment.status === 'failed' ? 'text-rose-300' : 'text-emerald-300'
                      }`}
                    >
                      {payment.status === 'failed' ? 'Fehlgeschlagen' : 'Ausstehend'}
                    </span>
                  </li>
                ))}
              </ul>
              {failedQueuedPayments.length > 0 && (
                <p className="text-xs text-rose-300">
                  {failedQueuedPayments.length} Vorgang{failedQueuedPayments.length > 1 ? 'e' : ''} benötigen
                  Aufmerksamkeit. Bitte prüfe die Zahlungsmittel oder versuche es erneut.
                </p>
              )}
            </section>
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
