import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import type { WoltOrder, WoltProduct } from './wolt.types';

@Injectable()
export class WoltApiService {
  private readonly logger = new Logger(WoltApiService.name);
  private readonly http?: AxiosInstance;

  constructor() {
    const baseURL = process.env.WOLT_API_BASE_URL;
    const token = process.env.WOLT_API_TOKEN;

    if (!baseURL || !token) {
      this.logger.warn('WOLT_API_BASE_URL oder WOLT_API_TOKEN nicht gesetzt. Synchronisation deaktiviert.');
      this.http = undefined;
      return;
    }

    this.http = axios.create({
      baseURL,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      timeout: 10_000,
    });
  }

  async fetchProducts(): Promise<WoltProduct[]> {
    if (!this.http) {
      return [];
    }

    try {
      const { data } = await this.http.get('/products');
      const products = this.extractArray(data, ['products', 'items']);
      return products.map(product => ({
        id: product.id ?? product.sku ?? product.externalId,
        name: product.name ?? product.title ?? 'Produkt',
        price: Number(product.price ?? product.unitPrice ?? 0),
        sku: product.sku ?? product.id ?? undefined,
        raw: product,
      }));
    } catch (error: any) {
      this.logger.error(`Wolt-Produkte konnten nicht synchronisiert werden: ${error?.message ?? error}`);
      return [];
    }
  }

  async fetchOrders(since?: Date): Promise<WoltOrder[]> {
    if (!this.http) {
      return [];
    }

    try {
      const params = since ? { since: since.toISOString() } : undefined;
      const { data } = await this.http.get('/orders', { params });
      const orders = this.extractArray(data, ['orders', 'items']);
      return orders.map(order => ({
        id: order.id ?? order.orderId ?? order.externalId,
        status: order.status ?? order.state ?? 'received',
        statusText: order.statusText ?? order.stateText ?? order.status_label,
        customer: order.customer ?? order.consumer ?? null,
        pickupTime: order.pickupTime ?? order.pickup_time ?? order.ready_at ?? null,
        items: this.extractArray(order.items ?? order.lines ?? [], []).map(item => ({
          id: item.id ?? item.sku ?? item.productId,
          name: item.name ?? item.title ?? 'Artikel',
          quantity: Number(item.quantity ?? item.qty ?? 1),
          price: item.price ? Number(item.price) : item.unitPrice ? Number(item.unitPrice) : undefined,
        })),
        raw: order,
      }));
    } catch (error: any) {
      this.logger.error(`Wolt-Bestellungen konnten nicht synchronisiert werden: ${error?.message ?? error}`);
      return [];
    }
  }

  private extractArray(payload: any, candidates: string[]): any[] {
    if (Array.isArray(payload)) {
      return payload;
    }

    for (const candidate of candidates) {
      const value = payload?.[candidate];
      if (Array.isArray(value)) {
        return value;
      }
    }

    return [];
  }
}
