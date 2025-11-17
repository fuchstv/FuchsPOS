import { FormEvent, useEffect, useMemo, useState } from 'react';
import api from '../../api/client';
import { fetchReceiptDocument } from '../../api/pos';
import { usePosStore } from '../../store/posStore';
import type { PaymentMethod, TableCheck } from '../../store/types';
import { usePosRealtime } from '../../realtime/usePosRealtime';
import { CashClosingPanel } from './components/CashClosingPanel';

type HealthStatus = {
  status: string;
  timestamp: string;
  dependencies: {
    database: 'up' | 'down';
    cache: 'up' | 'down';
  };
};

type TenantLookupOrder = {
  id: number;
  tenantId: string | null;
  createdAt: string;
  customerName?: string | null;
  slot?: { id: number; startTime: string; endTime: string; location?: string | null } | null;
};

type TenantOption = {
  id: string;
  orderCount: number;
  lastOrderAt: string | null;
  locationHint?: string | null;
};

const currency = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
});

/**
 * Renders the main Point of Sale (POS) dashboard.
 * This component provides the primary interface for sales operations, including:
 * - Displaying a catalog of products for quick selection.
 * - Managing the shopping cart (adding, removing, clearing items).
 * - Processing payments through various methods, with support for offline transactions.
 * - Handling customer email input for sending digital receipts.
 * - Displaying real-time updates for preorders and cash events.
 * - Showing the system's health and connectivity status.
 * - Managing a queue for payments made while offline, with retry logic.
 * @returns {JSX.Element} The POS dashboard component.
 */
export default function PosDashboard() {
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
    preorders,
    cashEvents,
    updatePreorder,
    addCashEvent,
    applyRemoteSale,
    tables,
    activeTableId,
    selectTable,
    loadTables,
    createTableTab,
    splitCheck,
    mergeChecks,
    markCourseServed,
    recordCashDeposit,
    recordCashWithdrawal,
    tenantId,
    setTenantId,
  } = usePosStore();

  const [customerEmail, setCustomerEmail] = useState('');
  const [receiptEmail, setReceiptEmail] = useState('');
  const [emailStatus, setEmailStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [processingMethod, setProcessingMethod] = useState<PaymentMethod | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [activeDownloadFormat, setActiveDownloadFormat] = useState<'pdf' | 'html' | null>(null);
  const [newTableLabel, setNewTableLabel] = useState('');
  const [newTableCode, setNewTableCode] = useState('');
  const [newTableArea, setNewTableArea] = useState('');
  const [newTableWaiter, setNewTableWaiter] = useState('');
  const [cashAmount, setCashAmount] = useState('');
  const [cashReason, setCashReason] = useState('');
  const [cashOperatorId, setCashOperatorId] = useState('');
  const [cashEventStatus, setCashEventStatus] = useState<'idle' | 'deposit' | 'withdrawal'>('idle');
  const [cashEventError, setCashEventError] = useState<string | null>(null);
  const [cashEventMessage, setCashEventMessage] = useState<string | null>(null);
  const [isTenantDialogOpen, setIsTenantDialogOpen] = useState(false);
  const [tenantDraft, setTenantDraft] = useState('');
  const [tenantOptions, setTenantOptions] = useState<TenantOption[]>([]);
  const [tenantLookupStatus, setTenantLookupStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [tenantLookupError, setTenantLookupError] = useState<string | null>(null);
  const [tenantSnackbar, setTenantSnackbar] = useState<
    { message: string; tone: 'info' | 'success' | 'error' | 'warning' }
  | null>(null);
  const [tenantSnackbarReminderShown, setTenantSnackbarReminderShown] = useState(false);

  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const { client: realtimeClient, status: realtimeStatus } = usePosRealtime();

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

  const conflictingPayments = useMemo(
    () => queuedPayments.filter(payment => payment.status === 'conflict'),
    [queuedPayments],
  );

  const sortedCashEvents = useMemo(
    () =>
      [...cashEvents].sort(
        (first, second) => new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime(),
      ),
    [cashEvents],
  );
  const tenantConfigured = Boolean(tenantId);
  const isDepositBusy = cashEventStatus === 'deposit';
  const isWithdrawalBusy = cashEventStatus === 'withdrawal';

  const safePreorders = useMemo(() => (Array.isArray(preorders) ? preorders : []), [preorders]);
  const activeTable = useMemo(
    () => tables.find(table => table.id === activeTableId) ?? null,
    [tables, activeTableId],
  );
  const resolveCheckTotal = useMemo(
    () =>
      (check: TableCheck) =>
        check.items.reduce((sum, item) => {
          const product = catalog.find(productItem => productItem.id === item.id);
          if (!product) {
            return sum;
          }
          return sum + product.price * item.quantity;
        }, 0),
    [catalog],
  );

  const formatHealthValue = (value?: string | null, fallback: string = 'UNBEKANNT') =>
    typeof value === 'string' && value.trim() ? value.toUpperCase() : fallback;

  const formatStatusLabel = (status: string) => {
    switch (status) {
      case 'READY':
        return 'Bereit';
      case 'PICKED_UP':
        return 'Abgeholt';
      default:
        return 'Bestellt';
    }
  };

  const statusTone: Record<string, string> = {
    ORDERED: 'border-indigo-400/40 bg-indigo-500/10 text-indigo-100',
    READY: 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100',
    PICKED_UP: 'border-slate-400/40 bg-slate-500/10 text-slate-100',
  };

  const tenantSnackbarTone: Record<string, string> = {
    success: 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100',
    error: 'border-rose-400/40 bg-rose-500/10 text-rose-100',
    warning: 'border-amber-400/40 bg-amber-500/10 text-amber-100',
    info: 'border-slate-400/40 bg-slate-500/20 text-slate-100',
  };

  const describeEvent = (type: string) => {
    switch (type) {
      case 'PREORDER_READY':
        return 'Vorbestellung bereitgestellt';
      case 'PREORDER_PICKED_UP':
        return 'Vorbestellung abgeholt';
      case 'SALE_COMPLETED':
        return 'Verkauf abgeschlossen';
      case 'CASH_DEPOSIT':
        return 'Bareinzahlung';
      case 'CASH_WITHDRAWAL':
        return 'Barauszahlung';
      default:
        return type;
    }
  };

  const formatCourseStatus = (status: string) => {
    switch (status) {
      case 'SERVED':
        return 'Serviert';
      case 'PREPPING':
        return 'In Vorbereitung';
      default:
        return 'Geplant';
    }
  };

  const formatRetryInfo = (payment: (typeof queuedPayments)[number]) => {
    if (payment.status === 'pending') {
      if (payment.nextRetryAt) {
        const next = new Date(payment.nextRetryAt);
        return `Nächster Versuch um ${next.toLocaleTimeString('de-DE', {
          hour: '2-digit',
          minute: '2-digit',
        })}`;
      }
      return payment.retryCount > 0 ? `Warte auf erneuten Versuch (${payment.retryCount})` : 'Wartet auf Synchronisation';
    }

    if (payment.status === 'failed') {
      return payment.error ?? 'Letzter Versuch fehlgeschlagen.';
    }

    if (payment.status === 'conflict') {
      return payment.conflict?.message ?? 'Konflikt erkannt. Bitte prüfen.';
    }

    return null;
  };

  useEffect(() => {
    void initialize();
  }, [initialize]);

  useEffect(() => {
    if (!tables.length) {
      void loadTables();
    }
  }, [tables.length, loadTables]);

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
    if (!realtimeClient) {
      return () => undefined;
    }

    const offPreorder = realtimeClient.on('preorder.updated', payload => {
      if (payload?.preorder) {
        updatePreorder(payload.preorder);
      }
    });

    const offCash = realtimeClient.on('cash-event.created', payload => {
      if (payload?.event) {
        addCashEvent(payload.event);
      }
    });

    const offSale = realtimeClient.on('sale.completed', payload => {
      if (payload && typeof payload === 'object' && 'sale' in payload) {
        applyRemoteSale(payload.sale as { id: string });
      }
    });

    const offError = realtimeClient.on('error', error => {
      console.warn('Realtime-Verbindung zum POS-Backend meldete einen Fehler.', error);
    });

    return () => {
      offPreorder();
      offCash();
      offSale();
      offError();
    };
  }, [realtimeClient, updatePreorder, addCashEvent, applyRemoteSale]);

  useEffect(() => {
    if (paymentState === 'success' && customerEmail) {
      setReceiptEmail(customerEmail);
      setEmailStatus('idle');
      setEmailError(null);
    }
  }, [paymentState, customerEmail]);

  const handleCashAdjustment = async (mode: 'deposit' | 'withdrawal') => {
    if (cashEventStatus !== 'idle') {
      return;
    }

    setCashEventStatus(mode);
    setCashEventError(null);
    setCashEventMessage(null);

    const normalizedAmount = Number(cashAmount);
    if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
      setCashEventError('Bitte einen Betrag größer 0 eintragen.');
      setCashEventStatus('idle');
      return;
    }

    if (!cashReason.trim()) {
      setCashEventError('Eine Begründung ist erforderlich.');
      setCashEventStatus('idle');
      return;
    }

    if (!cashOperatorId.trim()) {
      setCashEventError('Bitte Bedienerkennung angeben.');
      setCashEventStatus('idle');
      return;
    }

    if (!tenantId) {
      setCashEventError('Keine Tenant-ID konfiguriert.');
      setCashEventStatus('idle');
      return;
    }

    try {
      const action = mode === 'deposit' ? recordCashDeposit : recordCashWithdrawal;
      await action({
        amount: normalizedAmount,
        reason: cashReason.trim(),
        operatorId: cashOperatorId.trim(),
      });
      setCashEventMessage(mode === 'deposit' ? 'Einzahlung erfasst.' : 'Auszahlung erfasst.');
      setCashAmount('');
      setCashReason('');
    } catch (error) {
      const message =
        error && typeof error === 'object' && 'response' in error && error.response && typeof error.response === 'object' && 'data' in error.response &&
        error.response.data && typeof error.response.data === 'object' && 'message' in error.response.data &&
        typeof error.response.data.message === 'string'
          ? error.response.data.message
          : error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
          ? error.message
          : null;
      setCashEventError(message ?? 'Kassenbewegung konnte nicht gespeichert werden.');
    } finally {
      setCashEventStatus('idle');
    }
  };

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
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'response' in err && err.response && typeof err.response === 'object' && 'data' in err.response && err.response.data && typeof err.response.data === 'object' && 'message' in err.response.data && typeof err.response.data.message === 'string'
          ? err.response.data.message
          : err && typeof err === 'object' && 'message' in err && typeof err.message === 'string'
          ? err.message
          : 'E-Mail konnte nicht versendet werden.';
      setEmailStatus('error');
      setEmailError(message);
    }
  };

  const resolveFilename = (header?: string, fallback?: string) => {
    if (!header) {
      return fallback ?? 'receipt.pdf';
    }

    const starMatch = header.match(/filename\*=(?:UTF-8'')?([^;]+)/i);
    if (starMatch?.[1]) {
      const cleaned = starMatch[1].replace(/^"|"$/g, '');
      try {
        return decodeURIComponent(cleaned);
      } catch (error) {
        console.warn('Konnte Dateinamen nicht dekodieren:', error);
        return cleaned;
      }
    }

    const regularMatch = header.match(/filename="?([^";]+)"?/i);
    if (regularMatch?.[1]) {
      return regularMatch[1];
    }

    return fallback ?? 'receipt.pdf';
  };

  const handleDownloadReceipt = async (format: 'pdf' | 'html') => {
    if (!latestSale) {
      return;
    }

    setActiveDownloadFormat(format);
    setDownloadError(null);

    try {
      const response = await fetchReceiptDocument(latestSale.id, format);
      const contentType =
        response.headers['content-type'] ?? (format === 'pdf' ? 'application/pdf' : 'text/html');
      const blob = new Blob([response.data], { type: contentType });
      const url = window.URL.createObjectURL(blob);
      const fallbackName = `receipt-${latestSale.receiptNo}.${format}`;
      const filename = resolveFilename(response.headers['content-disposition'], fallbackName);

      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download fehlgeschlagen', error);
      setDownloadError('Download fehlgeschlagen. Bitte später erneut versuchen.');
    } finally {
      setActiveDownloadFormat(null);
    }
  };

  const handleCreateTable = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newTableLabel.trim() || !newTableCode.trim()) {
      return;
    }
    void createTableTab({
      tableId: newTableCode.trim(),
      label: newTableLabel.trim(),
      areaLabel: newTableArea.trim() || undefined,
      waiterId: newTableWaiter.trim() || undefined,
      checks: [{ id: `check-${Date.now()}`, label: 'Check 1', items: [] }],
    }).then(() => {
      setNewTableLabel('');
      setNewTableCode('');
      setNewTableArea('');
      setNewTableWaiter('');
    });
  };

  const handleTenantSelection = () => {
    const normalized = tenantDraft.trim();
    if (!normalized) {
      setTenantSnackbar({
        message: 'Bitte wähle einen Mandanten aus oder gib eine Mandant-ID ein.',
        tone: 'error',
      });
      return;
    }

    setTenantId(normalized);
    setIsTenantDialogOpen(false);
    setTenantSnackbar({
      message: `Mandant ${normalized} aktiviert.`,
      tone: 'success',
    });
  };

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const { data } = await api.get<HealthStatus>('/health');
        setHealth(data);
        setHealthError(null);
      } catch (err: unknown) {
        setHealth(null);
        setHealthError(err && typeof err === 'object' && 'message' in err && typeof err.message === 'string' ? err.message : 'Health-Check fehlgeschlagen');
      }
    };

    fetchHealth();
    const interval = setInterval(fetchHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setTenantDraft(tenantId ?? '');
  }, [tenantId]);

  useEffect(() => {
    if (!isTenantDialogOpen) {
      return;
    }

    setTenantLookupStatus('loading');
    setTenantLookupError(null);

    void api
      .get<TenantLookupOrder[]>('/orders')
      .then(({ data }) => {
        const optionsMap = new Map<string, TenantOption>();
        for (const order of data ?? []) {
          const id = order.tenantId?.trim();
          if (!id) {
            continue;
          }
          const lastOrderAt = order.createdAt ?? null;
          const existing = optionsMap.get(id);
          if (existing) {
            existing.orderCount += 1;
            if (lastOrderAt && (!existing.lastOrderAt || new Date(lastOrderAt) > new Date(existing.lastOrderAt))) {
              existing.lastOrderAt = lastOrderAt;
              existing.locationHint = order.slot?.location ?? order.customerName ?? existing.locationHint;
            }
          } else {
            optionsMap.set(id, {
              id,
              orderCount: 1,
              lastOrderAt,
              locationHint: order.slot?.location ?? order.customerName ?? null,
            });
          }
        }

        setTenantOptions(
          Array.from(optionsMap.values()).sort((first, second) =>
            first.id.localeCompare(second.id, 'de-DE'),
          ),
        );
        setTenantLookupStatus('idle');
      })
      .catch(error => {
        console.warn('Mandanten konnten nicht geladen werden.', error);
        setTenantLookupError('Mandanten konnten nicht geladen werden. Bitte erneut versuchen.');
        setTenantOptions([]);
        setTenantLookupStatus('error');
      });
  }, [isTenantDialogOpen]);

  useEffect(() => {
    if (!tenantConfigured && !tenantSnackbarReminderShown) {
      setTenantSnackbar({
        message: 'Kein Mandant ausgewählt. Einige Funktionen bleiben deaktiviert.',
        tone: 'warning',
      });
      setTenantSnackbarReminderShown(true);
    }
    if (tenantConfigured && tenantSnackbarReminderShown) {
      setTenantSnackbarReminderShown(false);
    }
  }, [tenantConfigured, tenantSnackbarReminderShown]);

  useEffect(() => {
    if (!tenantSnackbar) {
      return;
    }
    const timeout = window.setTimeout(() => setTenantSnackbar(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [tenantSnackbar]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      <header className="sticky top-0 z-10 backdrop-blur bg-slate-950/70 border-b border-white/10">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">FuchsPOS</p>
            <h1 className="text-2xl font-semibold">Point of Sale Cockpit</h1>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span className="rounded-full bg-emerald-500/20 px-3 py-1 font-medium text-emerald-300">
              {cart.length} Artikel
            </span>
            <span className="rounded-full bg-brand/20 px-3 py-1 font-medium text-brand">
              {currency.format(total)}
            </span>
            {activeTable && (
              <span className="hidden rounded-full bg-indigo-500/20 px-3 py-1 font-medium text-indigo-200 sm:inline-flex">
                Tisch {activeTable.label}
              </span>
            )}
            <button
              type="button"
              onClick={() => setIsTenantDialogOpen(true)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                tenantConfigured
                  ? 'border-white/15 bg-white/5 text-slate-200 hover:border-brand/60 hover:text-brand'
                  : 'border-amber-400/60 bg-amber-500/10 text-amber-200 hover:border-amber-300'
              }`}
            >
              {tenantConfigured ? `Mandant: ${tenantId}` : 'Mandant wählen'}
            </button>
          </div>
        </div>
      </header>

      {!tenantConfigured && (
        <div className="mx-auto mt-4 w-full max-w-6xl px-6">
          <div className="rounded-2xl border border-amber-400/40 bg-amber-500/10 p-4 text-sm text-amber-100">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-base font-semibold text-amber-50">Mandant erforderlich</p>
                <p className="text-xs text-amber-100/80 sm:text-sm">
                  Wähle einen Mandanten, um Vorbestellungen, Kassenevents und Zahlungen zu synchronisieren.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-amber-300/60 bg-amber-500/20 px-4 py-2 text-xs font-semibold text-amber-50 transition hover:border-amber-200"
                  onClick={() => setIsTenantDialogOpen(true)}
                >
                  Mandant auswählen
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-white/80 transition hover:border-white/30"
                  onClick={() =>
                    setTenantSnackbar({
                      message: 'Ohne Mandant können keine Belege oder Kassenbewegungen verbucht werden.',
                      tone: 'info',
                    })
                  }
                >
                  Warum erforderlich?
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-8 md:flex-row">
        <section className="flex-1 space-y-4">
          <div className="space-y-4 rounded-3xl border border-white/10 bg-slate-950/60 p-5">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-200">Gastraum &amp; Tabs</h2>
                <p className="text-sm text-slate-400">Tische verwalten, Checks splitten und Kurse steuern.</p>
              </div>
              <button
                type="button"
                onClick={() => loadTables()}
                className="mt-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-brand hover:text-brand sm:mt-0"
              >
                Aktualisieren
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {tables.length === 0 ? (
                <p className="text-sm text-slate-400">Aktuell keine offenen Tabs.</p>
              ) : (
                tables.map(table => (
                  <button
                    key={table.id}
                    type="button"
                    onClick={() => selectTable(table.id)}
                    className={`rounded-2xl border px-3 py-2 text-left text-sm transition focus:outline-none focus:ring-2 focus:ring-brand ${
                      activeTableId === table.id
                        ? 'border-brand bg-brand/10 text-brand'
                        : 'border-white/10 bg-white/5 text-slate-200 hover:border-brand/60'
                    }`}
                  >
                    <p className="font-semibold">{table.label}</p>
                    <p className="text-xs text-slate-400">
                      {table.areaLabel ?? 'Bereich offen'} · {table.checks.length} Check
                      {table.checks.length === 1 ? '' : 's'}
                    </p>
                  </button>
                ))
              )}
            </div>
            <form onSubmit={handleCreateTable} className="grid gap-2 text-sm sm:grid-cols-2">
              <input
                type="text"
                value={newTableCode}
                onChange={event => setNewTableCode(event.target.value)}
                placeholder="Tisch-ID (z. B. A1)"
                className="rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-slate-100 placeholder:text-slate-500 focus:border-brand focus:outline-none"
              />
              <input
                type="text"
                value={newTableLabel}
                onChange={event => setNewTableLabel(event.target.value)}
                placeholder="Bezeichnung"
                className="rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-slate-100 placeholder:text-slate-500 focus:border-brand focus:outline-none"
              />
              <input
                type="text"
                value={newTableArea}
                onChange={event => setNewTableArea(event.target.value)}
                placeholder="Bereich"
                className="rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-slate-100 placeholder:text-slate-500 focus:border-brand focus:outline-none"
              />
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newTableWaiter}
                  onChange={event => setNewTableWaiter(event.target.value)}
                  placeholder="Service/Waiter"
                  className="flex-1 rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-slate-100 placeholder:text-slate-500 focus:border-brand focus:outline-none"
                />
                <button
                  type="submit"
                  className="rounded-xl bg-brand px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-950 transition hover:bg-brand-dark"
                >
                  Tisch öffnen
                </button>
              </div>
            </form>
            {activeTable ? (
              <div className="space-y-4">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                  <p className="text-base font-semibold text-slate-100">Tisch {activeTable.label}</p>
                  <p className="text-xs text-slate-400">
                    {activeTable.areaLabel ?? 'Bereich offen'} · Service {activeTable.waiterId ?? 'unzugewiesen'}
                  </p>
                </div>
                <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <h3 className="text-sm font-semibold text-slate-100">Checks</h3>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => splitCheck(activeTable.id)}
                        className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-200 transition hover:border-brand hover:text-brand"
                      >
                        Check teilen
                      </button>
                      <button
                        type="button"
                        disabled={activeTable.checks.length <= 1}
                        onClick={() => mergeChecks(activeTable.id)}
                        className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-200 transition hover:border-brand hover:text-brand disabled:opacity-40"
                      >
                        Checks zusammenführen
                      </button>
                    </div>
                  </div>
                  {activeTable.checks.length === 0 ? (
                    <p className="text-xs text-slate-400">Noch keine Positionen erfasst.</p>
                  ) : (
                    activeTable.checks.map(check => (
                      <div key={check.id} className="rounded-xl border border-white/10 p-3">
                        <div className="flex items-center justify-between text-sm font-semibold text-slate-100">
                          <p>{check.label}</p>
                          <span>{currency.format(resolveCheckTotal(check))}</span>
                        </div>
                        <ul className="mt-2 space-y-1 text-xs text-slate-400">
                          {check.items.length === 0 ? (
                            <li>Keine Artikel zugewiesen.</li>
                          ) : (
                            check.items.map(item => {
                              const product = catalog.find(productItem => productItem.id === item.id);
                              const name = product?.name ?? item.id;
                              return (
                                <li key={`${check.id}-${item.id}`} className="flex items-center justify-between">
                                  <span>
                                    {item.quantity} × {name}
                                  </span>
                                  {product && (
                                    <span className="text-slate-300">
                                      {currency.format(product.price * item.quantity)}
                                    </span>
                                  )}
                                </li>
                              );
                            })
                          )}
                        </ul>
                      </div>
                    ))
                  )}
                </div>
                <div className="space-y-2 rounded-2xl border border-indigo-400/30 bg-indigo-500/10 p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-100">Kurse</h3>
                    <p className="text-xs text-indigo-200/80">{activeTable.coursePlan?.length ?? 0} geplant</p>
                  </div>
                  {activeTable.coursePlan && activeTable.coursePlan.length > 0 ? (
                    activeTable.coursePlan.map(course => (
                      <div key={course.id} className="rounded-xl border border-indigo-300/30 bg-indigo-900/20 p-3 text-xs text-indigo-100">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-sm font-semibold text-indigo-100">{course.name}</p>
                            <p className="text-[11px] text-indigo-200/80">
                              {formatCourseStatus(course.status)}
                              {course.servedAt
                                ? ` · ${new Date(course.servedAt).toLocaleTimeString('de-DE', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}`
                                : ''}
                            </p>
                          </div>
                          {course.status !== 'SERVED' && (
                            <button
                              type="button"
                              onClick={() => markCourseServed(activeTable.id, course.id)}
                              className="rounded-full border border-indigo-300/40 px-3 py-1 text-[11px] font-semibold text-indigo-100 transition hover:border-white"
                            >
                              Als serviert markieren
                            </button>
                          )}
                        </div>
                        <ul className="mt-2 space-y-1 text-[11px] text-indigo-100/80">
                          {course.items.map(item => (
                            <li key={`${course.id}-${item.name}`} className="flex items-center justify-between">
                              <span>
                                {item.quantity} × {item.name}
                              </span>
                              <span>{currency.format(item.unitPrice * item.quantity)}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-indigo-200/80">Keine Kursplanung hinterlegt.</p>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-400">Wähle einen Tisch aus oder eröffne einen neuen Tab.</p>
            )}
          </div>
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

          {latestSale && (
            <div className="space-y-2 rounded-2xl border border-emerald-400/40 bg-emerald-500/10 p-4 text-sm text-emerald-200">
              <p className="font-semibold text-emerald-100">
                {paymentState === 'success' ? 'Beleg gespeichert' : 'Letzter erfolgreicher Verkauf'}
              </p>
              <p>Bonnummer: {latestSale.receiptNo}</p>
              <p>Gesamt: {currency.format(latestSale.total)}</p>
              {typeof latestSale.amountTendered === 'number' && (
                <p>Erhalten: {currency.format(latestSale.amountTendered)}</p>
              )}
              {typeof latestSale.changeDue === 'number' && (
                <p>Rückgeld: {currency.format(latestSale.changeDue)}</p>
              )}
              {latestSale.fiscalization && (
                <div className="space-y-1 rounded-xl border border-emerald-400/30 bg-emerald-600/10 p-3 text-xs">
                  <p className="text-[10px] uppercase tracking-wider text-emerald-200/70">TSS-Daten</p>
                  <p>Mandant: {latestSale.fiscalization.tenantId}</p>
                  <p>TSS-ID: {latestSale.fiscalization.tssId}</p>
                  <p>Kasse: {latestSale.fiscalization.cashRegisterId}</p>
                  <p>Transaktion: {latestSale.fiscalization.transactionId}</p>
                  {latestSale.fiscalization.signature?.value && (
                    <p className="break-all text-[11px] text-emerald-100/90">
                      Signatur: {latestSale.fiscalization.signature.value}
                    </p>
                  )}
                </div>
              )}
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
              <div className="space-y-2 text-emerald-100/90">
                <p className="text-xs uppercase tracking-wide text-emerald-200/70">Bon herunterladen</p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => handleDownloadReceipt('pdf')}
                    disabled={activeDownloadFormat !== null}
                    className="flex-1 rounded-xl border border-emerald-300/40 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:border-emerald-200 hover:text-emerald-50 disabled:cursor-not-allowed disabled:border-emerald-300/20"
                  >
                    {activeDownloadFormat === 'pdf' ? 'PDF wird erstellt …' : 'Als PDF speichern'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownloadReceipt('html')}
                    disabled={activeDownloadFormat !== null}
                    className="flex-1 rounded-xl border border-emerald-300/40 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:border-emerald-200 hover:text-emerald-50 disabled:cursor-not-allowed disabled:border-emerald-300/20"
                  >
                    {activeDownloadFormat === 'html' ? 'HTML wird erstellt …' : 'Als HTML speichern'}
                  </button>
                </div>
                {downloadError && <p className="text-xs text-rose-200">{downloadError}</p>}
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
                    className="space-y-1 rounded-lg bg-slate-950/60 px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
                      <span>{new Date(payment.createdAt).toLocaleTimeString('de-DE')}</span>
                      <span>{payment.payload.paymentMethod}</span>
                      <span>#{payment.payload.terminalId ?? 'lokal'}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span
                        className={`font-semibold ${
                          payment.status === 'failed'
                            ? 'text-rose-300'
                            : payment.status === 'conflict'
                            ? 'text-amber-300'
                            : 'text-emerald-300'
                        }`}
                      >
                        {payment.status === 'failed'
                          ? 'Fehlgeschlagen'
                          : payment.status === 'conflict'
                          ? 'Konflikt'
                          : 'Ausstehend'}
                      </span>
                      {payment.retryCount > 0 && (
                        <span className="text-[11px] text-slate-400">
                          {payment.retryCount} Versuch{payment.retryCount === 1 ? '' : 'e'}
                        </span>
                      )}
                    </div>
                    {formatRetryInfo(payment) && (
                      <p className="text-[11px] text-slate-400">{formatRetryInfo(payment)}</p>
                    )}
                  </li>
                ))}
              </ul>
              {failedQueuedPayments.length > 0 && (
                <p className="text-xs text-rose-300">
                  {failedQueuedPayments.length} Vorgang{failedQueuedPayments.length > 1 ? 'e' : ''} benötigen
                  Aufmerksamkeit. Bitte prüfe die Zahlungsmittel oder versuche es erneut.
                </p>
              )}
              {conflictingPayments.length > 0 && (
                <p className="text-xs text-amber-300">
                  {conflictingPayments.length} Vorgang{conflictingPayments.length > 1 ? 'e' : ''} mit Konflikten
                  erkannt. Bitte gleiche Belege ab und löse den Konflikt manuell.
                </p>
              )}
            </section>
          )}

          <section className="space-y-3 rounded-2xl border border-indigo-400/40 bg-indigo-500/10 p-4 text-xs text-indigo-100">
            <div className="flex items-center justify-between text-sm">
              <h3 className="font-semibold text-indigo-100">Vorbestellungen</h3>
              <span className="text-xs text-indigo-200/80">{safePreorders.length}</span>
            </div>
            {safePreorders.length === 0 ? (
              <p className="text-xs text-indigo-200/80">Aktuell liegen keine offenen Vorbestellungen vor.</p>
            ) : (
              <ul className="space-y-3">
                {safePreorders.map(preorder => (
                  <li key={preorder.id} className="rounded-xl border border-indigo-300/30 bg-indigo-900/30 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-indigo-100">
                          {preorder.customerName ?? 'Gastkundschaft'}
                        </p>
                        <p className="text-[11px] text-indigo-200/70">#{preorder.externalReference}</p>
                        {preorder.scheduledPickup && (
                          <p className="text-[11px] text-indigo-200/70">
                            Abholung:{' '}
                            {new Date(preorder.scheduledPickup).toLocaleTimeString('de-DE', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        )}
                      </div>
                      <span
                        className={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider ${
                          statusTone[preorder.status] ?? statusTone.ORDERED
                        }`}
                      >
                        {formatStatusLabel(preorder.status)}
                      </span>
                    </div>
                    <ul className="mt-2 space-y-1 text-[11px] text-indigo-100/90">
                      {preorder.items.slice(0, 3).map(item => (
                        <li
                          key={`${preorder.id}-${item.sku ?? item.name}`}
                          className="flex items-center justify-between gap-2"
                        >
                          <span>
                            {item.quantity} × {item.name}
                          </span>
                          {typeof item.unitPrice === 'number' && (
                            <span className="font-medium">
                              {currency.format(item.unitPrice * item.quantity)}
                            </span>
                          )}
                        </li>
                      ))}
                      {preorder.items.length > 3 && (
                        <li className="text-[10px] text-indigo-200/70">
                          + {preorder.items.length - 3} weitere Positionen
                        </li>
                      )}
                    </ul>
                    <div className="mt-3 space-y-1 text-[10px] text-indigo-200/70">
                      {preorder.statusHistory
                        .slice(-3)
                        .reverse()
                        .map(history => (
                          <p key={history.id}>
                            {new Date(history.createdAt).toLocaleTimeString('de-DE', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}{' '}
                            · {formatStatusLabel(history.status)}
                            {history.notes ? ` – ${history.notes}` : ''}
                          </p>
                        ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-3 rounded-2xl border border-cyan-400/40 bg-cyan-500/10 p-4 text-xs text-cyan-100">
            <div className="flex items-center justify-between text-sm">
              <h3 className="font-semibold text-cyan-100">Live-Kassenevents</h3>
              <span className="text-xs text-cyan-200/80">{sortedCashEvents.length}</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={cashAmount}
                onChange={event => setCashAmount(event.target.value)}
                placeholder="Betrag (EUR)"
                className="rounded-lg border border-cyan-300/30 bg-cyan-900/20 px-3 py-2 text-[11px] text-cyan-100 placeholder:text-cyan-200/50 focus:border-cyan-200/70 focus:outline-none"
              />
              <input
                type="text"
                value={cashReason}
                onChange={event => setCashReason(event.target.value)}
                placeholder="Grund"
                className="rounded-lg border border-cyan-300/30 bg-cyan-900/20 px-3 py-2 text-[11px] text-cyan-100 placeholder:text-cyan-200/50 focus:border-cyan-200/70 focus:outline-none"
              />
              <input
                type="text"
                value={cashOperatorId}
                onChange={event => setCashOperatorId(event.target.value)}
                placeholder="Operator-ID"
                className="rounded-lg border border-cyan-300/30 bg-cyan-900/20 px-3 py-2 text-[11px] text-cyan-100 placeholder:text-cyan-200/50 focus:border-cyan-200/70 focus:outline-none"
              />
            </div>
            <div className="flex flex-wrap gap-2 text-[11px]">
              <button
                type="button"
                onClick={() => handleCashAdjustment('deposit')}
                disabled={!tenantConfigured || isDepositBusy}
                className="rounded-lg border border-emerald-300/40 bg-emerald-500/10 px-3 py-2 font-semibold text-emerald-100 transition hover:border-emerald-200/80 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isDepositBusy ? 'Verbucht …' : 'Einzahlung buchen'}
              </button>
              <button
                type="button"
                onClick={() => handleCashAdjustment('withdrawal')}
                disabled={!tenantConfigured || isWithdrawalBusy}
                className="rounded-lg border border-rose-300/40 bg-rose-500/10 px-3 py-2 font-semibold text-rose-100 transition hover:border-rose-200/80 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isWithdrawalBusy ? 'Verbucht …' : 'Auszahlung buchen'}
              </button>
            </div>
            {!tenantConfigured && (
              <p className="text-[10px] text-rose-200">
                Hinterlege eine Tenant-ID, um Kassenbewegungen zu speichern.
              </p>
            )}
            {cashEventError && <p className="text-[10px] text-rose-200">{cashEventError}</p>}
            {cashEventMessage && !cashEventError && (
              <p className="text-[10px] text-emerald-200">{cashEventMessage}</p>
            )}
            {sortedCashEvents.length === 0 ? (
              <p className="text-xs text-cyan-200/80">Noch keine Bewegungen aufgezeichnet.</p>
            ) : (
              <ul className="space-y-2">
                {sortedCashEvents.slice(0, 8).map(event => {
                  const metadata = event.metadata as {
                    documentNumber?: unknown;
                    amount?: unknown;
                    reason?: unknown;
                    operatorId?: unknown;
                  } | undefined;
                  const documentNumber =
                    metadata && typeof metadata.documentNumber !== 'undefined'
                      ? String(metadata.documentNumber)
                      : null;
                  const rawAmount =
                    metadata && typeof metadata.amount !== 'undefined'
                      ? Number(metadata.amount)
                      : null;
                  const amount = typeof rawAmount === 'number' && Number.isFinite(rawAmount) ? rawAmount : null;
                  const reason = metadata && typeof metadata.reason === 'string' ? metadata.reason : null;
                  const operator = metadata && typeof metadata.operatorId === 'string' ? metadata.operatorId : null;
                  const isWithdrawal = event.type === 'CASH_WITHDRAWAL';

                  return (
                    <li key={event.id} className="rounded-lg border border-cyan-300/30 bg-cyan-900/30 p-2">
                      <div className="flex items-center justify-between text-[11px] text-cyan-100/90">
                        <span>
                          {new Date(event.createdAt).toLocaleTimeString('de-DE', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        <span className="font-semibold uppercase tracking-wide">
                          {describeEvent(event.type)}
                        </span>
                      </div>
                      {event.sale?.receiptNo && (
                        <p className="text-[10px] text-cyan-200/70">Bon {event.sale.receiptNo}</p>
                      )}
                      {event.preorder?.externalReference && (
                        <p className="text-[10px] text-cyan-200/70">
                          Vorbestellung #{event.preorder.externalReference}
                        </p>
                      )}
                      {documentNumber && (
                        <p className="text-[10px] text-cyan-200/70">Beleg {documentNumber}</p>
                      )}
                      {amount !== null && (
                        <p
                          className={`text-[10px] ${
                            isWithdrawal ? 'text-rose-200/80' : 'text-emerald-200/80'
                          }`}
                        >
                          Betrag {isWithdrawal ? '−' : '+'}
                          {currency.format(amount)}
                        </p>
                      )}
                      {reason && (
                        <p className="text-[10px] text-cyan-200/70">Grund: {reason}</p>
                      )}
                      {operator && (
                        <p className="text-[10px] text-cyan-200/70">Operator: {operator}</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <CashClosingPanel />

          <section className="rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-slate-400">
            <h3 className="text-sm font-semibold text-slate-200">Systemstatus</h3>
            <p className="mt-2">
              Realtime:{' '}
              <span
                className={
                  realtimeStatus === 'connected'
                    ? 'text-emerald-300'
                    : realtimeStatus === 'connecting'
                    ? 'text-amber-300'
                    : 'text-rose-300'
                }
              >
                {realtimeStatus === 'connected'
                  ? 'Verbunden'
                  : realtimeStatus === 'connecting'
                  ? 'Verbindungsaufbau …'
                  : 'Getrennt'}
              </span>
            </p>
            {health ? (
              <div className="mt-2 space-y-1">
                <p className="mt-1">
                  Backend:{' '}
                  <span className={health?.status === 'ok' ? 'text-emerald-300' : 'text-amber-300'}>
                    {formatHealthValue(health?.status)}
                  </span>
                </p>
                <p>
                  Datenbank:{' '}
                  <span
                    className={
                      health?.dependencies?.database === 'up' ? 'text-emerald-300' : 'text-rose-300'
                    }
                  >
                    {formatHealthValue(health?.dependencies?.database)}
                  </span>
                </p>
                <p>
                  Cache:{' '}
                  <span
                    className={health?.dependencies?.cache === 'up' ? 'text-emerald-300' : 'text-rose-300'}
                  >
                    {formatHealthValue(health?.dependencies?.cache)}
                  </span>
                </p>
                <p>
                  Stand:{' '}
                  {health?.timestamp
                    ? new Date(health.timestamp).toLocaleTimeString('de-DE')
                    : 'unbekannt'}
                </p>
              </div>
            ) : (
              <p className="mt-2 text-rose-300">{healthError ?? 'Keine Health-Daten verfügbar.'}</p>
            )}
          </section>
        </aside>
      </main>

      {isTenantDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8">
          <div
            className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
            onClick={() => setIsTenantDialogOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative z-10 w-full max-w-lg rounded-3xl border border-white/10 bg-slate-950/90 p-6 text-sm shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Mandanten</p>
                <h2 className="text-xl font-semibold text-white">Mandant auswählen</h2>
                <p className="text-xs text-slate-400">
                  Wähle einen der zuletzt genutzten Mandanten oder gib eine ID manuell ein.
                </p>
              </div>
              <button
                type="button"
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300 transition hover:border-white/40"
                onClick={() => setIsTenantDialogOpen(false)}
              >
                Schließen
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div className="max-h-64 space-y-2 overflow-y-auto">
                {tenantLookupStatus === 'loading' && (
                  <p className="text-xs text-slate-400">Mandanten werden geladen …</p>
                )}
                {tenantLookupStatus === 'error' && tenantLookupError && (
                  <p className="text-xs text-rose-300">{tenantLookupError}</p>
                )}
                {tenantLookupStatus !== 'loading' && tenantOptions.length === 0 && !tenantLookupError && (
                  <p className="text-xs text-slate-400">
                    Noch keine Bestellungen gefunden. Du kannst eine Mandant-ID manuell angeben.
                  </p>
                )}
                {tenantOptions.map(option => (
                  <label
                    key={option.id}
                    className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-3 py-2 transition ${
                      tenantDraft === option.id
                        ? 'border-brand bg-brand/10 text-brand'
                        : 'border-white/10 bg-white/5 text-slate-200 hover:border-brand/40'
                    }`}
                  >
                    <input
                      type="radio"
                      name="tenant-option"
                      value={option.id}
                      checked={tenantDraft === option.id}
                      onChange={event => setTenantDraft(event.target.value)}
                      className="mt-1"
                    />
                    <div>
                      <p className="text-sm font-semibold text-white">{option.id}</p>
                      <p className="text-xs text-slate-400">{option.orderCount} Bestellung(en)</p>
                      {option.lastOrderAt && (
                        <p className="text-[11px] text-slate-500">
                          Zuletzt genutzt am{' '}
                          {new Date(option.lastOrderAt).toLocaleString('de-DE', {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                        </p>
                      )}
                      {option.locationHint && (
                        <p className="text-[11px] text-slate-500">Hinweis: {option.locationHint}</p>
                      )}
                    </div>
                  </label>
                ))}
              </div>

              <div className="space-y-1">
                <label htmlFor="tenantId" className="text-xs font-semibold text-slate-300">
                  Mandant-ID manuell eingeben
                </label>
                <input
                  id="tenantId"
                  type="text"
                  value={tenantDraft}
                  onChange={event => setTenantDraft(event.target.value)}
                  placeholder="tenant-123"
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-brand focus:outline-none"
                />
                <p className="text-[11px] text-slate-500">
                  Die Auswahl wird lokal gespeichert (Schlüssel: fuchspos.posTenantId).
                </p>
              </div>

              <div className="flex flex-wrap justify-end gap-2 pt-2 text-xs font-semibold">
                <button
                  type="button"
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-slate-200 transition hover:border-white/30"
                  onClick={() => setTenantDraft('')}
                >
                  Zurücksetzen
                </button>
                <button
                  type="button"
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-slate-200 transition hover:border-white/30"
                  onClick={() => setIsTenantDialogOpen(false)}
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  className="rounded-xl border border-brand bg-brand/20 px-4 py-2 text-brand transition hover:bg-brand/30"
                  onClick={handleTenantSelection}
                >
                  Mandant aktivieren
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {tenantSnackbar && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-40 w-full max-w-md -translate-x-1/2 px-4">
          <div
            className={`pointer-events-auto flex items-start justify-between gap-4 rounded-2xl border px-4 py-3 text-sm shadow-lg ${
              tenantSnackbarTone[tenantSnackbar.tone] ?? tenantSnackbarTone.info
            }`}
          >
            <p>{tenantSnackbar.message}</p>
            <button
              type="button"
              className="text-xs font-semibold uppercase tracking-wide text-white/70"
              onClick={() => setTenantSnackbar(null)}
            >
              Schließen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
