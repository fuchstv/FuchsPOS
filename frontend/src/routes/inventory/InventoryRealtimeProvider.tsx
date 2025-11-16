import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePosRealtime } from '../../realtime/usePosRealtime';
import { InventoryRealtimeContext } from './InventoryRealtimeContext';
import { InventoryRealtimeEvent, InventoryRealtimeEventType } from './InventoryRealtimeEvents';

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

    const handlers: Array<[string, (payload: unknown) => void]> = [
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
      [
        'inventory.products.imported',
        payload => {
          pushEvent({
            id: buildEventId('product-import'),
            type: 'product-import',
            title: 'Artikel importiert',
            timestamp: new Date().toISOString(),
            description: payload?.summary
              ? `${payload.summary.created} neu / ${payload.summary.updated} aktualisiert`
              : undefined,
            payload,
          });
        },
      ],
      [
        'inventory.product.updated',
        payload => {
          const sku = payload?.product?.sku;
          pushEvent({
            id: buildEventId('product-updated'),
            type: 'product-updated',
            title: 'Artikel bearbeitet',
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
