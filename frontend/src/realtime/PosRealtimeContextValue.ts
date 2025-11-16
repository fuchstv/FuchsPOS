import { RealtimeClient, RealtimeConnectionStatus } from './RealtimeClient';
import { QueueMetricEvent, RealtimeSystemError } from './PosRealtimeEvents';

/**
 * The value provided by the `PosRealtimeContext`.
 */
export type PosRealtimeContextValue = {
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
