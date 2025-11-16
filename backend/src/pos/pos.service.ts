import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Sale as SaleModel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { SyncCartDto } from './dto/sync-cart.dto';
import { EmailReceiptDto } from './dto/email-receipt.dto';
import { PosHardwareService } from '../hardware/pos-hardware.service';
import { MailerService } from '../mailer/mailer.service';
import { renderReceiptEmail } from '../mailer/templates/receipt-email.template';
import type { FiscalMetadataPayload, SalePayload } from './types/sale-payload';
import { FiscalizationService } from '../fiscal/fiscalization.service';
import { PreordersService } from '../preorders/preorders.service';
import { PosRealtimeGateway } from '../realtime/realtime.gateway';

const LATEST_SALE_TTL_SECONDS = 60 * 5;
const CART_TTL_SECONDS = 60 * 60;

/**
 * Service for handling Point of Sale (POS) operations.
 *
 * This service is responsible for processing payments, managing shopping carts,
 * sending receipts, and interacting with various other services like hardware,
 * fiscalization, and real-time updates.
 */
@Injectable()
export class PosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly hardware: PosHardwareService,
    private readonly mailer: MailerService,
    private readonly fiscalization: FiscalizationService,
    private readonly preorders: PreordersService,
    private readonly realtime: PosRealtimeGateway,
  ) {}

  /**
   * Synchronizes the state of a shopping cart with the server.
   * The cart data is cached in Redis.
   *
   * @param dto - The data transfer object containing the cart state.
   * @returns A confirmation message and the synchronized cart data.
   */
  async syncCart(dto: SyncCartDto) {
    const payload = {
      ...dto,
      updatedAt: new Date().toISOString(),
    };

    await this.redis.setJson(`pos:cart:${dto.terminalId}`, payload, CART_TTL_SECONDS);

    return {
      message: 'Cart synchronisiert',
      cart: payload,
    };
  }

  /**
   * Simulates a payment transaction without performing actual fiscalization or hardware interactions.
   * The simulated sale is temporarily cached in Redis.
   *
   * @param dto - The data transfer object for the payment.
   * @returns A confirmation message and the simulated sale payload.
   */
  async simulatePayment(dto: CreatePaymentDto) {
    const sale = await this.createSaleEntity(dto);
    const payload = await this.buildSalePayload(sale);
    await this.redis.setJson('pos:latest-sale', payload, LATEST_SALE_TTL_SECONDS);

    return {
      message: 'Payment simulated successfully',
      sale: payload,
    };
  }

  /**
   * Processes a complete payment transaction.
   * This includes fiscalization, creating a sale record, printing a receipt,
   * sending an email receipt (if applicable), and broadcasting real-time updates.
   *
   * @param dto - The data transfer object for the payment.
   * @returns A confirmation message and the completed sale payload.
   */
  async processPayment(dto: CreatePaymentDto) {
    try {
      const total = Number(this.calculateTotal(dto).toFixed(2));
      const receiptNo = this.generateReceiptNumber();

      const fiscalization = await this.fiscalization.registerReceipt(receiptNo, dto, total);

      const sale = await this.createSaleEntity(dto, {
        receiptNo,
        total,
        fiscalization,
      });

      const basePayload = this.toBaseSalePayload(sale);

      await this.hardware.printReceipt(basePayload);

      if (dto.customerEmail) {
        const { subject, html } = renderReceiptEmail(basePayload, { businessName: 'FuchsPOS' });
        await this.mailer.sendReceiptEmail(dto.customerEmail, subject, html);
      }

      if (dto.terminalId) {
        await this.clearCachedCart(dto.terminalId);
      }

      await this.preorders.handleSaleCompletion(sale, dto.reference ?? null);

      const payload = await this.buildSalePayload(sale);
      await this.redis.setJson('pos:latest-sale', payload, LATEST_SALE_TTL_SECONDS);
      this.realtime.broadcast('sale.completed', { sale: payload });
      this.realtime.broadcastQueueMetrics('payments', {
        pending: 0,
        lastReceipt: payload.receiptNo,
        lastTotal: payload.total,
      });

      return {
        message: 'Payment processed successfully',
        sale: payload,
      };
    } catch (error) {
      this.realtime.broadcastSystemError('payments', error);
      throw error;
    }
  }

  /**
   * Sends an email receipt for a previously completed sale.
   *
   * @param dto - The data transfer object containing the sale ID and recipient email.
   * @returns A confirmation message and the sale payload.
   */
  async sendReceiptEmail(dto: EmailReceiptDto) {
    const sale = await this.prisma.sale.findUnique({ where: { id: dto.saleId } });
    if (!sale) {
      throw new NotFoundException(`Sale ${dto.saleId} not found`);
    }

    const payload = await this.buildSalePayload(sale);
    const { subject, html } = renderReceiptEmail(payload, { businessName: 'FuchsPOS' });

    await this.mailer.sendReceiptEmail(dto.email, subject, html);

    return {
      message: 'Receipt email sent',
      sale: payload,
    };
  }

  /**
   * Lists all active pre-orders.
   * @returns A promise that resolves to an array of active pre-orders.
   */
  async listPreorders() {
    return this.preorders.listActivePreorders();
  }

  /**
   * Lists recent cash events.
   * @param limit - The maximum number of events to return.
   * @returns A promise that resolves to an array of cash events.
   */
  async listCashEvents(limit = 25) {
    return this.preorders.listRecentCashEvents(limit);
  }

  /**
   * Retrieves the most recent sale, either from cache or the database.
   * @returns A promise that resolves to the latest sale payload.
   */
  async getLatestSale() {
    const cached = await this.redis.getJson<SalePayload>('pos:latest-sale');
    if (cached) {
      return { sale: this.normaliseCachedSalePayload(cached) };
    }

    const sale = await this.prisma.sale.findFirst({ orderBy: { createdAt: 'desc' } });
    if (!sale) {
      throw new NotFoundException('No sales have been recorded yet.');
    }

    const payload = await this.buildSalePayload(sale);
    await this.redis.setJson('pos:latest-sale', payload, LATEST_SALE_TTL_SECONDS);

    return { sale: payload };
  }

  /**
   * Creates a new sale entity in the database.
   * @param dto - The payment data.
   * @param options - Optional parameters like receipt number, total, and fiscalization data.
   * @returns A promise that resolves to the created sale model.
   */
  private async createSaleEntity(
    dto: CreatePaymentDto,
    options?: { receiptNo?: string; total?: number; fiscalization?: FiscalMetadataPayload | undefined },
  ): Promise<SaleModel> {
    const total = options?.total ?? Number(this.calculateTotal(dto).toFixed(2));
    const receiptNo = options?.receiptNo ?? this.generateReceiptNumber();

    return this.prisma.sale.create({
      data: {
        receiptNo,
        paymentMethod: dto.paymentMethod,
        total,
        status: 'SUCCESS',
        items: dto.items as unknown as Prisma.InputJsonValue,
        reference: dto.reference ?? null,
        locationId: dto.locationId ?? null,
        fiscalMetadata: options?.fiscalization,
      },
    });
  }

  /**
   * Builds the full sale payload, including augmentations from the pre-orders service.
   * @param sale - The sale model from the database.
   * @returns A promise that resolves to the full sale payload.
   */
  private async buildSalePayload(sale: SaleModel): Promise<SalePayload> {
    const augmentation = await this.preorders.buildSaleAugmentation(sale.id);
    const base = this.toBaseSalePayload(sale);

    return {
      ...base,
      documents: augmentation.documents,
      cashEvents: augmentation.cashEvents,
      preorder: augmentation.preorder,
    };
  }

  /**
   * Converts a sale model from the database to a base SalePayload object.
   * @param sale - The sale model.
   * @returns The base sale payload.
   */
  private toBaseSalePayload(sale: SaleModel): SalePayload {
    const items = (sale.items as SalePayload['items']) ?? [];

    return {
      id: sale.id,
      receiptNo: sale.receiptNo,
      paymentMethod: sale.paymentMethod,
      total: typeof sale.total === 'number' ? sale.total : Number(sale.total),
      status: sale.status,
      createdAt: new Date(sale.createdAt),
      items,
      reference: sale.reference,
      locationId: sale.locationId,
      fiscalization: sale.fiscalMetadata
        ? (sale.fiscalMetadata as SalePayload['fiscalization'])
        : undefined,
    };
  }

  /**
   * Calculates the total amount for a given set of sale items.
   * @param dto - The payment data containing the items.
   * @returns The calculated total.
   */
  private calculateTotal(dto: CreatePaymentDto) {
    return dto.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  }

  /**
   * Generates a new receipt number.
   * @returns A unique receipt number string.
   */
  private generateReceiptNumber() {
    return `R-${Date.now()}`;
  }

  /**
   * Clears the cached shopping cart for a given terminal.
   * @param terminalId - The ID of the terminal.
   */
  private async clearCachedCart(terminalId: string) {
    await this.redis.getClient().del(`pos:cart:${terminalId}`);
  }

  /**
   * Normalises cached sale payloads that were serialized when stored.
   * Ensures dates are converted back into Date instances.
   *
   * @param payload - The cached payload retrieved from Redis.
   * @returns The normalised sale payload with proper date values.
   */
  private normaliseCachedSalePayload(payload: SalePayload): SalePayload {
    return {
      ...payload,
      createdAt: payload.createdAt instanceof Date ? payload.createdAt : new Date(payload.createdAt),
    };
  }
}
