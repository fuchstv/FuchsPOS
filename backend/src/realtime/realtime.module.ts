import { Module } from '@nestjs/common';
import { PosRealtimeGateway } from './realtime.gateway';
import { WebhookService } from './webhook.service';
import { PrismaModule } from '../prisma/prisma.module';

/**
 * The module for real-time WebSocket communication.
 *
 * This module provides the `PosRealtimeGateway` for broadcasting events
 * to connected clients.
 */
@Module({
  imports: [PrismaModule],
  providers: [PosRealtimeGateway, WebhookService],
  exports: [PosRealtimeGateway, WebhookService],
})
export class RealtimeModule {}
