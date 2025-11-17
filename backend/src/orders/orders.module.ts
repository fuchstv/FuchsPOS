import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { DeliverySlotsModule } from '../delivery-slots/delivery-slots.module';
import { KitchenModule } from '../kitchen/kitchen.module';
import { DispatchModule } from '../dispatch/dispatch.module';
import { CustomerAuthGuard } from './customer-auth.guard';
import { RateLimitGuard } from './rate-limit.guard';

@Module({
  imports: [DeliverySlotsModule, KitchenModule, DispatchModule],
  controllers: [OrdersController],
  providers: [OrdersService, CustomerAuthGuard, RateLimitGuard],
  exports: [OrdersService],
})
export class OrdersModule {}
