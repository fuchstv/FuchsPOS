import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import SlotPicker from './components/SlotPicker';
import CartSummary from './components/CartSummary';
import { useOrderStore } from '../../store/orderStore';

const validateEmail = (value: string) => /.+@.+\..+/.test(value);

export default function CheckoutPage() {
  const navigate = useNavigate();
  const {
    cart,
    products,
    customer,
    address,
    fulfillmentType,
    paymentMethod,
    paymentStatus,
    setCustomer,
    setAddress,
    setFulfillmentType,
    setPaymentMethod,
    preparePayment,
    submitOrder,
    isSubmitting,
    orderError,
    selectedSlot,
  } = useOrderStore(state => ({
    cart: state.cart,
    products: state.products,
    customer: state.customer,
    address: state.address,
    fulfillmentType: state.fulfillmentType,
    paymentMethod: state.paymentMethod,
    paymentStatus: state.paymentStatus,
    setCustomer: state.setCustomer,
    setAddress: state.setAddress,
    setFulfillmentType: state.setFulfillmentType,
    setPaymentMethod: state.setPaymentMethod,
    preparePayment: state.preparePayment,
    submitOrder: state.submitOrder,
    isSubmitting: state.isSubmitting,
    orderError: state.orderError,
    selectedSlot: state.selectedSlot,
  }));

  const [formError, setFormError] = useState<string>();
  const [paymentMessage, setPaymentMessage] = useState<string>();

  const cartTotal = useMemo(() => {
    return cart.reduce((sum, line) => {
      const product = products.find(entry => entry.id === line.productId);
      return product ? sum + product.price * line.quantity : sum;
    }, 0);
  }, [cart, products]);

  const handlePaymentIntent = async () => {
    setPaymentMessage(undefined);
    try {
      await preparePayment();
      setPaymentMessage('Kartenzahlung vorbereitet. Du kannst jetzt bestellen.');
    } catch (error) {
      setPaymentMessage(error instanceof Error ? error.message : 'Kartenzahlung fehlgeschlagen.');
    }
  };

  const validateCheckout = () => {
    if (!cart.length) {
      return 'Bitte füge Produkte hinzu.';
    }
    if (!customer.firstName || !customer.lastName || !validateEmail(customer.email)) {
      return 'Bitte gib gültige Kundendaten ein.';
    }
    if (!address.street || !address.postalCode || !address.city) {
      return 'Adresse für Lieferung oder Abholung fehlt.';
    }
    if (!selectedSlot) {
      return 'Bitte reserviere einen Slot.';
    }
    if (paymentMethod === 'card' && paymentStatus === 'idle') {
      return 'Bitte bereite zuerst die Kartenzahlung vor.';
    }
    return undefined;
  };

  const handleSubmit = async () => {
    const message = validateCheckout();
    if (message) {
      setFormError(message);
      return;
    }
    setFormError(undefined);
    try {
      await submitOrder();
      navigate('/confirmation');
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Bestellung fehlgeschlagen.');
    }
  };

  if (!cart.length) {
    return (
      <div className="bg-white">
        <div className="mx-auto max-w-4xl px-4 py-20 text-center">
          <p className="text-lg font-semibold text-slate-900">Der Warenkorb ist leer.</p>
          <p className="text-sm text-slate-500">Füge zuerst Produkte hinzu, bevor du zur Kasse gehst.</p>
          <button
            type="button"
            className="mt-6 rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
            onClick={() => navigate('/order')}
          >
            Zurück zum Katalog
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-b from-white to-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="grid gap-8 lg:grid-cols-[2fr,1fr]">
          <div className="space-y-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Kundendaten</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="text-sm text-slate-600">
                  Vorname
                  <input
                    type="text"
                    value={customer.firstName}
                    onChange={event => setCustomer({ firstName: event.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                  />
                </label>
                <label className="text-sm text-slate-600">
                  Nachname
                  <input
                    type="text"
                    value={customer.lastName}
                    onChange={event => setCustomer({ lastName: event.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                  />
                </label>
                <label className="text-sm text-slate-600">
                  E-Mail
                  <input
                    type="email"
                    value={customer.email}
                    onChange={event => setCustomer({ email: event.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                  />
                </label>
                <label className="text-sm text-slate-600">
                  Telefon
                  <input
                    type="tel"
                    value={customer.phone}
                    onChange={event => setCustomer({ phone: event.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                  />
                </label>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Lieferung oder Abholung</h2>
                  <p className="text-sm text-slate-500">Wähle den Modus aus und ergänze die Adresse.</p>
                </div>
                <div className="flex rounded-full border border-slate-200 bg-slate-100 p-1 text-sm font-semibold">
                  <button
                    type="button"
                    onClick={() => setFulfillmentType('DELIVERY')}
                    className={`flex-1 rounded-full px-3 py-1 ${
                      fulfillmentType === 'DELIVERY' ? 'bg-white text-slate-900 shadow' : 'text-slate-500'
                    }`}
                  >
                    Lieferung
                  </button>
                  <button
                    type="button"
                    onClick={() => setFulfillmentType('PICKUP')}
                    className={`flex-1 rounded-full px-3 py-1 ${
                      fulfillmentType === 'PICKUP' ? 'bg-white text-slate-900 shadow' : 'text-slate-500'
                    }`}
                  >
                    Abholung
                  </button>
                </div>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="text-sm text-slate-600">
                  Straße &amp; Hausnummer
                  <input
                    type="text"
                    value={address.street}
                    onChange={event => setAddress({ street: event.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                  />
                </label>
                <label className="text-sm text-slate-600">
                  PLZ
                  <input
                    type="text"
                    value={address.postalCode}
                    onChange={event => setAddress({ postalCode: event.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                  />
                </label>
                <label className="text-sm text-slate-600">
                  Stadt
                  <input
                    type="text"
                    value={address.city}
                    onChange={event => setAddress({ city: event.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                  />
                </label>
                <label className="text-sm text-slate-600">
                  Land
                  <input
                    type="text"
                    value={address.country}
                    onChange={event => setAddress({ country: event.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                  />
                </label>
              </div>
            </section>

            <SlotPicker type={fulfillmentType} />

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Zahlung</h2>
              <div className="mt-4 space-y-3">
                <label className="flex cursor-pointer items-center gap-3 rounded-2xl border p-4 text-sm">
                  <input
                    type="radio"
                    checked={paymentMethod === 'card'}
                    onChange={() => setPaymentMethod('card')}
                  />
                  <div>
                    <p className="font-semibold text-slate-900">Kartenzahlung</p>
                    <p className="text-xs text-slate-500">
                      Sicher über Stripe. Der Betrag beträgt {(cartTotal / 100).toFixed(2)} €.
                    </p>
                  </div>
                  <div className="ml-auto text-xs font-semibold text-indigo-600">Empfohlen</div>
                </label>
                {paymentMethod === 'card' && (
                  <button
                    type="button"
                    onClick={handlePaymentIntent}
                    className="w-full rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
                    disabled={paymentStatus === 'processing'}
                  >
                    {paymentStatus === 'ready' || paymentStatus === 'succeeded'
                      ? 'Zahlung aktualisieren'
                      : 'Kartenzahlung vorbereiten'}
                  </button>
                )}
                <label className="flex cursor-pointer items-center gap-3 rounded-2xl border p-4 text-sm">
                  <input
                    type="radio"
                    checked={paymentMethod === 'offline'}
                    onChange={() => setPaymentMethod('offline')}
                  />
                  <div>
                    <p className="font-semibold text-slate-900">Bar / Rechnung bei Übergabe</p>
                    <p className="text-xs text-slate-500">Perfekt bei Verbindungsproblemen oder Firmenkunden.</p>
                  </div>
                </label>
                {paymentMessage && <p className="text-xs text-indigo-600">{paymentMessage}</p>}
              </div>
            </section>

            {(formError || orderError) && (
              <p className="text-sm text-red-500">{formError ?? orderError}</p>
            )}

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => navigate('/order')}
                className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:border-indigo-200 hover:text-indigo-600"
              >
                Zurück
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="flex-1 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {isSubmitting ? 'Bestellung wird übermittelt…' : 'Jetzt kostenpflichtig bestellen'}
              </button>
            </div>
          </div>
          <aside className="space-y-4">
            <CartSummary showCheckoutCta={false} />
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-sm text-slate-500">Gesamtsumme</p>
              <p className="text-2xl font-semibold text-slate-900">{(cartTotal / 100).toFixed(2)} €</p>
              {paymentMethod === 'offline' && (
                <p className="mt-2 text-xs text-slate-500">
                  Bitte halte den Betrag passend bereit oder begleiche ihn per Rechnung.
                </p>
              )}
              {paymentMethod === 'card' && paymentStatus === 'ready' && (
                <p className="mt-2 text-xs text-emerald-600">Kartenzahlung reserviert.</p>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
