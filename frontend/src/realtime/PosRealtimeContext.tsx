import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { RealtimeClient, RealtimeConnectionStatus, buildRealtimeUrl } from './RealtimeClient';

/**
 * Represents a real-time event for queue metrics.
 */
export type QueueMetricEvent = {
  /** The name of the queue. */
  queue: string;
  /** The timestamp when the metrics were updated. */
  updatedAt: string;
  [key: string]: unknown;
};

/**
 * Represents a system error event received via the real-time connection.
 */
export type RealtimeSystemError = {
  /** The source of the error (e.g., 'backend', 'realtime-client'). */
  source: string;
  /** The error message. */
  message: string;
  /** The timestamp when the error occurred. */
  occurredAt: string;
  /** Optional additional details about the error. */
  details?: unknown;
};

/**
 * The value provided by the `PosRealtimeContext`.
 */
type PosRealtimeContextValue = {
  /** The `RealtimeClient` instance. */
  client: RealtimeClient | null;
  /** The current connection status. */
  status: RealtimeConnectionStatus;
  /** Information about the last disconnection, if any. */
  lastDisconnect?: { code?: number; reason?: string; wasClean?: boolean };
  /** An array of the latest queue metrics. */
  metrics: QueueMetricEvent[];
  /** An array of the most recent system errors. */
  errors: RealtimeSystemError[];
  /** A function to manually trigger a reconnection. */
  reconnect: () => void;
};

const PosRealtimeContext = createContext<PosRealtimeContextValue | undefined>(undefined);

const MAX_ERROR_HISTORY = 20;

const sortMetrics = (metrics: QueueMetricEvent[]) =>
  [...metrics].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

/**
 * A React provider component that manages the real-time WebSocket client for POS events.
 *
 * It handles the lifecycle of the `RealtimeClient`, maintains the connection status,
 * and provides access to received metrics and errors via context.
 *
 * @param {object} props - The component props.
 * @param {React.ReactNode} props.children - The child components to render.
 * @returns {JSX.Element} The provider component.
 */
export function PosRealtimeProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<RealtimeConnectionStatus>('connecting');
  const [metrics, setMetrics] = useState<QueueMetricEvent[]>([]);
  const [errors, setErrors] = useState<RealtimeSystemError[]>([]);
  const [lastDisconnect, setLastDisconnect] = useState<{ code?: number; reason?: string; wasClean?: boolean }>();
  const clientRef = useRef<RealtimeClient | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return () => undefined;
    }

    const client = new RealtimeClient(buildRealtimeUrl('pos'), { baseDelay: 2000, maxDelay: 45000 });
    clientRef.current = client;
    setStatus(client.getStatus());

    const unsubscribeConnect = client.on('connect', () => {
      setStatus('connected');
      setLastDisconnect(undefined);
    });

    const unsubscribeStatus = client.on('status', payload => {
      if (payload === 'connected' || payload === 'connecting' || payload === 'disconnected') {
        setStatus(payload);
      }
    });

    const unsubscribeDisconnect = client.on('disconnect', payload => {
      setStatus('disconnected');
      if (payload && typeof payload === 'object') {
        const { code, reason, wasClean } = payload as {
          code?: number;
          reason?: string;
          wasClean?: boolean;
        };
        setLastDisconnect({ code, reason, wasClean });
      } else {
        setLastDisconnect(undefined);
      }
    });

    const unsubscribeClientError = client.on('error', payload => {
      const message = typeof payload?.message === 'string' ? payload.message : 'Realtime-Fehler';
      setErrors(previous =>
        [
          {
            source: 'realtime-client',
            message,
            occurredAt: new Date().toISOString(),
          },
          ...previous,
        ].slice(0, MAX_ERROR_HISTORY),
      );
    });

    const unsubscribeMetrics = client.on('queue.metrics', payload => {
      if (!payload || typeof payload !== 'object' || !('queue' in payload)) {
        return;
      }

      const metric = {
        ...(payload as QueueMetricEvent),
        updatedAt: (payload as QueueMetricEvent).updatedAt ?? new Date().toISOString(),
      };

      setMetrics(previous => {
        const map = new Map(previous.map(item => [item.queue, item] as const));
        map.set(metric.queue, { ...map.get(metric.queue), ...metric });
        return sortMetrics(Array.from(map.values()));
      });
    });

    const unsubscribeSystemError = client.on('system.error', payload => {
      if (!payload || typeof payload !== 'object') {
        return;
      }

      const event = payload as Partial<RealtimeSystemError>;
      setErrors(previous =>
        [
          {
            source: event.source ?? 'backend',
            message: event.message ?? 'Unbekannter Fehler',
            occurredAt: event.occurredAt ?? new Date().toISOString(),
            details: event.details,
          },
          ...previous,
        ].slice(0, MAX_ERROR_HISTORY),
      );
    });

    return () => {
      unsubscribeConnect();
      unsubscribeDisconnect();
      unsubscribeStatus();
      unsubscribeClientError();
      unsubscribeMetrics();
      unsubscribeSystemError();
      client.close();
      clientRef.current = null;
    };
  }, []);

  const value = useMemo(
    () => ({
      client: clientRef.current,
      status,
      metrics,
      errors,
      reconnect: () => clientRef.current?.reconnect(),
      lastDisconnect,
    }),
    [status, metrics, errors, lastDisconnect],
  );

  return <PosRealtimeContext.Provider value={value}>{children}</PosRealtimeContext.Provider>;
}

/**
 * A custom hook to access the `PosRealtimeContext`.
 *
 * @throws {Error} If used outside of a `PosRealtimeProvider`.
 * @returns {PosRealtimeContextValue} The context value.
 */
export function usePosRealtime() {
  const context = useContext(PosRealtimeContext);
  if (!context) {
    throw new Error('usePosRealtime muss innerhalb des PosRealtimeProvider verwendet werden.');
  }
  return context;
}
