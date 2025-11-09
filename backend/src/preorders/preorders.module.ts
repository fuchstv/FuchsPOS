import { Module } from '@nestjs/common';
import { PreordersService } from './preorders.service';
import { RealtimeModule } from '../realtime/realtime.module';

/**
 * The module for handling pre-orders and related functionalities.
 *
 * This module provides the `PreordersService` which is responsible for managing
 * pre-orders, cash events, and augmenting sale data with related information.
 */
@Module({
  imports: [RealtimeModule],
  providers: [PreordersService],
  exports: [PreordersService],
})
export class PreordersModule {}
