import { Module } from '@nestjs/common';
import { PreordersService } from './preorders.service';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [RealtimeModule],
  providers: [PreordersService],
  exports: [PreordersService],
})
export class PreordersModule {}
