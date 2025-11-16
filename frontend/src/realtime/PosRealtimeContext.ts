import { createContext } from 'react';
import { PosRealtimeContextValue } from './PosRealtimeContextValue';

export const PosRealtimeContext = createContext<PosRealtimeContextValue | undefined>(undefined);
