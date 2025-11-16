import { InventoryRealtimeEvent } from './InventoryRealtimeEvents';

/**
 * Defines the shape of the context value for inventory real-time updates.
 */
export interface InventoryRealtimeContextValue {
  /** A list of the most recent inventory events. */
  events: InventoryRealtimeEvent[];
  /** A function to add a new event to the list. */
  pushEvent: (event: InventoryRealtimeEvent) => void;
}
