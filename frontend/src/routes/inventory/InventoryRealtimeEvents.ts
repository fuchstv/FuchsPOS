/**
 * Defines the possible types for inventory-related real-time events.
 */
export type InventoryRealtimeEventType =
  | 'goods-receipt'
  | 'count-created'
  | 'count-finalized'
  | 'price-change'
  | 'product-import'
  | 'product-updated';

/**
 * Represents a single real-time event related to inventory management.
 */
export interface InventoryRealtimeEvent {
  /** A unique identifier for the event. */
  id: string;
  /** The type of the event. */
  type: InventoryRealtimeEventType;
  /** A human-readable title for the event. */
  title: string;
  /** The ISO 8601 timestamp of when the event occurred. */
  timestamp: string;
  /** An optional description providing more details about the event. */
  description?: string;
  /** An optional payload containing additional data related to the event. */
  payload?: unknown;
}
