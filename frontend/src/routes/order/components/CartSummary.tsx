import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrderStore } from '../../../store/orderStore';

interface CartSummaryProps {
  showCheckoutCta?: boolean;
  readOnly?: boolean;
  itemsOverride?: {
    productId: string;
    name: string;
    description?: string;
    price: number;
    quantity: number;
  }[];
}

export default function CartSummary({ showCheckoutCta = true, readOnly = false, itemsOverride }: CartSummaryProps) {
  const navigate = useNavigate();
  const { cart, products, updateCartItem, removeFromCart } = useOrderStore(state => ({
    cart: state.cart,
    products: state.products,
    updateCartItem: state.updateCartItem,
    removeFromCart: state.removeFromCart,
  }));

  const items = useMemo(() => {
    if (itemsOverride) {
      return itemsOverride.map(item => ({
        productId: item.productId,
        product: { name: item.name, description: item.description, price: item.price },
        quantity: item.quantity,
        subtotal: item.price * item.quantity,
      }));
    }
    return cart
      .map(item => {
        const product = products.find(entry => entry.id === item.productId);
        if (!product) {
          return undefined;
        }
        return {
          ...item,
          product,
          subtotal: product.price * item.quantity,
        };
      })
      .filter((entry): entry is { productId: string; product: typeof products[number]; quantity: number; subtotal: number } =>
        Boolean(entry),
      );
  }, [cart, products, itemsOverride]);

  const total = useMemo(() => items.reduce((sum, item) => sum + (item?.subtotal ?? 0), 0), [items]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Warenkorb</h2>
          <p className="text-sm text-slate-500">{items.length} Positionen</p>
        </div>
        <p className="text-xl font-semibold text-slate-900">{(total / 100).toFixed(2)} €</p>
      </div>

      <div className="mt-4 space-y-4">
        {items.length === 0 && (
          <p className="text-sm text-slate-500">Füge Produkte hinzu, um deine Bestellung zu starten.</p>
        )}
        {items.map(item => (
          <div key={item?.productId} className="flex items-start gap-3">
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-900">{item?.product?.name}</p>
              <p className="text-xs text-slate-500">{item?.product?.description}</p>
              <div className="mt-2 flex items-center gap-3 text-sm">
                {!readOnly && (
                  <>
                    <label className="text-slate-500" htmlFor={`qty-${item?.productId}`}>
                      Menge
                    </label>
                    <input
                      id={`qty-${item?.productId}`}
                      type="number"
                      min={1}
                      value={item?.quantity ?? 1}
                      onChange={event => updateCartItem(item!.productId, Number(event.target.value))}
                      className="w-20 rounded-lg border border-slate-200 px-3 py-1 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => removeFromCart(item!.productId)}
                      className="text-xs font-medium text-red-500 hover:text-red-600"
                    >
                      Entfernen
                    </button>
                  </>
                )}
              </div>
            </div>
            <p className="text-sm font-semibold text-slate-900">{((item?.subtotal ?? 0) / 100).toFixed(2)} €</p>
          </div>
        ))}
      </div>

      {showCheckoutCta && !readOnly && (
        <button
          type="button"
          onClick={() => navigate('/checkout')}
          className="mt-6 w-full rounded-full bg-indigo-600 px-4 py-2 text-center text-sm font-semibold text-white shadow hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-300"
          disabled={items.length === 0}
        >
          Zur Kasse
        </button>
      )}
    </div>
  );
}
