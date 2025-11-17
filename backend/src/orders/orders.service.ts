import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DeliverySlotsService } from '../delivery-slots/delivery-slots.service';
import { KitchenService, OrderItemForTask } from '../kitchen/kitchen.service';
import { DispatchService } from '../dispatch/dispatch.service';
import { PosRealtimeGateway } from '../realtime/realtime.gateway';
import { WebhookService } from '../realtime/webhook.service';
import { CreateOrderDto, OrderItemDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';

const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.SUBMITTED]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  [OrderStatus.CONFIRMED]: [OrderStatus.PREPARING, OrderStatus.CANCELLED],
  [OrderStatus.PREPARING]: [OrderStatus.READY, OrderStatus.CANCELLED],
  [OrderStatus.READY]: [OrderStatus.OUT_FOR_DELIVERY, OrderStatus.CANCELLED],
  [OrderStatus.OUT_FOR_DELIVERY]: [OrderStatus.DELIVERED, OrderStatus.CANCELLED],
  [OrderStatus.DELIVERED]: [],
  [OrderStatus.CANCELLED]: [],
};

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly deliverySlots: DeliverySlotsService,
    private readonly kitchen: KitchenService,
    private readonly dispatch: DispatchService,
    private readonly realtime: PosRealtimeGateway,
    private readonly webhooks: WebhookService,
  ) {}

  async createOrder(dto: CreateOrderDto) {
    if (!dto.items?.length) {
      throw new BadRequestException('Eine Bestellung muss mindestens ein Produkt enthalten.');
    }

    const { kitchenLoad, storageLoad } = this.estimateLoad(dto);
    await this.deliverySlots.reserveCapacity(dto.slotId, kitchenLoad, storageLoad);
    const inventorySnapshot = await this.ensureInventory(dto.tenantId, dto.items);

    const order = await this.prisma.customerOrder.create({
      data: {
        tenantId: dto.tenantId,
        slotId: dto.slotId,
        customerName: dto.customerName,
        contactEmail: dto.contactEmail ?? null,
        contactPhone: dto.contactPhone ?? null,
        deliveryAddress: dto.deliveryAddress ?? null,
        totalAmount: dto.totalAmount ? new Prisma.Decimal(dto.totalAmount) : null,
        items: dto.items,
        notes: dto.notes ?? null,
        kitchenLoad,
        storageLoad,
        inventorySnapshot,
        inventorySyncedAt: new Date(),
      },
    });

    await this.kitchen.createTasksForOrder(order.id, this.toTaskItems(dto.items));
    await this.dispatch.ensureAssignment(order.id);
    if (dto.preferredDriver) {
      await this.dispatch.planDriver({ orderId: order.id, driverName: dto.preferredDriver });
    }

    await this.broadcast(order.id, 'orders.created');
    return this.getOrder(order.id);
  }

  async listOrders(tenantId: string, status?: OrderStatus) {
    return this.prisma.customerOrder.findMany({
      where: {
        tenantId,
        status: status ?? undefined,
      },
      include: {
        slot: true,
        tasks: true,
        driverAssignment: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getOrder(id: number) {
    const order = await this.prisma.customerOrder.findUnique({
      where: { id },
      include: {
        slot: true,
        tasks: true,
        driverAssignment: true,
      },
    });
    if (!order) {
      throw new NotFoundException(`Bestellung ${id} nicht gefunden.`);
    }
    return order;
  }

  async updateStatus(id: number, dto: UpdateOrderStatusDto) {
    const order = await this.getOrder(id);
    const allowed = ORDER_TRANSITIONS[order.status] ?? [];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(`Statuswechsel von ${order.status} nach ${dto.status} ist nicht erlaubt.`);
    }

    const updated = await this.prisma.customerOrder.update({
      where: { id },
      data: {
        status: dto.status,
        notes: dto.notes ?? order.notes,
      },
      include: {
        slot: true,
        tasks: true,
        driverAssignment: true,
      },
    });

    await this.kitchen.handleOrderStatusChange(id, dto.status);
    await this.dispatch.handleOrderStatusChange(id, dto.status);
    await this.broadcast(id, 'orders.updated');
    return updated;
  }

  private estimateLoad(dto: CreateOrderDto) {
    if (dto.kitchenLoad !== undefined && dto.storageLoad !== undefined) {
      return { kitchenLoad: dto.kitchenLoad, storageLoad: dto.storageLoad };
    }

    let kitchenLoad = 0;
    let storageLoad = 0;

    for (const item of dto.items) {
      const quantity = Number(item.quantity);
      storageLoad += item.storageWorkload ?? quantity;
      if (item.requiresKitchen) {
        kitchenLoad += item.kitchenWorkload ?? quantity;
      }
    }

    return { kitchenLoad, storageLoad };
  }

  private async ensureInventory(tenantId: string, items: OrderItemDto[]) {
    const skus = items.map(item => item.sku);
    const products = await this.prisma.product.findMany({
      where: { tenantId, sku: { in: skus } },
      include: { batches: true },
    });

    const snapshot: Array<{ sku: string; requested: number; available: number }> = [];

    for (const item of items) {
      const product = products.find(prod => prod.sku === item.sku);
      if (!product) {
        throw new BadRequestException(`Produkt ${item.sku} wurde nicht gefunden.`);
      }
      const available = product.batches.reduce(
        (sum, batch) => sum + Number(batch.quantity ?? 0),
        0,
      );
      const requested = Number(item.quantity);
      if (available < requested) {
        throw new BadRequestException(`Nicht genügend Bestand für ${item.sku}. (${available} verfügbar)`);
      }
      snapshot.push({ sku: item.sku, requested, available });
    }

    return snapshot;
  }

  private toTaskItems(items: OrderItemDto[]): OrderItemForTask[] {
    return items.map(item => ({
      sku: item.sku,
      quantity: Number(item.quantity),
      requiresKitchen: item.requiresKitchen,
    }));
  }

  private async broadcast(orderId: number, event: string) {
    const order = await this.prisma.customerOrder.findUnique({
      where: { id: orderId },
      include: { slot: true, tasks: true, driverAssignment: true },
    });
    if (!order) {
      return;
    }
    this.realtime.broadcast(event, order);
    await this.webhooks.dispatch(event, order);
  }
}
