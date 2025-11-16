import { createContext } from 'react';
import { InventoryRealtimeContextValue } from './InventoryRealtimeContextValue';

export const InventoryRealtimeContext = createContext<InventoryRealtimeContextValue | undefined>(undefined);
