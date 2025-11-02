import { Module } from '@nestjs/common';
import { WoltSyncService } from './wolt.service';
import { WoltApiService } from './wolt.api';
import { PreordersModule } from '../preorders/preorders.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [PreordersModule, RealtimeModule],
  providers: [WoltSyncService, WoltApiService],
})
export class WoltModule {}
