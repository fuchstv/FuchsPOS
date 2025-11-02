import { create } from 'zustand';
import api from '../api/client';
import {
  CartItem,
  CatalogItem,
  PaymentIntent,
  PaymentMethod,
  PaymentMethodDefinition,
  PaymentRequestPayload,
  PaymentState,
  SaleResponse,
  CartTotals,
} from './types';
import {
  enqueuePayment,
  ensureTerminalId,
  listQueuedPayments,
  loadCart as loadPersistedCart,
  loadCatalog as loadPersistedCatalog,
  loadPreferredPaymentMethods,
  markPaymentFailed,
  persistCart as persistCartLocally,
  persistCatalog,
} from './offlineStorage';

const defaultCatalog: CatalogItem[] = [
  { id: 'espresso', name: 'Espresso', price: 2.5, category: 'Beverage' },
  { id: 'flat-white', name: 'Flat White', price: 3.2, category: 'Beverage' },
  { id: 'iced-latte', name: 'Iced Latte', price: 3.8, category: 'Beverage' },
  { id: 'croissant', name: 'Butter Croissant', price: 2.1, category: 'Food' },
  { id: 'cheesecake', name: 'Cheesecake Slice', price: 3.5, category: 'Food' },
  { id: 'beans', name: 'House Blend Beans', price: 9.9, category: 'Merch' },
];

const defaultPaymentMethods: PaymentMethodDefinition[] = [
  {
    type: 'CARD',
    label: 'Kartenzahlung',
    description: 'EC- und Kreditkartenzahlung über das Terminal',
    supportsOffline: true,
  },
  {
    type: 'CASH',
    label: 'Barzahlung',
    description: 'Sofortige Verbuchung von Bargeldzahlungen',
    supportsOffline: true,
  },
  {
    type: 'MOBILE',
    label: 'Mobile Payment',
    description: 'Apple Pay, Google Pay und weitere Wallets',
    supportsOffline: false,
  },
  {
    type: 'VOUCHER',
    label: 'Gutschein',
    description: 'Einlösen von Rabatt- und Geschenkgutscheinen',
    supportsOffline: true,
  },
];

type ProcessPaymentInput = {
  paymentMethod: PaymentMethod;
  customerEmail?: string;
  reference?: string;
};

type PosStore = {
  catalog: CatalogItem[];
  cart: CartItem[];
  paymentMethods: PaymentMethodDefinition[];
  paymentState: PaymentState;
  latestSale?: SaleResponse['sale'];
  error?: string;
  isOffline: boolean;
  queuedPayments: PaymentIntent[];
  terminalId: string;
  initialized: boolean;
  addToCart: (id: string) => void;
  removeFromCart: (id: string) => void;
  clearCart: () => void;
  processPayment: (input: ProcessPaymentInput) => Promise<void>;
  initialize: () => Promise<void>;
  setOffline: (isOffline: boolean) => void;
  syncQueuedPayments: () => Promise<void>;
};

const calculateCartTotals = (cart: CartItem[], catalog: CatalogItem[]): CartTotals => {
  const net = cart.reduce((sum, item) => {
    const product = catalog.find(productItem => productItem.id === item.id);
    if (!product) return sum;
    return sum + product.price * item.quantity;
  }, 0);
  const tax = Number((net * 0.07).toFixed(2));
  const gross = Number((net + tax).toFixed(2));
  return { net, tax, gross };
};

const buildCartPayload = (
  cart: CartItem[],
  catalog: CatalogItem[],
  totals: CartTotals,
  terminalId: string,
) => ({
  terminalId,
  currency: 'EUR',
  total: totals.gross,
  tax: totals.tax,
  items: cart.map(item => {
    const product = catalog.find(productItem => productItem.id === item.id);
    if (!product) {
      throw new Error(`Produkt ${item.id} konnte nicht gefunden werden.`);
    }
    return {
      id: product.id,
      name: product.name,
      unitPrice: product.price,
      quantity: item.quantity,
      category: product.category,
    };
  }),
});

const mergePaymentPreferences = (
  preferred: PaymentMethod[] | null,
  defaults: PaymentMethodDefinition[],
): PaymentMethodDefinition[] => {
  if (!preferred?.length) {
    return defaults;
  }

  const mapped = new Map(defaults.map(method => [method.type, method] as const));
  const ordered: PaymentMethodDefinition[] = [];

  preferred.forEach(method => {
    const definition = mapped.get(method);
    if (definition) {
      ordered.push(definition);
    }
  });

  defaults.forEach(definition => {
    if (!ordered.some(item => item.type === definition.type)) {
      ordered.push(definition);
    }
  });

  return ordered;
};

export const usePosStore = create<PosStore>((set, get) => {
  const persistCart = async (cart: CartItem[]) => {
    const { catalog, terminalId } = get();
    const totals = calculateCartTotals(cart, catalog);
    await persistCartLocally(cart, totals);

    if (!terminalId) {
      return totals;
    }

    try {
      await api.post('/pos/cart/sync', buildCartPayload(cart, catalog, totals, terminalId));
      set({ isOffline: false });
    } catch (error: any) {
      if (!error?.response) {
        set({ isOffline: true });
      } else {
        console.warn('Warenkorb konnte nicht synchronisiert werden', error);
      }
    }

    return totals;
  };

  const buildPaymentPayload = (
    cart: CartItem[],
    paymentMethod: PaymentMethod,
    customerEmail?: string,
    reference?: string,
  ): PaymentRequestPayload => {
    const { catalog, terminalId } = get();
    const items = cart.map(item => {
      const product = catalog.find(productItem => productItem.id === item.id);
      if (!product) {
        throw new Error(`Produkt ${item.id} konnte nicht gefunden werden.`);
      }
      return {
        name: product.name,
        unitPrice: product.price,
        quantity: item.quantity,
      };
    });

    return {
      items,
      paymentMethod,
      customerEmail,
      reference,
      terminalId,
    };
  };

  return {
    catalog: defaultCatalog,
    cart: [],
    paymentMethods: defaultPaymentMethods,
    paymentState: 'idle',
    latestSale: undefined,
    error: undefined,
    isOffline: typeof navigator !== 'undefined' ? !navigator.onLine : false,
    queuedPayments: [],
    terminalId: '',
    initialized: false,
    addToCart: id => {
      const state = get();
      const existing = state.cart.find(item => item.id === id);
      const updatedCart = existing
        ? state.cart.map(item => (item.id === id ? { ...item, quantity: item.quantity + 1 } : item))
        : [...state.cart, { id, quantity: 1 }];

      set({
        cart: updatedCart,
        error: undefined,
        paymentState: state.paymentState === 'success' ? 'idle' : state.paymentState,
      });

      void persistCart(updatedCart);
    },
    removeFromCart: id => {
      const state = get();
      const existing = state.cart.find(item => item.id === id);
      if (!existing) {
        return;
      }

      const updatedCart =
        existing.quantity === 1
          ? state.cart.filter(item => item.id !== id)
          : state.cart.map(item => (item.id === id ? { ...item, quantity: item.quantity - 1 } : item));

      set({
        cart: updatedCart,
        error: undefined,
        paymentState: state.paymentState === 'success' ? 'idle' : state.paymentState,
      });

      void persistCart(updatedCart);
    },
    clearCart: () => {
      set(state => ({
        cart: [],
        paymentState: 'idle',
        error: undefined,
        latestSale: state.latestSale,
      }));
      void (async () => {
        await persistCart([]);
      })();
    },
    processPayment: async ({ paymentMethod, customerEmail, reference }) => {
      const state = get();
      if (state.cart.length === 0) {
        set({ error: 'Füge zuerst Produkte zum Warenkorb hinzu.' });
        return;
      }

      const payload = buildPaymentPayload(state.cart, paymentMethod, customerEmail, reference);

      set({ paymentState: 'processing', error: undefined });

      try {
        const { data } = await api.post<SaleResponse>('/pos/payments', payload);

        set({
          paymentState: 'success',
          latestSale: data.sale,
          cart: [],
          error: undefined,
          isOffline: false,
        });

        await persistCart([]);
      } catch (error: any) {
        const message =
          error?.response?.data?.message ?? error?.message ?? 'Zahlung konnte nicht verarbeitet werden.';

        if (!error?.response) {
          const queued = await enqueuePayment(payload);
          set(state => ({
            paymentState: 'queued',
            error: 'Zahlung offline gespeichert. Sie wird bei bestehender Verbindung übertragen.',
            queuedPayments: [...state.queuedPayments, queued],
            isOffline: true,
            cart: [],
          }));
          await persistCart([]);
        } else {
          set({ paymentState: 'error', error: message });
        }
      }
    },
    initialize: async () => {
      if (get().initialized) {
        return;
      }

      const [storedCatalog, storedCart, queuedPayments, preferredMethods] = await Promise.all([
        loadPersistedCatalog(),
        loadPersistedCart(),
        listQueuedPayments(),
        loadPreferredPaymentMethods(),
      ]);

      const catalog = storedCatalog?.length ? storedCatalog : defaultCatalog;
      if (!storedCatalog?.length) {
        await persistCatalog(catalog);
      }

      const terminalId = await ensureTerminalId();

      set({
        catalog,
        cart: storedCart?.items ?? [],
        queuedPayments,
        paymentMethods: mergePaymentPreferences(preferredMethods, defaultPaymentMethods),
        terminalId,
        initialized: true,
        isOffline:
          typeof navigator !== 'undefined'
            ? !navigator.onLine || queuedPayments.some(payment => payment.status === 'pending')
            : queuedPayments.some(payment => payment.status === 'pending'),
      });

      if (queuedPayments.length && (typeof navigator === 'undefined' || navigator.onLine)) {
        await get().syncQueuedPayments();
      }
    },
    setOffline: isOffline => set({ isOffline }),
    syncQueuedPayments: async () => {
      const state = get();
      if (!state.queuedPayments.length) {
        return;
      }

      for (const payment of [...state.queuedPayments]) {
        try {
          const { data } = await api.post<SaleResponse>('/pos/payments', payment.payload);

          await persistCart([]);

          set(current => ({
            queuedPayments: current.queuedPayments.filter(item => item.id !== payment.id),
            paymentState: 'success',
            latestSale: data.sale,
            cart: [],
            error: undefined,
            isOffline: typeof navigator !== 'undefined' ? !navigator.onLine : false,
          }));
        } catch (error: any) {
          if (!error?.response) {
            set({ isOffline: true, paymentState: 'queued' });
            break;
          }

          const message =
            error?.response?.data?.message ?? error?.message ?? 'Zahlung konnte nicht synchronisiert werden.';

          await markPaymentFailed(payment.id, message);

          set(current => ({
            queuedPayments: current.queuedPayments.map(item =>
              item.id === payment.id ? { ...item, status: 'failed', error: message } : item,
            ),
            paymentState: 'error',
            error: message,
          }));
        }
      }
    },
  };
});
