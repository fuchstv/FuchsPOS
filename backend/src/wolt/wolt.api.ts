import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import type { WoltOrder, WoltProduct } from './wolt.types';

/**
 * Service for interacting with a Wolt-compatible API.
 *
 * This service handles the communication with an external API for fetching product and order data.
 * It is configured via environment variables and will be disabled if the required
 * variables (WOLT_API_BASE_URL, WOLT_API_TOKEN) are not set.
 */
@Injectable()
export class WoltApiService {
  private readonly logger = new Logger(WoltApiService.name);
  private readonly http?: AxiosInstance;
  private readonly token?: string;

  constructor() {
    const baseURL = process.env.WOLT_API_BASE_URL;
    const token = process.env.WOLT_API_TOKEN;

    if (!baseURL || !token) {
      this.logger.warn('WOLT_API_BASE_URL oder WOLT_API_TOKEN nicht gesetzt. Synchronisation deaktiviert.');
      this.http = undefined;
      return;
    }

    this.token = token;
    this.http = axios.create({
      baseURL,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      timeout: 10_000,
    });
  }

  /**
   * Fetches the product catalog from the Wolt API.
   * @returns A promise that resolves to an array of normalized Wolt products.
   */
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

  /**
   * Fetches recent orders from the Wolt API.
   * @param since - An optional date to fetch orders created or updated since this time.
   * @returns A promise that resolves to an array of normalized Wolt orders.
   */
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

  /**
   * Safely extracts an array from a payload, checking multiple possible keys.
   * @param payload - The object or array to extract from.
   * @param candidates - An array of possible keys that might contain the target array.
   * @returns The extracted array, or an empty array if not found.
   */
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

  /**
   * Returns the API token used for the current Wolt API instance.
   * This is used to resolve the associated tenant in multi-tenant setups.
   */
  getToken(): string | undefined {
    return this.token;
  }
}
