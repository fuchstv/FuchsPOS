import { Module } from '@nestjs/common';
import { MailerModule } from '../mailer/mailer.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { OrderEngagementService } from './order-engagement.service';
import { PushService } from './push.service';

@Module({
  imports: [MailerModule, RealtimeModule],
  providers: [OrderEngagementService, PushService],
  exports: [OrderEngagementService, PushService],
})
export class EngagementModule {}
