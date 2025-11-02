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

export async function persistCart(items: CartItem[], totals: CartTotals) {
  if (!isBrowser) {
    memoryStore.cart = { items, totals, updatedAt: now() };
    return;
  }

  await runTransaction('cart', 'readwrite', store => {
    store.put({ items, totals, updatedAt: now() }, CART_KEY);
  });
}

export async function clearCart() {
  if (!isBrowser) {
    memoryStore.cart = null;
    return;
  }

  await runTransaction('cart', 'readwrite', store => {
    store.delete(CART_KEY);
  });
}

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

export async function persistCatalog(items: CatalogItem[]) {
  if (!isBrowser) {
    memoryStore.catalog = { items, updatedAt: now() };
    return;
  }

  await runTransaction('catalog', 'readwrite', store => {
    store.put({ items, updatedAt: now() }, CATALOG_KEY);
  });
}

function createUuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `queued-${Math.random().toString(16).slice(2)}-${Date.now()}`;
}

export async function enqueuePayment(payload: PaymentRequestPayload) {
  const record: PersistedPayment = {
    id: createUuid(),
    createdAt: now(),
    status: 'pending',
    payload,
  };

  if (!isBrowser) {
    memoryStore.payments.set(record.id, record);
    return record;
  }

  await runTransaction('payments', 'readwrite', store => {
    store.add(record);
  });

  return record;
}

export async function listQueuedPayments() {
  if (!isBrowser) {
    return Array.from(memoryStore.payments.values());
  }

  try {
    return (await runTransaction('payments', 'readonly', store => store.getAll())) as PersistedPayment[];
  } catch (error) {
    console.warn('Konnte Zahlungswarteschlange nicht laden', error);
    return [];
  }
}

export async function removeQueuedPayment(id: string) {
  if (!isBrowser) {
    memoryStore.payments.delete(id);
    return;
  }

  await runTransaction('payments', 'readwrite', store => {
    store.delete(id);
  });
}

export async function markPaymentFailed(id: string, error: string) {
  if (!isBrowser) {
    const existing = memoryStore.payments.get(id);
    if (existing) {
      existing.status = 'failed';
      existing.error = error;
      memoryStore.payments.set(id, existing);
    }
    return;
  }

  await runTransaction('payments', 'readwrite', store => {
    const request = store.get(id);
    request.onsuccess = () => {
      const value = request.result as PersistedPayment | undefined;
      if (!value) return;
      value.status = 'failed';
      value.error = error;
      store.put(value);
    };
  });
}

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

export async function storePreferredPaymentMethods(methods: PaymentMethod[]) {
  if (!isBrowser) {
    memoryStore.metadata.set('paymentMethods', JSON.stringify(methods));
    return;
  }

  await runTransaction('metadata', 'readwrite', store => {
    store.put(JSON.stringify(methods), 'paymentMethods');
  });
}

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
