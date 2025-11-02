import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { WoltApiService } from './wolt.api';
import { PreordersService } from '../preorders/preorders.service';
import { PosRealtimeGateway } from '../realtime/realtime.gateway';
import type { WoltOrder } from './wolt.types';

const LAST_ORDER_SYNC_KEY = 'wolt:last-orders-sync';

@Injectable()
export class WoltSyncService {
  private readonly logger = new Logger(WoltSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly api: WoltApiService,
    private readonly preorders: PreordersService,
    private readonly realtime: PosRealtimeGateway,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleProductSync() {
    try {
      await this.syncProducts();
    } catch (error: any) {
      this.logger.error(`Fehler bei der Wolt-Produkt-Synchronisation: ${error?.message ?? error}`);
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async handleOrderSync() {
    try {
      await this.syncOrders();
    } catch (error: any) {
      this.logger.error(`Fehler bei der Wolt-Bestell-Synchronisation: ${error?.message ?? error}`);
    }
  }

  async syncProducts() {
    const products = await this.api.fetchProducts();
    if (!products.length) {
      return;
    }

    const upserts = products.map(product =>
      this.prisma.woltProduct.upsert({
        where: { externalId: product.id },
        update: {
          name: product.name,
          price: new Prisma.Decimal(Number(product.price ?? 0).toFixed(2)),
          tenantId: null,
          rawPayload: (product.raw ?? product) as Prisma.InputJsonValue,
        },
        create: {
          externalId: product.id,
          name: product.name,
          price: new Prisma.Decimal(Number(product.price ?? 0).toFixed(2)),
          tenantId: null,
          rawPayload: (product.raw ?? product) as Prisma.InputJsonValue,
        },
      }),
    );

    await this.prisma.$transaction(upserts);
    this.logger.log(`Wolt-Produkte synchronisiert (${products.length} Einträge).`);
    this.realtime.broadcast('wolt.products.synced', {
      count: products.length,
      timestamp: new Date().toISOString(),
    });
  }

  async syncOrders() {
    const lastSyncIso = await this.redis.getClient().get(LAST_ORDER_SYNC_KEY);
    const lastSync = lastSyncIso ? new Date(lastSyncIso) : undefined;
    const orders = await this.api.fetchOrders(lastSync);

    if (!orders.length) {
      await this.redis.getClient().set(LAST_ORDER_SYNC_KEY, new Date().toISOString());
      return;
    }

    for (const order of orders) {
      await this.persistOrder(order);
      await this.preorders.upsertFromWolt({
        externalId: order.id,
        status: order.status,
        statusLabel: order.statusText,
        customerName: order.customer?.name ?? null,
        scheduledPickup: order.pickupTime ?? null,
        items: order.items.map(item => ({
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.price,
          sku: item.id,
        })),
        rawPayload: order.raw ?? order,
      });
    }

    this.logger.log(`Wolt-Bestellungen synchronisiert (${orders.length} Einträge).`);
    this.realtime.broadcast('wolt.orders.synced', {
      count: orders.length,
      timestamp: new Date().toISOString(),
    });
    await this.redis.getClient().set(LAST_ORDER_SYNC_KEY, new Date().toISOString());
  }

  private async persistOrder(order: WoltOrder) {
    await this.prisma.woltOrder.upsert({
      where: { externalId: order.id },
      update: {
        status: order.status,
        tenantId: null,
        rawPayload: (order.raw ?? order) as Prisma.InputJsonValue,
      },
      create: {
        externalId: order.id,
        status: order.status,
        tenantId: null,
        rawPayload: (order.raw ?? order) as Prisma.InputJsonValue,
      },
    });
  }
}
