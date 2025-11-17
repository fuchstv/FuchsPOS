import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DeliverySlot, OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PosRealtimeGateway } from '../realtime/realtime.gateway';
import { WebhookService } from '../realtime/webhook.service';
import { CreateDeliverySlotDto } from './dto/create-delivery-slot.dto';
import { ListDeliverySlotsDto } from './dto/list-delivery-slots.dto';

const ACTIVE_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.SUBMITTED,
  OrderStatus.CONFIRMED,
  OrderStatus.PREPARING,
  OrderStatus.READY,
  OrderStatus.OUT_FOR_DELIVERY,
];

export type DeliverySlotWithUsage = DeliverySlot & {
  usage: {
    orders: number;
    kitchenLoad: number;
    storageLoad: number;
  };
  remaining: {
    orders: number;
    kitchenLoad: number;
    storageLoad: number;
  };
};

@Injectable()
export class DeliverySlotsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: PosRealtimeGateway,
    private readonly webhooks: WebhookService,
  ) {}

  async createSlot(dto: CreateDeliverySlotDto) {
    if (new Date(dto.endTime).getTime() <= new Date(dto.startTime).getTime()) {
      throw new BadRequestException('Endzeit muss nach der Startzeit liegen.');
    }

    const slot = await this.prisma.deliverySlot.create({
      data: {
        tenantId: dto.tenantId,
        startTime: new Date(dto.startTime),
        endTime: new Date(dto.endTime),
        maxOrders: dto.maxOrders,
        maxKitchenLoad: dto.maxKitchenLoad,
        maxStorageLoad: dto.maxStorageLoad,
        notes: dto.notes ?? null,
      },
    });

    await this.broadcast(slot.id);
    return slot;
  }

  async listSlots(dto: ListDeliverySlotsDto) {
    const from = dto.from ? new Date(dto.from) : new Date();
    const to = dto.to ? new Date(dto.to) : undefined;

    const slots = await this.prisma.deliverySlot.findMany({
      where: {
        tenantId: dto.tenantId,
        startTime: { gte: from },
        ...(to ? { endTime: { lte: to } } : {}),
      },
      orderBy: { startTime: 'asc' },
    });

    return Promise.all(slots.map(slot => this.enrichSlot(slot)));
  }

  async getSlot(slotId: number) {
    const slot = await this.prisma.deliverySlot.findUnique({ where: { id: slotId } });
    if (!slot) {
      throw new NotFoundException(`Slot ${slotId} nicht gefunden.`);
    }
    return this.enrichSlot(slot);
  }

  async reserveCapacity(slotId: number, kitchenLoad: number, storageLoad: number) {
    const slot = await this.prisma.deliverySlot.findUnique({ where: { id: slotId } });
    if (!slot) {
      throw new NotFoundException(`Slot ${slotId} nicht gefunden.`);
    }

    const usage = await this.computeUsage(slotId);

    if (usage.orders + 1 > slot.maxOrders) {
      throw new BadRequestException('Dieser Liefer-Slot ist bereits voll ausgelastet.');
    }
    if (usage.kitchenLoad + kitchenLoad > slot.maxKitchenLoad) {
      throw new BadRequestException('Küchenkapazität für diesen Slot überschritten.');
    }
    if (usage.storageLoad + storageLoad > slot.maxStorageLoad) {
      throw new BadRequestException('Lagerkapazität für diesen Slot überschritten.');
    }

    return slot;
  }

  async broadcast(slotId: number) {
    const slot = await this.prisma.deliverySlot.findUnique({ where: { id: slotId } });
    if (!slot) {
      return;
    }

    const enriched = await this.enrichSlot(slot);
    this.realtime.broadcast('delivery-slots.updated', enriched);
    await this.webhooks.dispatch('delivery-slots.updated', enriched);
  }

  private async enrichSlot(slot: DeliverySlot): Promise<DeliverySlotWithUsage> {
    const usage = await this.computeUsage(slot.id);
    const remaining = {
      orders: Math.max(slot.maxOrders - usage.orders, 0),
      kitchenLoad: Math.max(slot.maxKitchenLoad - usage.kitchenLoad, 0),
      storageLoad: Math.max(slot.maxStorageLoad - usage.storageLoad, 0),
    };
    return { ...slot, usage, remaining };
  }

  private async computeUsage(slotId: number) {
    const aggregate = await this.prisma.customerOrder.aggregate({
      where: {
        slotId,
        status: { in: ACTIVE_ORDER_STATUSES },
      },
      _count: { _all: true },
      _sum: { kitchenLoad: true, storageLoad: true },
    });

    return {
      orders: aggregate._count._all ?? 0,
      kitchenLoad: Number(aggregate._sum.kitchenLoad ?? 0),
      storageLoad: Number(aggregate._sum.storageLoad ?? 0),
    };
  }
}
