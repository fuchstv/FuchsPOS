import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { WoltApiService } from './wolt.api';
import { PreordersService } from '../preorders/preorders.service';
import { PosRealtimeGateway } from '../realtime/realtime.gateway';
import type { WoltOrder } from './wolt.types';

const LAST_ORDER_SYNC_KEY = 'wolt:last-orders-sync';

@Injectable()
export class WoltSyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WoltSyncService.name);
  private productSyncInterval?: NodeJS.Timeout;
  private orderSyncInterval?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly api: WoltApiService,
    private readonly preorders: PreordersService,
    private readonly realtime: PosRealtimeGateway,
    private readonly config: ConfigService,
  ) {
    this.tenantMappings = this.parseTenantMappings();
    this.tenantId = this.resolveTenantId();
  }

  private readonly tenantMappings: Record<string, string>;
  private readonly tenantId?: string;

  onModuleInit() {
    this.productSyncInterval = this.startInterval(5 * 60 * 1000, () => this.runProductSync());
    this.orderSyncInterval = this.startInterval(60 * 1000, () => this.runOrderSync());
    void this.runProductSync();
    void this.runOrderSync();
  }

  onModuleDestroy() {
    if (this.productSyncInterval) {
      clearInterval(this.productSyncInterval);
      this.productSyncInterval = undefined;
    }
    if (this.orderSyncInterval) {
      clearInterval(this.orderSyncInterval);
      this.orderSyncInterval = undefined;
    }
  }

  private async runProductSync() {
    try {
      await this.syncProducts();
    } catch (error: any) {
      this.logger.error(`Fehler bei der Wolt-Produkt-Synchronisation: ${error?.message ?? error}`);
    }
  }

  private async runOrderSync() {
    try {
      await this.syncOrders();
    } catch (error: any) {
      this.logger.error(`Fehler bei der Wolt-Bestell-Synchronisation: ${error?.message ?? error}`);
    }
  }

  private startInterval(intervalMs: number, task: () => Promise<void>) {
    const timer = setInterval(() => {
      void task();
    }, intervalMs);
    if (typeof timer.unref === 'function') {
      timer.unref();
    }
    return timer;
  }

  async syncProducts() {
    const tenantId = this.tenantId ?? null;
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
          tenantId,
          rawPayload: (product.raw ?? product) as Prisma.InputJsonValue,
        },
        create: {
          externalId: product.id,
          name: product.name,
          price: new Prisma.Decimal(Number(product.price ?? 0).toFixed(2)),
          tenantId,
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
    const tenantId = this.tenantId ?? null;

    if (!orders.length) {
      await this.redis.getClient().set(LAST_ORDER_SYNC_KEY, new Date().toISOString());
      return;
    }

    for (const order of orders) {
      await this.persistOrder(order, tenantId);
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
        tenantId,
      });
    }

    this.logger.log(`Wolt-Bestellungen synchronisiert (${orders.length} Einträge).`);
    this.realtime.broadcast('wolt.orders.synced', {
      count: orders.length,
      timestamp: new Date().toISOString(),
    });
    await this.redis.getClient().set(LAST_ORDER_SYNC_KEY, new Date().toISOString());
  }

  private async persistOrder(order: WoltOrder, tenantId: string | null) {
    await this.prisma.woltOrder.upsert({
      where: { externalId: order.id },
      update: {
        status: order.status,
        tenantId,
        rawPayload: (order.raw ?? order) as Prisma.InputJsonValue,
      },
      create: {
        externalId: order.id,
        status: order.status,
        tenantId,
        rawPayload: (order.raw ?? order) as Prisma.InputJsonValue,
      },
    });
  }

  private resolveTenantId(): string | undefined {
    const explicitTenant =
      this.config.get<string>('WOLT_API_TENANT_ID') ?? this.config.get<string>('WOLT_TENANT_ID');
    if (explicitTenant) {
      return explicitTenant;
    }

    const token = this.api.getToken?.();
    if (!token) {
      return undefined;
    }

    return this.tenantMappings[token];
  }

  private parseTenantMappings(): Record<string, string> {
    const mappingConfig = this.config.get<string>('WOLT_API_TENANT_MAPPING');
    if (!mappingConfig) {
      return {};
    }

    try {
      const parsed = JSON.parse(mappingConfig);
      if (parsed && typeof parsed === 'object') {
        return Object.entries(parsed).reduce<Record<string, string>>((acc, [apiKey, tenant]) => {
          if (typeof apiKey === 'string' && typeof tenant === 'string' && apiKey && tenant) {
            acc[apiKey] = tenant;
          }
          return acc;
        }, {});
      }
      this.logger.warn('WOLT_API_TENANT_MAPPING ist kein gültiges JSON-Objekt.');
    } catch (error: any) {
      this.logger.warn(
        `WOLT_API_TENANT_MAPPING konnte nicht als JSON geparst werden (${error?.message ?? error}). Fallback auf String-Parsing.`,
      );
      return this.parseDelimitedTenantMapping(mappingConfig);
    }

    return {};
  }

  private parseDelimitedTenantMapping(value: string): Record<string, string> {
    return value
      .split(/[,;\n]/)
      .map(entry => entry.trim())
      .filter(Boolean)
      .reduce<Record<string, string>>((acc, entry) => {
        const [apiKey, tenant] = entry.split(':').map(part => part.trim());
        if (apiKey && tenant) {
          acc[apiKey] = tenant;
        } else {
          this.logger.warn(`Ungültiger Eintrag in WOLT_API_TENANT_MAPPING: ${entry}`);
        }
        return acc;
      }, {});
  }
}
