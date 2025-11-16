import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { WoltApiService } from './wolt.api';
import { PreordersService } from '../preorders/preorders.service';
import { PosRealtimeGateway } from '../realtime/realtime.gateway';
import { WoltSyncService } from './wolt.service';

const createPrismaMock = () => {
  const prisma: Partial<PrismaService> & { $transaction: jest.Mock } = {
    woltProduct: { upsert: jest.fn().mockResolvedValue(undefined) } as any,
    woltOrder: { upsert: jest.fn().mockResolvedValue(undefined) } as any,
    $transaction: jest.fn(async (operations: any) => {
      if (Array.isArray(operations)) {
        return Promise.all(operations);
      }
      if (typeof operations === 'function') {
        return operations(prisma as PrismaService);
      }
      return operations;
    }),
  };
  return prisma as unknown as PrismaService;
};

describe('WoltSyncService tenant resolution', () => {
  let prisma: PrismaService;
  let redisClient: { get: jest.Mock; set: jest.Mock };
  let redis: RedisService;
  let api: WoltApiService;
  let preorders: PreordersService;
  let realtime: PosRealtimeGateway;
  let config: ConfigService;
  let service: WoltSyncService;

  beforeEach(() => {
    prisma = createPrismaMock();
    redisClient = { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue(undefined) };
    redis = { getClient: () => redisClient } as unknown as RedisService;
    api = {
      fetchProducts: jest.fn().mockResolvedValue([]),
      fetchOrders: jest.fn().mockResolvedValue([]),
      getToken: jest.fn().mockReturnValue('token-123'),
    } as unknown as WoltApiService;
    preorders = { upsertFromWolt: jest.fn().mockResolvedValue(undefined) } as unknown as PreordersService;
    realtime = { broadcast: jest.fn() } as unknown as PosRealtimeGateway;
    config = { get: jest.fn((key: string) => (key === 'WOLT_API_TENANT_MAPPING' ? JSON.stringify({ 'token-123': 'tenant-42' }) : undefined)) } as unknown as ConfigService;
    service = new WoltSyncService(prisma, redis, api, preorders, realtime, config);
  });

  it('assigns the resolved tenant to synced products', async () => {
    (api.fetchProducts as jest.Mock).mockResolvedValueOnce([
      { id: 'prod-1', name: 'Pizza', price: 10, raw: {} },
    ]);

    await service.syncProducts();

    expect((prisma.woltProduct as any).upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ tenantId: 'tenant-42' }),
        create: expect.objectContaining({ tenantId: 'tenant-42' }),
      }),
    );
  });

  it('propagates the tenant to orders and preorders', async () => {
    const order = {
      id: 'order-1',
      status: 'received',
      statusText: 'Received',
      customer: { name: 'Mila' },
      pickupTime: new Date().toISOString(),
      items: [{ id: 'item-1', name: 'Burger', quantity: 1, price: 12 }],
      raw: {},
    };
    (api.fetchOrders as jest.Mock).mockResolvedValueOnce([order]);

    await service.syncOrders();

    expect((prisma.woltOrder as any).upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ tenantId: 'tenant-42' }),
        create: expect.objectContaining({ tenantId: 'tenant-42' }),
      }),
    );
    expect(preorders.upsertFromWolt).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tenant-42' }));
  });
});
