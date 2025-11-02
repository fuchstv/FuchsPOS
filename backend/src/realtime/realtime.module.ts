import { Module } from '@nestjs/common';
import { PosRealtimeGateway } from './realtime.gateway';

@Module({
  providers: [PosRealtimeGateway],
  exports: [PosRealtimeGateway],
})
export class RealtimeModule {}
