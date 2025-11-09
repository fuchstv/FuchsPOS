import type {
  CartItem,
  CartTotals,
  CatalogItem,
  PaymentIntent,
  PaymentRequestPayload,
  PaymentMethod,
} from './types';

interface PersistedCart {
  items: CartItem[];
  totals: CartTotals;
  updatedAt: string;
}

interface PersistedCatalog {
  items: CatalogItem[];
  updatedAt: string;
}

interface PersistedPayment extends PaymentIntent {}

/**
 * Provides a summary of the state of the offline storage for diagnostic purposes.
 */
export type OfflineDiagnostics = {
  /** Indicates whether IndexedDB is supported and being used. */
  supported: boolean;
  /** Information about the persisted shopping cart. */
  cart: { items: number; updatedAt: string | null; grossTotal?: number } | null;
  /** Information about the persisted product catalog. */
  catalog: { items: number; updatedAt: string | null } | null;
  /** A summary of the payment queue status. */
  payments: {
    /** The total number of payments in the queue. */
    total: number;
    /** The number of payments with a 'pending' status. */
    pending: number;
    /** The number of payments with a 'failed' status. */
    failed: number;
    /** The number of payments with a 'conflict' status. */
    conflict: number;
    /** The timestamp for the next scheduled retry attempt. */
    nextRetryAt?: string | null;
    /** The timestamp of the most recent sync attempt. */
    latestAttemptAt?: string | null;
  };
  /** The unique identifier for the terminal, if set. */
  terminalId?: string | null;
};

const DB_NAME = 'fuchspos';
const DB_VERSION = 1;
const CART_KEY = 'active';
const CATALOG_KEY = 'default';

const isBrowser = typeof window !== 'undefined' && typeof indexedDB !== 'undefined';

let dbPromise: Promise<IDBDatabase> | null = null;

const memoryStore = {
  cart: null as PersistedCart | null,
  catalog: null as PersistedCatalog | null,
  payments: new Map<string, PersistedPayment>(),
  metadata: new Map<string, string>(),
};

const now = () => new Date().toISOString();

function openDatabase(): Promise<IDBDatabase> {
  if (!isBrowser) {
    return Promise.reject(new Error('IndexedDB not available in this environment'));
  }

  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('cart')) {
          db.createObjectStore('cart');
        }
        if (!db.objectStoreNames.contains('catalog')) {
          db.createObjectStore('catalog');
        }
        if (!db.objectStoreNames.contains('payments')) {
          db.createObjectStore('payments', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('metadata')) {
          db.createObjectStore('metadata');
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB initialisation failed'));
    });
  }

  return dbPromise;
}

async function runTransaction<T>(
  storeName: string,
  mode: IDBTransactionMode,
  handler: (store: IDBObjectStore) => T | Promise<T>,
) {
  const db = await openDatabase();

  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);

    let result: T | Promise<T> | undefined;

    try {
      result = handler(store);
    } catch (error) {
      reject(error);
      return;
    }

    const wrap = (value: T | Promise<T>) => {
      Promise.resolve(value)
        .then(resolved => {
          transaction.oncomplete = () => resolve(resolved);
          transaction.onerror = () =>
            reject(transaction.error ?? new Error('IndexedDB transaction failed'));
          transaction.onabort = () =>
            reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
        })
        .catch(reject);
    };

    if (result !== undefined) {
      wrap(result);
    } else {
      transaction.oncomplete = () => resolve(undefined as unknown as T);
      transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
      transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
    }
  });
}

/**
 * Loads the persisted shopping cart from IndexedDB.
 * Falls back to an in-memory store if IndexedDB is not available.
 * @returns {Promise<PersistedCart | null>} A promise that resolves to the persisted cart data, or null if not found.
 */
export async function loadCart(): Promise<PersistedCart | null> {
  if (!isBrowser) {
    return memoryStore.cart;
  }

  try {
    return (await runTransaction('cart', 'readonly', store => store.get(CART_KEY))) as PersistedCart | null;
  } catch (error) {
    console.warn('Konnte Warenkorb nicht aus IndexedDB laden', error);
    return null;
  }
}

/**
 * Persists the current shopping cart to IndexedDB.
 * @param {CartItem[]} items - The list of items in the cart.
 * @param {CartTotals} totals - The calculated totals for the cart.
 * @returns {Promise<void>} A promise that resolves when the cart has been persisted.
 */
export async function persistCart(items: CartItem[], totals: CartTotals) {
  if (!isBrowser) {
    memoryStore.cart = { items, totals, updatedAt: now() };
    return;
  }

  await runTransaction('cart', 'readwrite', store => {
    store.put({ items, totals, updatedAt: now() }, CART_KEY);
  });
}

/**
 * Clears the persisted shopping cart from IndexedDB.
 * @returns {Promise<void>} A promise that resolves when the cart has been cleared.
 */
export async function clearCart() {
  if (!isBrowser) {
    memoryStore.cart = null;
    return;
  }

  await runTransaction('cart', 'readwrite', store => {
    store.delete(CART_KEY);
  });
}

/**
 * Loads the product catalog from IndexedDB.
 * @returns {Promise<CatalogItem[] | null>} A promise that resolves to the list of catalog items, or null if not found.
 */
export async function loadCatalog(): Promise<CatalogItem[] | null> {
  if (!isBrowser) {
    return memoryStore.catalog?.items ?? null;
  }

  try {
    const catalog = (await runTransaction('catalog', 'readonly', store => store.get(CATALOG_KEY))) as
      | PersistedCatalog
      | null;
    return catalog?.items ?? null;
  } catch (error) {
    console.warn('Konnte Katalog nicht aus IndexedDB laden', error);
    return null;
  }
}

/**
 * Persists the product catalog to IndexedDB.
 * @param {CatalogItem[]} items - The list of catalog items to persist.
 * @returns {Promise<void>} A promise that resolves when the catalog has been persisted.
 */
export async function persistCatalog(items: CatalogItem[]) {
  if (!isBrowser) {
    memoryStore.catalog = { items, updatedAt: now() };
    return;
  }

  await runTransaction('catalog', 'readwrite', store => {
    store.put({ items, updatedAt: now() }, CATALOG_KEY);
  });
}

/**
 * Generates a UUID, preferring the browser's native crypto.randomUUID if available.
 * @returns {string} A new UUID.
 */
function createUuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `queued-${Math.random().toString(16).slice(2)}-${Date.now()}`;
}

function normalisePayment(payment: PersistedPayment): PersistedPayment {
  return {
    ...payment,
    status: payment.status ?? 'pending',
    retryCount: typeof payment.retryCount === 'number' ? payment.retryCount : 0,
    nextRetryAt: payment.nextRetryAt ?? undefined,
    lastAttemptAt: payment.lastAttemptAt ?? undefined,
  };
}

/**
 * Adds a new payment request to the offline queue in IndexedDB.
 * A unique ID and timestamp are generated for the payment record.
 * @param {PaymentRequestPayload} payload - The payment request details to be enqueued.
 * @returns {Promise<PersistedPayment>} A promise that resolves to the newly created and enqueued payment record.
 */
export async function enqueuePayment(payload: PaymentRequestPayload) {
  const record: PersistedPayment = {
    id: createUuid(),
    createdAt: now(),
    status: 'pending',
    payload,
    retryCount: 0,
    nextRetryAt: now(),
  };

  if (!isBrowser) {
    const normalised = normalisePayment(record);
    memoryStore.payments.set(record.id, normalised);
    return normalised;
  }

  await runTransaction('payments', 'readwrite', store => {
    store.add(record);
  });

  return normalisePayment(record);
}

/**
 * Retrieves all payment records from the offline queue.
 * @returns {Promise<PersistedPayment[]>} A promise that resolves to an array of all queued payment records.
 */
export async function listQueuedPayments() {
  if (!isBrowser) {
    return Array.from(memoryStore.payments.values()).map(normalisePayment);
  }

  try {
    const payments = (await runTransaction('payments', 'readonly', store => store.getAll())) as PersistedPayment[];
    return payments.map(normalisePayment);
  } catch (error) {
    console.warn('Konnte Zahlungswarteschlange nicht laden', error);
    return [];
  }
}

/**
 * Removes a specific payment record from the offline queue.
 * @param {string} id - The unique identifier of the payment to remove.
 * @returns {Promise<void>} A promise that resolves when the payment has been removed.
 */
export async function removeQueuedPayment(id: string) {
  if (!isBrowser) {
    memoryStore.payments.delete(id);
    return;
  }

  await runTransaction('payments', 'readwrite', store => {
    store.delete(id);
  });
}

/**
 * Marks a queued payment as failed, storing the error message and updating the last attempt timestamp.
 * @param {string} id - The ID of the payment to mark as failed.
 * @param {string} error - The error message to record.
 * @returns {Promise<void>}
 */
export async function markPaymentFailed(id: string, error: string) {
  await patchQueuedPayment(id, {
    status: 'failed',
    error,
    lastAttemptAt: now(),
  });
}

/**
 * Updates a queued payment record with a set of partial changes.
 * This is used to update status, retry counts, error messages, etc.
 * @param {string} id - The ID of the payment to update.
 * @param {Partial<PersistedPayment>} patch - An object containing the fields to update.
 * @returns {Promise<PersistedPayment | null>} A promise that resolves to the updated payment record, or null if not found.
 */
export async function patchQueuedPayment(
  id: string,
  patch: Partial<PersistedPayment>,
): Promise<PersistedPayment | null> {
  if (!isBrowser) {
    const existing = memoryStore.payments.get(id);
    if (!existing) {
      return null;
    }
    const updated = normalisePayment({ ...existing, ...patch });
    memoryStore.payments.set(id, updated);
    return updated;
  }

  return runTransaction('payments', 'readwrite', store => {
    return new Promise<PersistedPayment | null>((resolve, reject) => {
      const request = store.get(id);
      request.onerror = () => reject(request.error ?? new Error('Zahlung konnte nicht geladen werden'));
      request.onsuccess = () => {
        const current = request.result as PersistedPayment | undefined;
        if (!current) {
          resolve(null);
          return;
        }
        const updated = normalisePayment({ ...current, ...patch });
        const put = store.put(updated);
        put.onsuccess = () => resolve(updated);
        put.onerror = () => reject(put.error ?? new Error('Zahlung konnte nicht aktualisiert werden'));
      };
    });
  });
}

/**
 * Ensures that a unique terminal ID is generated and persisted if it doesn't already exist.
 * This ID is used to identify the POS client in API requests.
 * @returns {Promise<string>} A promise that resolves to the terminal ID.
 */
export async function ensureTerminalId(): Promise<string> {
  if (!isBrowser) {
    const existing = memoryStore.metadata.get('terminalId');
    if (existing) {
      return existing;
    }
    const generated = createUuid().replace('queued-', 'terminal-');
    memoryStore.metadata.set('terminalId', generated);
    return generated;
  }

  const db = await openDatabase();
  const transaction = db.transaction('metadata', 'readwrite');
  const store = transaction.objectStore('metadata');

  const existing = await new Promise<string | undefined>((resolve, reject) => {
    const request = store.get('terminalId');
    request.onsuccess = () => resolve(request.result as string | undefined);
    request.onerror = () => reject(request.error ?? new Error('Terminal-ID konnte nicht geladen werden'));
  });

  if (existing) {
    transaction.commit?.();
    return existing;
  }

  const generated = createUuid().replace('queued-', 'terminal-');
  store.put(generated, 'terminalId');

  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Terminal-ID konnte nicht gespeichert werden'));
  });

  return generated;
}

/**
 * Loads the persisted terminal ID from IndexedDB.
 * @returns {Promise<string | null>} A promise that resolves to the terminal ID, or null if not found.
 */
export async function loadTerminalId(): Promise<string | null> {
  if (!isBrowser) {
    return memoryStore.metadata.get('terminalId') ?? null;
  }

  try {
    const value = await runTransaction('metadata', 'readonly', store => store.get('terminalId'));
    return (value as string | undefined) ?? null;
  } catch (error) {
    console.warn('Konnte Terminal-ID nicht laden', error);
    return null;
  }
}

/**
 * Stores the user's preferred payment methods in IndexedDB.
 * This is used to preserve the payment method order and availability offline.
 * @param {PaymentMethod[]} methods - The list of payment methods to store.
 * @returns {Promise<void>} A promise that resolves when the data is stored.
 */
export async function storePreferredPaymentMethods(methods: PaymentMethod[]) {
  if (!isBrowser) {
    memoryStore.metadata.set('paymentMethods', JSON.stringify(methods));
    return;
  }

  await runTransaction('metadata', 'readwrite', store => {
    store.put(JSON.stringify(methods), 'paymentMethods');
  });
}

/**
 * Loads the user's preferred payment methods from IndexedDB.
 * @returns {Promise<PaymentMethod[] | null>} A promise that resolves to the list of payment methods, or null if not found.
 */
export async function loadPreferredPaymentMethods(): Promise<PaymentMethod[] | null> {
  if (!isBrowser) {
    const raw = memoryStore.metadata.get('paymentMethods');
    return raw ? (JSON.parse(raw) as PaymentMethod[]) : null;
  }

  try {
    const raw = (await runTransaction('metadata', 'readonly', store => store.get('paymentMethods'))) as
      | string
      | undefined;
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as PaymentMethod[];
  } catch (error) {
    console.warn('Konnte bevorzugte Zahlarten nicht laden', error);
    return null;
  }
}

/**
 * Gathers and returns a comprehensive diagnostics object about the state of offline storage.
 * This is useful for debugging and displaying the offline status to the user.
 * @returns {Promise<OfflineDiagnostics>} A promise that resolves to the offline diagnostics object.
 */
export async function loadOfflineDiagnostics(): Promise<OfflineDiagnostics> {
  if (!isBrowser) {
    const payments = Array.from(memoryStore.payments.values()).map(normalisePayment);
    const pending = payments.filter(payment => payment.status === 'pending').length;
    const failed = payments.filter(payment => payment.status === 'failed').length;
    const conflict = payments.filter(payment => payment.status === 'conflict').length;
    const nextRetryAt = payments
      .map(payment => (payment.nextRetryAt ? new Date(payment.nextRetryAt).getTime() : null))
      .filter((value): value is number => value !== null)
      .reduce<number | null>((earliest, timestamp) => {
        if (earliest === null || timestamp < earliest) {
          return timestamp;
        }
        return earliest;
      }, null);
    const latestAttempt = payments
      .map(payment => (payment.lastAttemptAt ? new Date(payment.lastAttemptAt).getTime() : null))
      .filter((value): value is number => value !== null)
      .reduce<number | null>((latest, timestamp) => {
        if (latest === null || timestamp > latest) {
          return timestamp;
        }
        return latest;
      }, null);

    return {
      supported: false,
      cart: memoryStore.cart
        ? {
            items: memoryStore.cart.items.length,
            updatedAt: memoryStore.cart.updatedAt,
            grossTotal: memoryStore.cart.totals.gross,
          }
        : null,
      catalog: memoryStore.catalog
        ? { items: memoryStore.catalog.items.length, updatedAt: memoryStore.catalog.updatedAt }
        : null,
      payments: {
        total: payments.length,
        pending,
        failed,
        conflict,
        nextRetryAt: nextRetryAt ? new Date(nextRetryAt).toISOString() : null,
        latestAttemptAt: latestAttempt ? new Date(latestAttempt).toISOString() : null,
      },
      terminalId: memoryStore.metadata.get('terminalId') ?? null,
    };
  }

  const [cartRecord, catalogRecord, payments, terminalId] = await Promise.all([
    runTransaction('cart', 'readonly', store => store.get(CART_KEY)) as Promise<PersistedCart | null>,
    runTransaction('catalog', 'readonly', store => store.get(CATALOG_KEY)) as Promise<PersistedCatalog | null>,
    listQueuedPayments(),
    loadTerminalId(),
  ]);

  const pending = payments.filter(payment => payment.status === 'pending').length;
  const failed = payments.filter(payment => payment.status === 'failed').length;
  const conflict = payments.filter(payment => payment.status === 'conflict').length;
  const nextRetryAt = payments
    .map(payment => (payment.nextRetryAt ? new Date(payment.nextRetryAt).getTime() : null))
    .filter((value): value is number => value !== null)
    .reduce<number | null>((earliest, timestamp) => {
      if (earliest === null || timestamp < earliest) {
        return timestamp;
      }
      return earliest;
    }, null);

  const latestAttempt = payments
    .map(payment => (payment.lastAttemptAt ? new Date(payment.lastAttemptAt).getTime() : null))
    .filter((value): value is number => value !== null)
    .reduce<number | null>((latest, timestamp) => {
      if (latest === null || timestamp > latest) {
        return timestamp;
      }
      return latest;
    }, null);

  return {
    supported: true,
    cart: cartRecord
      ? { items: cartRecord.items.length, updatedAt: cartRecord.updatedAt, grossTotal: cartRecord.totals.gross }
      : null,
    catalog: catalogRecord ? { items: catalogRecord.items.length, updatedAt: catalogRecord.updatedAt } : null,
    payments: {
      total: payments.length,
      pending,
      failed,
      conflict,
      nextRetryAt: nextRetryAt ? new Date(nextRetryAt).toISOString() : null,
      latestAttemptAt: latestAttempt ? new Date(latestAttempt).toISOString() : null,
    },
    terminalId,
  };
}
