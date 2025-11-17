import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  NotificationPreference,
  TrackingSnapshot,
  orderApi,
  type SubmitFeedbackPayload,
} from '../../api/order';
import TrackingMap from './components/TrackingMap';
import TrackingTimeline from './components/TrackingTimeline';
import FeedbackForm, { FeedbackFormValues } from './components/FeedbackForm';

const demoTracking: TrackingSnapshot = {
  order: {
    id: 9999,
    status: 'OUT_FOR_DELIVERY',
    customerName: 'Demo Kundin',
    deliveryAddress: 'Musterstraße 1, Berlin',
    totalAmount: 42.9,
    tenantId: 'demo',
    slot: {
      id: 1,
      startTime: new Date().toISOString(),
      endTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    },
    driverAssignment: {
      id: 1,
      driverName: 'Alex Fahrer',
      vehicleId: 'FCH-2024',
      status: 'EN_ROUTE',
      eta: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
      startedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      completedAt: null,
    },
  },
  statusEvents: [
    { id: 1, status: 'SUBMITTED', notes: 'Bestellung erhalten', createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString() },
    { id: 2, status: 'PREPARING', notes: 'Produktion gestartet', createdAt: new Date(Date.now() - 45 * 60 * 1000).toISOString() },
    { id: 3, status: 'READY', notes: 'Abholung vorbereitet', createdAt: new Date(Date.now() - 20 * 60 * 1000).toISOString() },
    { id: 4, status: 'OUT_FOR_DELIVERY', notes: 'Fahrer unterwegs', createdAt: new Date(Date.now() - 15 * 60 * 1000).toISOString() },
  ],
  driverLocations: [
    {
      id: 1,
      latitude: 52.5201,
      longitude: 13.4049,
      driverStatus: 'Beladung',
      accuracy: 15,
      recordedAt: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
    },
    {
      id: 2,
      latitude: 52.5212,
      longitude: 13.409,
      driverStatus: 'Unterwegs',
      accuracy: 10,
      recordedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    },
  ],
  notificationPreference: {
    allowStatusPush: true,
    allowSlotUpdates: true,
    allowEmail: true,
    feedbackRequestedAt: null,
  },
  feedback: null,
  pushPublicKey: 'BIfFakeDemoPublicKey-ReplaceWithRealVapidKeyForProduction',
  tipSuggestions: [0, 2, 5, 10],
};

const STATUS_LABELS: Record<string, string> = {
  SUBMITTED: 'Eingegangen',
  CONFIRMED: 'Bestätigt',
  PREPARING: 'In Zubereitung',
  READY: 'Bereit',
  OUT_FOR_DELIVERY: 'Unterwegs',
  DELIVERED: 'Zugestellt',
  CANCELLED: 'Storniert',
};

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = globalThis.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export default function OrderTrackingPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isDemo = searchParams.get('demo') === '1';
  const forceFeedback = searchParams.get('feedback') === '1';
  const [tracking, setTracking] = useState<TrackingSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [pushState, setPushState] = useState<'idle' | 'pending' | 'granted'>('idle');
  const [pushError, setPushError] = useState<string>();
  const [preferenceUpdating, setPreferenceUpdating] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string>();
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      setPushState('granted');
    }
  }, []);

  const loadTracking = useCallback(async () => {
    if (!orderId && !isDemo) {
      setError('Keine Bestell-ID gefunden.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(undefined);
    try {
      if (isDemo) {
        setTracking(demoTracking);
      } else {
        const data = await orderApi.fetchTracking(orderId!);
        setTracking(data);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Tracking konnte nicht geladen werden.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [orderId, isDemo]);

  useEffect(() => {
    loadTracking();
  }, [loadTracking]);

  const lastLocation = useMemo(() => {
    if (!tracking || tracking.driverLocations.length === 0) {
      return undefined;
    }
    return tracking.driverLocations[tracking.driverLocations.length - 1];
  }, [tracking]);
  const canSubmitFeedback = Boolean(
    tracking && (tracking.order.status === 'DELIVERED' || forceFeedback || isDemo),
  );

  const updatePreferenceState = (preferences: NotificationPreference) => {
    setTracking(current => (current ? { ...current, notificationPreference: preferences } : current));
  };

  const handlePreferenceToggle = async (field: keyof NotificationPreference, value: boolean) => {
    if (!tracking || !orderId) {
      return;
    }
    setPreferenceUpdating(true);
    try {
      const updated = await orderApi.updateNotificationPreferences(orderId, { [field]: value });
      updatePreferenceState(updated);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Einstellung konnte nicht gespeichert werden.';
      setError(message);
    } finally {
      setPreferenceUpdating(false);
    }
  };

  const handlePushRegistration = async () => {
    if (!tracking || !orderId) {
      return;
    }
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      setPushError('Push-Benachrichtigungen werden von diesem Browser nicht unterstützt.');
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      setPushError('Bitte erlaube Benachrichtigungen im Browser.');
      return;
    }
    setPushError(undefined);
    setPushState('pending');
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(tracking.pushPublicKey),
      });
      const json = subscription.toJSON();
      await orderApi.registerPushSubscription(orderId, {
        endpoint: subscription.endpoint,
        keys: {
          auth: json.keys?.auth ?? '',
          p256dh: json.keys?.p256dh ?? '',
        },
        userAgent: navigator.userAgent,
        allowStatusPush: true,
        allowSlotUpdates: tracking.notificationPreference.allowSlotUpdates,
        consentSource: 'tracking-page',
      });
      const refreshed = await orderApi.updateNotificationPreferences(orderId, {
        allowStatusPush: true,
      });
      updatePreferenceState(refreshed);
      setPushState('granted');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Push-Aktivierung fehlgeschlagen.';
      setPushError(message);
      setPushState('idle');
    }
  };

  const handleFeedbackSubmit = async (values: FeedbackFormValues) => {
    if (!orderId) {
      return;
    }
    setFeedbackSubmitting(true);
    setFeedbackMessage(undefined);
    try {
      const payload: SubmitFeedbackPayload = {
        rating: values.rating,
        comment: values.comment,
        tipAmount: values.tipAmount,
        tipCurrency: values.tipCurrency ?? 'EUR',
        driverMood: values.driverMood,
        contactConsent: values.contactConsent,
      };
      const response = await orderApi.submitFeedback(orderId, payload);
      setTracking(current => (current ? { ...current, feedback: response } : current));
      setFeedbackMessage('Vielen Dank für dein Feedback!');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Feedback konnte nicht gesendet werden.';
      setFeedbackMessage(message);
    } finally {
      setFeedbackSubmitting(false);
    }
  };

  const shareTrackingLink = async () => {
    if (!navigator.clipboard) {
      return;
    }
    await navigator.clipboard.writeText(window.location.href);
    setFeedbackMessage('Link kopiert – teile ihn mit deinen Liebsten.');
  };

  if (loading) {
    return (
      <div className="bg-slate-50 py-20 text-center text-slate-500">
        <p>Tracking wird geladen…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-slate-50 py-20 text-center">
        <p className="text-lg font-semibold text-slate-900">{error}</p>
        <button
          type="button"
          className="mt-4 rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold"
          onClick={() => navigate('/order')}
        >
          Zurück zur Bestellung
        </button>
      </div>
    );
  }

  if (!tracking) {
    return null;
  }

  const totalFormatter = new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-50">
      <div className="mx-auto max-w-5xl px-4 py-12">
        {isDemo && (
          <p className="mb-4 rounded-full bg-amber-100 px-4 py-1 text-center text-sm font-medium text-amber-700">
            Demo-Ansicht ohne Live-Daten
          </p>
        )}
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-indigo-500">
                Bestellung #{tracking.order.id}
              </p>
              <h1 className="text-3xl font-semibold text-slate-900">
                Status: {STATUS_LABELS[tracking.order.status] ?? tracking.order.status}
              </h1>
              <p className="text-sm text-slate-500">
                Lieferadresse: {tracking.order.deliveryAddress ?? 'wird an der Kasse abgestimmt'}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-6 py-4 text-right">
              <p className="text-sm text-slate-500">Gesamtbetrag</p>
              <p className="text-2xl font-semibold text-slate-900">
                {tracking.order.totalAmount ? totalFormatter.format(tracking.order.totalAmount) : '—'}
              </p>
              <p className="text-xs text-slate-400">Slot: {new Date(tracking.order.slot.startTime).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} – {new Date(tracking.order.slot.endTime).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</p>
            </div>
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-900">Live-Karte</h2>
              <p className="text-sm text-slate-500">
                Positionen werden ausschließlich zur Anzeige gespeichert und nach Zustellung automatisch gelöscht.
              </p>
              <div className="mt-4">
                <TrackingMap points={tracking.driverLocations} status={tracking.order.status} />
              </div>
              <div className="mt-4 rounded-xl bg-slate-100 p-4 text-sm text-slate-600">
                <p className="font-semibold text-slate-900">Fahrer:in</p>
                <p>{tracking.order.driverAssignment?.driverName ?? 'Noch nicht zugeteilt'}</p>
                {lastLocation && (
                  <p className="text-xs text-slate-500">
                    Letzte Aktualisierung {new Date(lastLocation.recordedAt).toLocaleTimeString('de-DE')}
                  </p>
                )}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-900">Status-Timeline</h2>
              <TrackingTimeline events={tracking.statusEvents} currentStatus={tracking.order.status} />
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={shareTrackingLink}
                  className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
                >
                  Tracking-Link kopieren
                </button>
                <button
                  type="button"
                  onClick={() => loadTracking()}
                  className="rounded-full border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700"
                >
                  Aktualisieren
                </button>
              </div>
            </div>
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 p-6">
              <h3 className="text-lg font-semibold text-slate-900">Benachrichtigungen</h3>
              <p className="text-sm text-slate-500">
                Du entscheidest, welche Kanäle wir verwenden dürfen. Änderungen greifen sofort.
              </p>
              <div className="mt-4 space-y-4 text-sm">
                {(['allowStatusPush', 'allowSlotUpdates', 'allowEmail'] as const).map(key => (
                  <label key={key} className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3">
                    <div>
                      <p className="font-semibold text-slate-900">
                        {key === 'allowStatusPush' && 'Live-Status per Push'}
                        {key === 'allowSlotUpdates' && 'Slot-Änderungen per Push'}
                        {key === 'allowEmail' && 'Updates per E-Mail'}
                      </p>
                      <p className="text-xs text-slate-500">
                        {key === 'allowEmail'
                          ? 'Nutzen wir nur für relevante Statusmeldungen.'
                          : 'Benachrichtigungen erscheinen direkt auf deinem Gerät.'}
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      className="h-5 w-5 accent-indigo-600"
                      checked={tracking.notificationPreference[key]}
                      disabled={preferenceUpdating}
                      onChange={event => handlePreferenceToggle(key, event.target.checked)}
                    />
                  </label>
                ))}
              </div>
              <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
                <p>
                  Hinweis: Zustimmung kann jederzeit widerrufen werden. Wir speichern alle Einwilligungen revisionssicher nach
                  DSGVO.
                </p>
              </div>
              <div className="mt-4">
                <button
                  type="button"
                  onClick={handlePushRegistration}
                  className="w-full rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  disabled={pushState === 'pending'}
                >
                  {pushState === 'granted' ? 'Push aktiviert' : 'Push-Updates aktivieren'}
                </button>
                {pushError && <p className="mt-2 text-xs text-rose-500">{pushError}</p>}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 p-6">
              <h3 className="text-lg font-semibold text-slate-900">Feedback & Trinkgeld</h3>
              {feedbackMessage && (
                <p className="mb-2 rounded-xl bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{feedbackMessage}</p>
              )}
              <FeedbackForm
                disabled={!canSubmitFeedback}
                existingFeedback={tracking.feedback ?? undefined}
                tipSuggestions={tracking.tipSuggestions}
                onSubmit={handleFeedbackSubmit}
                submitting={feedbackSubmitting}
              />
              {!canSubmitFeedback && (
                <p className="mt-3 text-xs text-slate-500">
                  Feedback ist nach der Zustellung verfügbar. Du kannst diesen Link speichern und später zurückkehren.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
