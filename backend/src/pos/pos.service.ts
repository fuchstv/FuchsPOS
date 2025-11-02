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

  async simulatePayment(dto: CreatePaymentDto) {
    const sale = await this.createSaleEntity(dto);
    const payload = await this.buildSalePayload(sale);
    await this.redis.setJson('pos:latest-sale', payload, LATEST_SALE_TTL_SECONDS);

    return {
      message: 'Payment simulated successfully',
      sale: payload,
    };
  }

  async processPayment(dto: CreatePaymentDto) {
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

    return {
      message: 'Payment processed successfully',
      sale: payload,
    };
  }

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

  async listPreorders() {
    return this.preorders.listActivePreorders();
  }

  async listCashEvents(limit = 25) {
    return this.preorders.listRecentCashEvents(limit);
  }

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
        fiscalMetadata: options?.fiscalization,
      },
    });
  }

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
      fiscalization: sale.fiscalMetadata
        ? (sale.fiscalMetadata as SalePayload['fiscalization'])
        : undefined,
    };
  }

  private calculateTotal(dto: CreatePaymentDto) {
    return dto.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  }

  private generateReceiptNumber() {
    return `R-${Date.now()}`;
  }

  private async clearCachedCart(terminalId: string) {
    await this.redis.getClient().del(`pos:cart:${terminalId}`);
  }
}
