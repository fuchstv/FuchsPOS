import { create } from 'zustand';
import api from '../api/client';
import {
  CartItem,
  CatalogItem,
  CashEventRecord,
  PaymentIntent,
  PaymentMethod,
  PaymentMethodDefinition,
  PaymentRequestPayload,
  PaymentState,
  SaleRecord,
  SaleResponse,
  CartTotals,
  PreorderRecord,
} from './types';
import {
  enqueuePayment,
  ensureTerminalId,
  listQueuedPayments,
  loadCart as loadPersistedCart,
  loadCatalog as loadPersistedCatalog,
  loadPreferredPaymentMethods,
  persistCart as persistCartLocally,
  persistCatalog,
  patchQueuedPayment,
  removeQueuedPayment as removeQueuedPaymentRecord,
} from './offlineStorage';

const defaultCatalog: CatalogItem[] = [
  { id: 'espresso', name: 'Espresso', price: 2.5, category: 'Beverage', ean: '4006381333931' },
  { id: 'flat-white', name: 'Flat White', price: 3.2, category: 'Beverage', ean: '4012345678901' },
  { id: 'iced-latte', name: 'Iced Latte', price: 3.8, category: 'Beverage', ean: '4029876543216' },
  { id: 'croissant', name: 'Butter Croissant', price: 2.1, category: 'Food', ean: '4031111122228' },
  { id: 'cheesecake', name: 'Cheesecake Slice', price: 3.5, category: 'Food', ean: '4042222233335' },
  { id: 'beans', name: 'House Blend Beans', price: 9.9, category: 'Merch', ean: '4053333344442' },
];

const normalizeBarcode = (value: string) => value.replace(/[^0-9]/g, '');

const findCatalogProductByCode = (catalog: CatalogItem[], code: string) => {
  const trimmed = code.trim();
  if (!trimmed) {
    return null;
  }

  const digits = normalizeBarcode(trimmed);
  if (digits.length >= 8) {
    const match = catalog.find(item => item.ean && normalizeBarcode(item.ean) === digits);
    if (match) {
      return match;
    }
  }

  return catalog.find(item => item.id === trimmed) ?? null;
};

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

const POS_TENANT_STORAGE_KEY = 'fuchspos.posTenantId';

const resolveTenantIdFromContext = () => {
  const envTenantId = (import.meta.env.VITE_POS_TENANT_ID ?? '').trim();
  if (typeof window === 'undefined') {
    return envTenantId;
  }

  const storedTenantId = window.localStorage.getItem(POS_TENANT_STORAGE_KEY);
  if (storedTenantId && storedTenantId.trim()) {
    return storedTenantId.trim();
  }

  if (envTenantId) {
    window.localStorage.setItem(POS_TENANT_STORAGE_KEY, envTenantId);
    return envTenantId;
  }

  return '';
};

const persistTenantPreference = (tenantId: string) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(POS_TENANT_STORAGE_KEY, tenantId);
};

type RemoteCartResponse = {
  cart: {
    terminalId: string;
    items: Array<{
      id: string;
      name: string;
      unitPrice: number;
      quantity: number;
      category: CatalogItem['category'];
    }>;
    total: number;
    tax?: number;
    currency: string;
    updatedAt: string;
  };
  ttlSeconds: number | null;
};

/**
 * Defines the input for processing a payment.
 */
type ProcessPaymentInput = {
  /** The selected payment method. */
  paymentMethod: PaymentMethod;
  /** Optional customer email for sending a digital receipt. */
  customerEmail?: string;
  /** Optional reference for the payment (e.g., invoice number). */
  reference?: string;
};

/**
 * Defines the state and actions for the Point of Sale Zustand store.
 */
type PosStore = {
  /** The list of all available products. */
  catalog: CatalogItem[];
  /** The current list of items in the shopping cart. */
  cart: CartItem[];
  /** The available payment methods. */
  paymentMethods: PaymentMethodDefinition[];
  /** The current state of the payment process. */
  paymentState: PaymentState;
  /** The details of the most recently completed sale. */
  latestSale?: SaleResponse['sale'];
  /** Any error message related to the POS operations. */
  error?: string;
  /** A flag indicating if the POS is currently in offline mode. */
  isOffline: boolean;
  /** A queue of payments made while offline, waiting to be synced. */
  queuedPayments: PaymentIntent[];
  /** The unique identifier for this POS terminal. */
  terminalId: string;
  /** The active tenant identifier for the POS context. */
  tenantId: string | null;
  /** A flag indicating if the store has been initialized. */
  initialized: boolean;
  /** A list of active preorders. */
  preorders: PreorderRecord[];
  /** A list of recent cash-related events. */
  cashEvents: CashEventRecord[];
  /** Adds an item to the shopping cart. */
  addToCart: (id: string) => void;
  /** Removes an item from the shopping cart. */
  removeFromCart: (id: string) => void;
  /** Clears all items from the shopping cart. */
  clearCart: () => void;
  /** Processes a payment for the current cart contents. */
  processPayment: (input: ProcessPaymentInput) => Promise<void>;
  /** Initializes the store by loading persisted data and fetching initial state from the API. */
  initialize: () => Promise<void>;
  /** Sets the offline status of the POS. */
  setOffline: (isOffline: boolean) => void;
  /** Attempts to sync any queued offline payments with the server. */
  syncQueuedPayments: () => Promise<void>;
  /** Manually triggers a retry for a specific queued payment. */
  retryQueuedPayment: (id: string) => Promise<void>;
  /** Removes a payment from the offline queue. */
  removeQueuedPayment: (id: string) => Promise<void>;
  /** Updates a preorder record in the store. */
  updatePreorder: (preorder: PreorderRecord) => void;
  /** Adds a new cash event to the store. */
  addCashEvent: (event: CashEventRecord) => void;
  /** Applies the effects of a sale that was completed on another terminal. */
  applyRemoteSale: (sale: SaleRecord) => void;
  /** Updates the tenant context manually. */
  setTenantId: (tenantId: string) => void;
};

const MAX_CASH_EVENTS = 50;

const BASE_RETRY_DELAY_MS = 5000;
const MAX_RETRY_DELAY_MS = 120000;
const RETRY_JITTER_MS = 1000;

const computeNextRetryAt = (retryCount: number) => {
  const exponent = Math.min(retryCount, 6);
  const baseDelay = BASE_RETRY_DELAY_MS * 2 ** exponent;
  const delay = Math.min(baseDelay, MAX_RETRY_DELAY_MS) + Math.floor(Math.random() * RETRY_JITTER_MS);
  return new Date(Date.now() + delay).toISOString();
};

let queueRetryInterval: ReturnType<typeof setInterval> | null = null;

const mergeCashEvents = (existing: CashEventRecord[], incoming: CashEventRecord[]): CashEventRecord[] => {
  if (!incoming.length) {
    return existing;
  }

  const map = new Map<number, CashEventRecord>();
  [...incoming, ...existing].forEach(event => {
    map.set(event.id, event);
  });

  return Array.from(map.values())
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, MAX_CASH_EVENTS);
};

const mergePreorders = (existing: PreorderRecord[], preorder: PreorderRecord): PreorderRecord[] => {
  if (preorder.status === 'PICKED_UP') {
    return existing.filter(item => item.id !== preorder.id);
  }

  const next = existing.filter(item => item.id !== preorder.id);
  next.push(preorder);
  next.sort((a, b) => {
    const aDate = a.statusHistory[0]?.createdAt ?? '';
    const bDate = b.statusHistory[0]?.createdAt ?? '';
    return aDate.localeCompare(bDate);
  });
  return next;
};

const applySaleEffects = (state: Pick<PosStore, 'cashEvents' | 'preorders'>, sale: SaleRecord) => {
  const cashEvents = sale.cashEvents ? mergeCashEvents(state.cashEvents, sale.cashEvents) : state.cashEvents;
  const preorders =
    sale.preorder && sale.preorder.status === 'PICKED_UP'
      ? state.preorders.filter(item => item.id !== sale.preorder?.id)
      : state.preorders;

  return { cashEvents, preorders };
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

/**
 * Creates and configures the Zustand store for the Point of Sale application.
 * This store manages the entire state of the POS, including the product catalog,
 * shopping cart, payment processing, offline functionality, and real-time updates.
 *
 * @returns {object} The Zustand store instance.
 */
export const usePosStore = create<PosStore>((set, get) => {
  const initialTenantId = resolveTenantIdFromContext();
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
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'response' in error) {
        console.warn('Warenkorb konnte nicht synchronisiert werden', error);
      } else {
        set({ isOffline: true });
        console.warn('Warenkorb konnte nicht synchronisiert werden', error);
      }
    }

    return totals;
  };

  const applyQueuedPaymentPatch = async (id: string, patch: Partial<PaymentIntent>) => {
    set(state => ({
      queuedPayments: state.queuedPayments.map(item => (item.id === id ? { ...item, ...patch } : item)),
    }));

    const updated = await patchQueuedPayment(id, patch);
    if (updated) {
      set(state => ({
        queuedPayments: state.queuedPayments.map(item => (item.id === id ? updated : item)),
      }));
    }
  };

  const removeQueuedPaymentInternal = async (id: string) => {
    set(state => ({ queuedPayments: state.queuedPayments.filter(item => item.id !== id) }));
    await removeQueuedPaymentRecord(id);
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
    tenantId: initialTenantId || null,
    initialized: false,
    preorders: [],
    cashEvents: [],
    addToCart: inputCode => {
      const state = get();
      const product = findCatalogProductByCode(state.catalog, inputCode);
      const resolvedId = product?.id ?? inputCode.trim();
      if (!resolvedId) {
        set({ error: 'Produktcode konnte nicht erkannt werden.' });
        return;
      }

      const existing = state.cart.find(item => item.id === resolvedId);
      const updatedCart = existing
        ? state.cart.map(item => (item.id === resolvedId ? { ...item, quantity: item.quantity + 1 } : item))
        : [...state.cart, { id: resolvedId, quantity: 1 }];

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

        set(state => {
          const effects = applySaleEffects(state, data.sale);
          return {
            paymentState: 'success',
            latestSale: data.sale,
            cart: [],
            error: undefined,
            isOffline: false,
            cashEvents: effects.cashEvents,
            preorders: effects.preorders,
          };
        });

        await persistCart([]);
      } catch (error: unknown) {
        const message =
          error && typeof error === 'object' && 'response' in error && error.response && typeof error.response === 'object' && 'data' in error.response && error.response.data && typeof error.response.data === 'object' && 'message' in error.response.data && typeof error.response.data.message === 'string'
            ? error.response.data.message
            : error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
            ? error.message
            : 'Zahlung konnte nicht verarbeitet werden.';

        if (error && typeof error === 'object' && 'response' in error) {
          const status = (error.response as { status?: number })?.status;
          const conflictMessage =
            status === 409
              ? `${message} Bitte prüfe doppelte Belege oder Markiere die Zahlung manuell als geklärt.`
              : message;
          set({ paymentState: 'error', error: conflictMessage });
        } else {
          const queued = await enqueuePayment(payload);
          set(state => ({
            paymentState: 'queued',
            error: 'Zahlung offline gespeichert. Sie wird bei bestehender Verbindung übertragen.',
            queuedPayments: [...state.queuedPayments, queued],
            isOffline: true,
            cart: [],
          }));
          const nowIso = new Date().toISOString();
          await applyQueuedPaymentPatch(queued.id, {
            error: 'Zahlung offline gespeichert. Sie wird automatisch übertragen.',
            lastAttemptAt: nowIso,
          });
          await persistCart([]);
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

      let restoredCartItems = storedCart?.items ?? [];
      try {
        const response = await api.get<RemoteCartResponse>('/pos/cart', { params: { terminalId } });
        const remoteItems = response.data?.cart?.items ?? [];
        restoredCartItems = remoteItems.map(item => ({ id: item.id, quantity: item.quantity }));
        const totals = calculateCartTotals(restoredCartItems, catalog);
        await persistCartLocally(restoredCartItems, totals);
      } catch (error: unknown) {
        if (error && typeof error === 'object' && 'response' in error) {
          const status = (error.response as { status?: number })?.status;
          if (status === 404) {
            // Kein gespeicherter Warenkorb vorhanden.
          } else {
            console.warn('Gespeicherten Warenkorb konnte nicht geladen werden.', error);
          }
        } else {
          console.warn('Gespeicherter Warenkorb konnte aufgrund fehlender Verbindung nicht geladen werden.', error);
        }
      }

      let preorders: PreorderRecord[] = [];
      let cashEvents: CashEventRecord[] = [];
      let latestSale: SaleResponse['sale'] | undefined;

      const configuredTenantId = get().tenantId?.trim() || resolveTenantIdFromContext();
      if (configuredTenantId !== get().tenantId) {
        set({ tenantId: configuredTenantId || null });
      }

      if (configuredTenantId) {
        try {
          const [preorderResponse, cashEventResponse] = await Promise.all([
            api.get<PreorderRecord[]>('/pos/preorders', { params: { tenantId: configuredTenantId } }),
            api.get<CashEventRecord[]>('/pos/cash-events', {
              params: { limit: 50, tenantId: configuredTenantId },
            }),
          ]);
          preorders = preorderResponse.data ?? [];
          cashEvents = cashEventResponse.data ?? [];
        } catch (error: unknown) {
          console.warn('Vorbestellungen oder Kassenevents konnten nicht synchronisiert werden.', error);
        }
      } else {
        console.warn('Keine Tenant-ID konfiguriert. Vorbestellungen und Kassenevents werden nicht geladen.');
      }

      try {
        const latestSaleResponse = await api.get<SaleResponse>('/pos/payments/latest');
        latestSale = latestSaleResponse.data?.sale;
      } catch (error: unknown) {
        if (error && typeof error === 'object' && 'response' in error) {
          const status = (error.response as { status?: number })?.status;
          if (status === 404) {
            console.info('Noch kein Verkauf gespeichert. Überspringe Initialbeleg.');
          } else {
            console.warn('Letzter Verkauf konnte nicht geladen werden.', error);
          }
        } else {
          console.warn('Letzter Verkauf konnte nicht geladen werden.', error);
        }
      }

      set({
        catalog,
        cart: restoredCartItems,
        queuedPayments: [...queuedPayments].sort(
          (first, second) => new Date(first.createdAt).getTime() - new Date(second.createdAt).getTime(),
        ),
        paymentMethods: mergePaymentPreferences(preferredMethods, defaultPaymentMethods),
        terminalId,
        initialized: true,
        isOffline:
          typeof navigator !== 'undefined'
            ? !navigator.onLine || queuedPayments.some(payment => payment.status === 'pending')
            : queuedPayments.some(payment => payment.status === 'pending'),
        preorders,
        cashEvents,
        latestSale,
      });

      if (queuedPayments.length && (typeof navigator === 'undefined' || navigator.onLine)) {
        await get().syncQueuedPayments();
      }

      if (typeof window !== 'undefined' && !queueRetryInterval) {
        queueRetryInterval = setInterval(() => {
          const { queuedPayments: queue } = get();
          if (!queue.length) {
            return;
          }
          const due = queue.some(payment => {
            if (payment.status !== 'pending') {
              return false;
            }
            if (!payment.nextRetryAt) {
              return true;
            }
            return new Date(payment.nextRetryAt).getTime() <= Date.now();
          });
          if (due && (typeof navigator === 'undefined' || navigator.onLine)) {
            void get().syncQueuedPayments();
          }
        }, 8000);
      }
    },
    setOffline: isOffline => {
      set({ isOffline });
      if (!isOffline && (typeof navigator === 'undefined' || navigator.onLine)) {
        void get().syncQueuedPayments();
      }
    },
    syncQueuedPayments: async () => {
      const state = get();
      if (!state.queuedPayments.length) {
        return;
      }

      const now = Date.now();
      const sorted = [...state.queuedPayments].sort(
        (first, second) => new Date(first.createdAt).getTime() - new Date(second.createdAt).getTime(),
      );

      for (const payment of sorted) {
        if (payment.status === 'conflict' || payment.status === 'failed') {
          continue;
        }

        if (payment.nextRetryAt && new Date(payment.nextRetryAt).getTime() > now) {
          continue;
        }

        try {
          const { data } = await api.post<SaleResponse>('/pos/payments', payment.payload);

          await persistCart([]);

          await removeQueuedPaymentInternal(payment.id);

          set(current => {
            const effects = applySaleEffects(current, data.sale);
            return {
              paymentState: 'success',
              latestSale: data.sale,
              cart: [],
              error: undefined,
              isOffline: typeof navigator !== 'undefined' ? !navigator.onLine : false,
              cashEvents: effects.cashEvents,
              preorders: effects.preorders,
            };
          });
        } catch (error: unknown) {
          const nowIso = new Date().toISOString();

          if (error && typeof error === 'object' && 'response' in error) {
            const status = (error.response as { status?: number })?.status;
            const message =
              (error.response as { data?: { message?: string } })?.data?.message ??
              (error as { message?: string })?.message ??
              'Zahlung konnte nicht synchronisiert werden.';

            if (status === 409) {
              const conflict = {
                type: 'duplicate-sale' as const,
                message,
                detectedAt: nowIso,
                saleId: (error.response as { data?: { sale?: { id?: string } } })?.data?.sale?.id,
                receiptNo: (error.response as { data?: { sale?: { receiptNo?: string } } })?.data?.sale
                  ?.receiptNo,
              };
              await applyQueuedPaymentPatch(payment.id, {
                status: 'conflict',
                error: message,
                conflict,
                lastAttemptAt: nowIso,
                nextRetryAt: undefined,
              });
              set({ paymentState: 'error', error: 'Konflikt beim Übertragen einer Zahlung erkannt.' });
              continue;
            }

            if (status && (status >= 500 || status === 429)) {
              const retryCount = payment.retryCount + 1;
              const nextRetryAt = computeNextRetryAt(retryCount);
              await applyQueuedPaymentPatch(payment.id, {
                status: 'pending',
                error: message,
                retryCount,
                nextRetryAt,
                lastAttemptAt: nowIso,
              });
              set({ paymentState: 'queued', error: message });
              continue;
            }

            await applyQueuedPaymentPatch(payment.id, {
              status: 'failed',
              error: message,
              lastAttemptAt: nowIso,
              nextRetryAt: undefined,
            });

            set(current => ({
              queuedPayments: current.queuedPayments,
              paymentState: 'error',
              error: message,
            }));
          } else {
            const retryCount = payment.retryCount + 1;
            const nextRetryAt = computeNextRetryAt(retryCount);
            await applyQueuedPaymentPatch(payment.id, {
              status: 'pending',
              error: 'Keine Verbindung zum Server. Automatischer erneuter Versuch folgt.',
              retryCount,
              nextRetryAt,
              lastAttemptAt: nowIso,
            });
            set({ isOffline: true, paymentState: 'queued' });
            break;
          }
        }
      }
    },
    retryQueuedPayment: async id => {
      const payment = get().queuedPayments.find(item => item.id === id);
      if (!payment) {
        return;
      }

      const nextRetryAt = new Date().toISOString();
      await applyQueuedPaymentPatch(id, {
        status: 'pending',
        error: undefined,
        conflict: undefined,
        nextRetryAt,
        lastAttemptAt: undefined,
      });

      if (typeof navigator === 'undefined' || navigator.onLine) {
        await get().syncQueuedPayments();
      }
    },
    removeQueuedPayment: async id => {
      await removeQueuedPaymentInternal(id);
    },
    updatePreorder: preorder => {
      set(state => ({ preorders: mergePreorders(state.preorders, preorder) }));
    },
    addCashEvent: event => {
      set(state => ({ cashEvents: mergeCashEvents(state.cashEvents, [event]) }));
    },
    applyRemoteSale: sale => {
      set(state => {
        const effects = applySaleEffects(state, sale);
        const isSameSale = state.latestSale?.id === sale.id;
        return {
          latestSale: sale,
          cashEvents: effects.cashEvents,
          preorders: effects.preorders,
          paymentState: isSameSale ? state.paymentState : 'idle',
          error: isSameSale ? state.error : undefined,
        };
      });
    },
    setTenantId: tenantId => {
      persistTenantPreference(tenantId.trim());
      set({ tenantId: tenantId.trim() || null });
    },
  };
});
