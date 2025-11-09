import { Module } from '@nestjs/common';
import { PosRealtimeGateway } from './realtime.gateway';

/**
 * The module for real-time WebSocket communication.
 *
 * This module provides the `PosRealtimeGateway` for broadcasting events
 * to connected clients.
 */
@Module({
  providers: [PosRealtimeGateway],
  exports: [PosRealtimeGateway],
})
export class RealtimeModule {}
