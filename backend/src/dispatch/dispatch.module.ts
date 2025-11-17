import { Module } from '@nestjs/common';
import { DispatchController } from './dispatch.controller';
import { DispatchService } from './dispatch.service';
import { EngagementModule } from '../engagement/engagement.module';
import { DriverAuthGuard } from './driver-auth.guard';

@Module({
  imports: [EngagementModule],
  controllers: [DispatchController],
  providers: [DispatchService, DriverAuthGuard],
  exports: [DispatchService],
})
export class DispatchModule {}
