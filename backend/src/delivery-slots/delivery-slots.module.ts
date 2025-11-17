import { Module } from '@nestjs/common';
import { DeliverySlotsService } from './delivery-slots.service';
import { DeliverySlotsController } from './delivery-slots.controller';
import { EngagementModule } from '../engagement/engagement.module';

@Module({
  imports: [EngagementModule],
  controllers: [DeliverySlotsController],
  providers: [DeliverySlotsService],
  exports: [DeliverySlotsService],
})
export class DeliverySlotsModule {}
