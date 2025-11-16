import { useContext } from 'react';
import { PosRealtimeContext } from './PosRealtimeContext';
import { PosRealtimeContextValue } from './PosRealtimeContextValue';

/**
 * A custom hook to access the `PosRealtimeContext`.
 *
 * @throws {Error} If used outside of a `PosRealtimeProvider`.
 * @returns {PosRealtimeContextValue} The context value.
 */
export function usePosRealtime(): PosRealtimeContextValue {
  const context = useContext(PosRealtimeContext);
  if (!context) {
    throw new Error('usePosRealtime muss innerhalb des PosRealtimeProvider verwendet werden.');
  }
  return context;
}
