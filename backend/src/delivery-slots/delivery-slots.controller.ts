import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { DeliverySlotsService } from './delivery-slots.service';
import { CreateDeliverySlotDto } from './dto/create-delivery-slot.dto';
import { ListDeliverySlotsDto } from './dto/list-delivery-slots.dto';
import { ReserveDeliverySlotDto } from './dto/reserve-delivery-slot.dto';

@Controller('delivery-slots')
export class DeliverySlotsController {
  constructor(private readonly deliverySlots: DeliverySlotsService) {}

  @Post()
  createSlot(@Body() dto: CreateDeliverySlotDto) {
    return this.deliverySlots.createSlot(dto);
  }

  @Get()
  listSlots(@Query() query: ListDeliverySlotsDto) {
    return this.deliverySlots.listSlots(query);
  }

  @Get(':id')
  getSlot(@Param('id', ParseIntPipe) id: number) {
    return this.deliverySlots.getSlot(id);
  }

  @Post(':id/reservations')
  reserve(@Param('id', ParseIntPipe) id: number, @Body() dto: ReserveDeliverySlotDto) {
    return this.deliverySlots.reserveCapacity(id, dto.kitchenLoad, dto.storageLoad);
  }
}
