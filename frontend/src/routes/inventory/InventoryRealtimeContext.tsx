import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { io, Socket } from 'socket.io-client';

export type InventoryRealtimeEventType =
  | 'goods-receipt'
  | 'count-created'
  | 'count-finalized'
  | 'price-change';

export interface InventoryRealtimeEvent {
  id: string;
  type: InventoryRealtimeEventType;
  title: string;
  timestamp: string;
  description?: string;
  payload?: unknown;
}

interface InventoryRealtimeContextValue {
  events: InventoryRealtimeEvent[];
  pushEvent: (event: InventoryRealtimeEvent) => void;
}

const InventoryRealtimeContext = createContext<InventoryRealtimeContextValue | undefined>(undefined);

const MAX_EVENTS = 40;

function buildEventId(type: InventoryRealtimeEventType) {
  return `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function InventoryRealtimeProvider({ children }: { children: React.ReactNode }) {
  const [events, setEvents] = useState<InventoryRealtimeEvent[]>([]);

  const pushEvent = useCallback((event: InventoryRealtimeEvent) => {
    setEvents(previous => [event, ...previous].slice(0, MAX_EVENTS));
  }, []);

  useEffect(() => {
    const apiBase = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api').replace(/\/api$/, '');
    let socket: Socket | undefined;

    try {
      socket = io(`${apiBase}/pos`, { transports: ['websocket'] });
    } catch (error) {
      console.warn('Inventur-Realtime-Verbindung konnte nicht aufgebaut werden.', error);
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

    handlers.forEach(([event, handler]) => socket?.on(event, handler));

    socket.on('connect_error', error => {
      console.warn('Inventur-Realtime-Verbindung fehlgeschlagen.', error);
    });

    return () => {
      handlers.forEach(([event, handler]) => socket?.off(event, handler));
      socket?.disconnect();
    };
  }, [pushEvent]);

  const value = useMemo(() => ({ events, pushEvent }), [events, pushEvent]);

  return <InventoryRealtimeContext.Provider value={value}>{children}</InventoryRealtimeContext.Provider>;
}

export function useInventoryRealtime() {
  const context = useContext(InventoryRealtimeContext);
  if (!context) {
    throw new Error('useInventoryRealtime muss innerhalb des InventoryRealtimeProvider verwendet werden.');
  }
  return context;
}
