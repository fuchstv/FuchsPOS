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
