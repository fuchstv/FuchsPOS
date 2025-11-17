import { useNavigate } from 'react-router-dom';
import CartSummary from './components/CartSummary';
import { useOrderStore } from '../../store/orderStore';

export default function OrderConfirmationPage() {
  const navigate = useNavigate();
  const { lastOrder, lastOrderItems } = useOrderStore(state => ({
    lastOrder: state.lastOrder,
    lastOrderItems: state.lastOrderItems,
  }));

  if (!lastOrder) {
    return (
      <div className="bg-white">
        <div className="mx-auto max-w-4xl px-4 py-20 text-center">
          <p className="text-lg font-semibold text-slate-900">Keine Bestellung gefunden.</p>
          <p className="text-sm text-slate-500">Lege eine Bestellung an, um hier die Bestätigung zu sehen.</p>
          <button
            type="button"
            className="mt-6 rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
            onClick={() => navigate('/order')}
          >
            Zum Katalog
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-b from-white to-slate-50">
      <div className="mx-auto max-w-4xl px-4 py-16">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-500">Vielen Dank</p>
          <h2 className="mt-2 text-3xl font-semibold text-slate-900">Deine Bestellung ist eingegangen</h2>
          <p className="mt-2 text-sm text-slate-500">
            Bestellreferenz <span className="font-semibold text-slate-900">{lastOrder.reference}</span>
          </p>
          {lastOrder.estimatedReadyAt && (
            <p className="mt-1 text-sm text-slate-500">
              Voraussichtliche Bereitstellung: {new Date(lastOrder.estimatedReadyAt).toLocaleString('de-DE')}
            </p>
          )}
          <div className="mt-6 text-left">
            <CartSummary showCheckoutCta={false} readOnly itemsOverride={lastOrderItems} />
          </div>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={() => navigate('/order')}
              className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
            >
              Weitere Bestellung aufgeben
            </button>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            >
              Zur Startseite
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
