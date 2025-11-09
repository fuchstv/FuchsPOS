import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { usePosRealtime } from '../../realtime/PosRealtimeContext';

/**
 * Defines the possible types for inventory-related real-time events.
 */
export type InventoryRealtimeEventType =
  | 'goods-receipt'
  | 'count-created'
  | 'count-finalized'
  | 'price-change';

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

/**
 * Defines the shape of the context value for inventory real-time updates.
 */
interface InventoryRealtimeContextValue {
  /** A list of the most recent inventory events. */
  events: InventoryRealtimeEvent[];
  /** A function to add a new event to the list. */
  pushEvent: (event: InventoryRealtimeEvent) => void;
}

/**
 * React context for providing real-time inventory event data.
 */
const InventoryRealtimeContext = createContext<InventoryRealtimeContextValue | undefined>(undefined);

const MAX_EVENTS = 40;

/**
 * Generates a unique ID for an inventory event.
 * @param {InventoryRealtimeEventType} type - The type of the event.
 * @returns {string} A unique event ID.
 */
function buildEventId(type: InventoryRealtimeEventType) {
  return `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Provides a context for real-time inventory updates to its children.
 * It listens for WebSocket events and updates the event list.
 * @param {{ children: React.ReactNode }} props - The component props.
 * @param {React.ReactNode} props.children - The child components to render.
 * @returns {JSX.Element} The provider component.
 */
export function InventoryRealtimeProvider({ children }: { children: React.ReactNode }) {
  const [events, setEvents] = useState<InventoryRealtimeEvent[]>([]);
  const { client } = usePosRealtime();

  const pushEvent = useCallback((event: InventoryRealtimeEvent) => {
    setEvents(previous => [event, ...previous].slice(0, MAX_EVENTS));
  }, []);

  useEffect(() => {
    if (!client) {
      return () => undefined;
    }

    const handlers: Array<[string, (payload: any) => void]> = [
      [
        'inventory.goods-receipt.imported',
        payload => {
          pushEvent({
            id: buildEventId('goods-receipt'),
            type: 'goods-receipt',
            title: 'Wareneingang importiert',
            timestamp: new Date().toISOString(),
            description: payload?.goodsReceipt?.reference ?? 'BNN-Import abgeschlossen',
            payload,
          });
        },
      ],
      [
        'inventory.count.created',
        payload => {
          const id = payload?.inventoryCount?.id ?? payload?.id;
          pushEvent({
            id: buildEventId('count-created'),
            type: 'count-created',
            title: 'Inventurzählung gestartet',
            timestamp: new Date().toISOString(),
            description: id ? `Inventur #${id}` : undefined,
            payload,
          });
        },
      ],
      [
        'inventory.count.finalized',
        payload => {
          const id = payload?.inventoryCount?.id ?? payload?.id;
          pushEvent({
            id: buildEventId('count-finalized'),
            type: 'count-finalized',
            title: 'Inventurzählung abgeschlossen',
            timestamp: new Date().toISOString(),
            description: id ? `Inventur #${id}` : undefined,
            payload,
          });
        },
      ],
      [
        'inventory.price-change.recorded',
        payload => {
          const sku = payload?.product?.sku ?? payload?.priceChange?.productSku;
          pushEvent({
            id: buildEventId('price-change'),
            type: 'price-change',
            title: 'Preisänderung verbucht',
            timestamp: new Date().toISOString(),
            description: sku ? `SKU ${sku}` : undefined,
            payload,
          });
        },
      ],
    ];

    const subscriptions = handlers.map(([event, handler]) => client.on(event, handler));
    const unsubscribeError = client.on('error', error => {
      console.warn('Inventur-Realtime-Verbindung meldete einen Fehler.', error);
    });

    return () => {
      subscriptions.forEach(unsubscribe => unsubscribe());
      unsubscribeError();
    };
  }, [client, pushEvent]);

  const value = useMemo(() => ({ events, pushEvent }), [events, pushEvent]);

  return <InventoryRealtimeContext.Provider value={value}>{children}</InventoryRealtimeContext.Provider>;
}

/**
 * Custom hook for accessing the inventory real-time context.
 * This must be used within a component that is a descendant of `InventoryRealtimeProvider`.
 * @returns {InventoryRealtimeContextValue} The inventory real-time context value.
 * @throws {Error} If used outside of an `InventoryRealtimeProvider`.
 */
export function useInventoryRealtime() {
  const context = useContext(InventoryRealtimeContext);
  if (!context) {
    throw new Error('useInventoryRealtime muss innerhalb des InventoryRealtimeProvider verwendet werden.');
  }
  return context;
}
