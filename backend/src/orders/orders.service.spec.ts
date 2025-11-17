import { OrderStatus } from '@prisma/client';
import { OrdersService } from './orders.service';
import { DeliverySlotsService } from '../delivery-slots/delivery-slots.service';
import { KitchenService } from '../kitchen/kitchen.service';
import { DispatchService } from '../dispatch/dispatch.service';
import { PosRealtimeGateway } from '../realtime/realtime.gateway';
import { WebhookService } from '../realtime/webhook.service';
import { PrismaService } from '../prisma/prisma.service';
import { OrderEngagementService } from '../engagement/order-engagement.service';

const createPrismaMock = () => ({
  customerOrder: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
  },
  product: {
    findMany: jest.fn(),
  },
} as unknown as PrismaService);

describe('OrdersService', () => {
  let service: OrdersService;
  let prisma: PrismaService;
  const deliverySlots = { reserveCapacity: jest.fn() } as unknown as DeliverySlotsService;
  const kitchen = { createTasksForOrder: jest.fn(), handleOrderStatusChange: jest.fn() } as unknown as KitchenService;
  const dispatch = {
    ensureAssignment: jest.fn(),
    planDriver: jest.fn(),
    handleOrderStatusChange: jest.fn(),
  } as unknown as DispatchService;
  const realtime = { broadcast: jest.fn() } as unknown as PosRealtimeGateway;
  const webhooks = { dispatch: jest.fn() } as unknown as WebhookService;

  const engagement = {
    ensurePreference: jest.fn(),
    recordStatusEvent: jest.fn(),
    notifyStatusChange: jest.fn(),
  } as unknown as OrderEngagementService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new OrdersService(
      prisma,
      deliverySlots,
      kitchen,
      dispatch,
      realtime,
      webhooks,
      engagement,
    );
    jest.clearAllMocks();
  });

  it('creates an order, reserves a slot and syncs inventory', async () => {
    (deliverySlots.reserveCapacity as jest.Mock).mockResolvedValue({ id: 1 });
    (prisma.product.findMany as jest.Mock).mockResolvedValue([
      { sku: 'A', batches: [{ quantity: 10 }] },
    ]);
    (prisma.customerOrder.create as jest.Mock).mockResolvedValue({ id: 1 });
    const orderWithRelations = { id: 1, status: OrderStatus.SUBMITTED };
    (prisma.customerOrder.findUnique as jest.Mock).mockResolvedValue(orderWithRelations);

    const dto = {
      tenantId: 'tenant-1',
      slotId: 5,
      customerName: 'Max Muster',
      items: [{ sku: 'A', quantity: 2, requiresKitchen: true }],
    };

    const result = await service.createOrder(dto as any);

    expect(deliverySlots.reserveCapacity).toHaveBeenCalledWith(5, 2, 2);
    expect(prisma.customerOrder.create).toHaveBeenCalled();
    expect(kitchen.createTasksForOrder).toHaveBeenCalledWith(1, [expect.objectContaining({ sku: 'A' })]);
    expect(dispatch.ensureAssignment).toHaveBeenCalledWith(1);
    expect(realtime.broadcast).toHaveBeenCalledWith('orders.created', orderWithRelations);
    expect(webhooks.dispatch).toHaveBeenCalledWith('orders.created', orderWithRelations);
    expect(result).toEqual(orderWithRelations);
  });

  it('blocks illegal status transitions', async () => {
    (prisma.customerOrder.findUnique as jest.Mock)
      .mockResolvedValueOnce({ id: 1, status: OrderStatus.DELIVERED })
      .mockResolvedValueOnce({ id: 1, status: OrderStatus.DELIVERED });

    await expect(
      service.updateStatus(1, { status: OrderStatus.CONFIRMED } as any),
    ).rejects.toThrow('Statuswechsel');
  });

  it('updates status and emits kitchen/dispatch events', async () => {
    const existing = { id: 1, status: OrderStatus.CONFIRMED };
    const updated = { ...existing, status: OrderStatus.PREPARING };
    (prisma.customerOrder.findUnique as jest.Mock)
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce(updated);
    (prisma.customerOrder.update as jest.Mock).mockResolvedValue(updated);

    const result = await service.updateStatus(1, { status: OrderStatus.PREPARING } as any);

    expect(kitchen.handleOrderStatusChange).toHaveBeenCalledWith(1, OrderStatus.PREPARING);
    expect(dispatch.handleOrderStatusChange).toHaveBeenCalledWith(1, OrderStatus.PREPARING);
    expect(realtime.broadcast).toHaveBeenCalledWith('orders.updated', updated);
    expect(webhooks.dispatch).toHaveBeenCalledWith('orders.updated', updated);
    expect(result).toEqual(updated);
  });
});
