import { Module } from '@nestjs/common';
import { DeliverySlotsService } from './delivery-slots.service';
import { DeliverySlotsController } from './delivery-slots.controller';

@Module({
  controllers: [DeliverySlotsController],
  providers: [DeliverySlotsService],
  exports: [DeliverySlotsService],
})
export class DeliverySlotsModule {}
