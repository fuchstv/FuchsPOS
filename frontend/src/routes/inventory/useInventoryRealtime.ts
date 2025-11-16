import { useContext } from 'react';
import { InventoryRealtimeContext } from './InventoryRealtimeContext';
import { InventoryRealtimeContextValue } from './InventoryRealtimeContextValue';

/**
 * Custom hook for accessing the inventory real-time context.
 * This must be used within a component that is a descendant of `InventoryRealtimeProvider`.
 * @returns {InventoryRealtimeContextValue} The inventory real-time context value.
 * @throws {Error} If used outside of an `InventoryRealtimeProvider`.
 */
export function useInventoryRealtime(): InventoryRealtimeContextValue {
  const context = useContext(InventoryRealtimeContext);
  if (!context) {
    throw new Error('useInventoryRealtime muss innerhalb des InventoryRealtimeProvider verwendet werden.');
  }
  return context;
}
