import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { CustomerAuthGuard } from './customer-auth.guard';
import { RateLimitGuard } from './rate-limit.guard';
import { RegisterPushSubscriptionDto } from './dto/register-push.dto';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';
import { SubmitFeedbackDto } from './dto/submit-feedback.dto';

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  @UseGuards(CustomerAuthGuard, RateLimitGuard)
  create(@Body() dto: CreateOrderDto) {
    return this.orders.createOrder(dto);
  }

  @Get()
  list(@Query('tenantId') tenantId: string, @Query('status') status?: string) {
    const normalizedStatus = status && (OrderStatus as Record<string, OrderStatus>)[status];
    return this.orders.listOrders(tenantId, normalizedStatus);
  }

  @Get(':id')
  getOrder(@Param('id', ParseIntPipe) id: number) {
    return this.orders.getOrder(id);
  }

  @Patch(':id/status')
  updateStatus(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateOrderStatusDto) {
    return this.orders.updateStatus(id, dto);
  }

  @Get(':id/tracking')
  @UseGuards(CustomerAuthGuard, RateLimitGuard)
  getTracking(@Param('id', ParseIntPipe) id: number) {
    return this.orders.getTrackingSnapshot(id);
  }

  @Post(':id/notifications/subscriptions')
  @UseGuards(CustomerAuthGuard, RateLimitGuard)
  registerPush(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RegisterPushSubscriptionDto,
  ) {
    return this.orders.registerPushSubscription(id, dto);
  }

  @Patch(':id/notifications/preferences')
  @UseGuards(CustomerAuthGuard, RateLimitGuard)
  updatePreferences(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateNotificationPreferencesDto,
  ) {
    return this.orders.updateNotificationPreferences(id, dto);
  }

  @Post(':id/feedback')
  @UseGuards(CustomerAuthGuard, RateLimitGuard)
  submitFeedback(@Param('id', ParseIntPipe) id: number, @Body() dto: SubmitFeedbackDto) {
    return this.orders.submitFeedback(id, dto);
  }
}
