import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import CartSummary from './components/CartSummary';
import { useOrderStore } from '../../store/orderStore';

export default function ProductCatalogPage() {
  const navigate = useNavigate();
  const { products, productsLoading, productsError, fetchProducts, addToCart, cart } = useOrderStore(state => ({
    products: state.products,
    productsLoading: state.productsLoading,
    productsError: state.productsError,
    fetchProducts: state.fetchProducts,
    addToCart: state.addToCart,
    cart: state.cart,
  }));

  useEffect(() => {
    if (!products.length) {
      fetchProducts();
    }
  }, [products.length, fetchProducts]);

  return (
    <div className="bg-gradient-to-b from-white to-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="grid gap-8 lg:grid-cols-[2fr,1fr]">
          <section>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-semibold text-slate-900">Produktkatalog</h2>
                <p className="text-sm text-slate-500">
                  Wähle aus unseren beliebtesten Produkten. Alle Preise verstehen sich inkl. MwSt.
                </p>
              </div>
              <button
                type="button"
                className="text-sm font-semibold text-indigo-600 hover:text-indigo-500"
                onClick={() => fetchProducts()}
              >
                Aktualisieren
              </button>
            </div>

            {productsLoading && <p className="mt-4 text-sm text-slate-500">Produkte werden geladen…</p>}
            {productsError && <p className="mt-4 text-sm text-red-500">{productsError}</p>}

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {!productsLoading && products.length === 0 && (
                <p className="text-sm text-slate-500">Momentan sind keine Produkte verfügbar.</p>
              )}
              {products.map(product => {
                const quantity = cart.find(item => item.productId === product.id)?.quantity ?? 0;
                const soldOut = product.availableQuantity <= 0;
                return (
                  <div key={product.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-base font-semibold text-slate-900">{product.name}</p>
                        <p className="text-sm text-slate-500">{product.description}</p>
                      </div>
                      <p className="text-lg font-semibold text-slate-900">{(product.price / 100).toFixed(2)} €</p>
                    </div>
                    {product.tags && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {product.tags.map(tag => (
                          <span key={tag} className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="mt-4 flex items-center justify-between">
                      <p className="text-xs text-slate-500">Noch {product.availableQuantity} Stück verfügbar</p>
                      <button
                        type="button"
                        onClick={() => addToCart(product.id)}
                        disabled={soldOut}
                        className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        {soldOut ? 'Ausverkauft' : quantity ? `Im Warenkorb (${quantity})` : 'In den Warenkorb'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
          <aside>
            <CartSummary showCheckoutCta={cart.length > 0} />
            {cart.length > 0 && (
              <button
                type="button"
                className="mt-4 w-full rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:border-indigo-200 hover:text-indigo-600"
                onClick={() => navigate('/checkout')}
              >
                Weiter zum Checkout
              </button>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
