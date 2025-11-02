import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { SyncCartDto } from './dto/sync-cart.dto';
import { EmailReceiptDto } from './dto/email-receipt.dto';
import { PosHardwareService } from '../hardware/pos-hardware.service';
import { MailerService } from '../mailer/mailer.service';
import { renderReceiptEmail } from '../mailer/templates/receipt-email.template';
import type { SalePayload } from './types/sale-payload';

const LATEST_SALE_TTL_SECONDS = 60 * 5;
const CART_TTL_SECONDS = 60 * 60;

@Injectable()
export class PosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly hardware: PosHardwareService,
    private readonly mailer: MailerService,
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
    const sale = await this.createSaleRecord(dto);

    return {
      message: 'Payment simulated successfully',
      sale,
    };
  }

  async processPayment(dto: CreatePaymentDto) {
    const sale = await this.createSaleRecord(dto);

    await this.hardware.printReceipt(sale);

    if (dto.customerEmail) {
      const { subject, html } = renderReceiptEmail(sale, { businessName: 'FuchsPOS' });
      await this.mailer.sendReceiptEmail(dto.customerEmail, subject, html);
    }

    if (dto.terminalId) {
      await this.clearCachedCart(dto.terminalId);
    }

    return {
      message: 'Payment processed successfully',
      sale,
    };
  }

  async sendReceiptEmail(dto: EmailReceiptDto) {
    const sale = await this.prisma.sale.findUnique({ where: { id: dto.saleId } });
    if (!sale) {
      throw new NotFoundException(`Sale ${dto.saleId} not found`);
    }

    const payload = this.toPayload(sale);
    const { subject, html } = renderReceiptEmail(payload, { businessName: 'FuchsPOS' });

    await this.mailer.sendReceiptEmail(dto.email, subject, html);

    return {
      message: 'Receipt email sent',
      sale: payload,
    };
  }

  private async createSaleRecord(dto: CreatePaymentDto): Promise<SalePayload> {
    const total = Number(this.calculateTotal(dto).toFixed(2));

    const sale = await this.prisma.sale.create({
      data: {
        receiptNo: `R-${Date.now()}`,
        paymentMethod: dto.paymentMethod,
        total,
        status: 'SUCCESS',
        items: dto.items,
        reference: dto.reference ?? null,
      },
    });

    const payload = this.toPayload(sale);

    await this.redis.setJson('pos:latest-sale', payload, LATEST_SALE_TTL_SECONDS);

    return payload;
  }

  private toPayload(sale: any): SalePayload {
    return {
      id: sale.id,
      receiptNo: sale.receiptNo,
      paymentMethod: sale.paymentMethod,
      total: typeof sale.total === 'number' ? sale.total : Number(sale.total),
      status: sale.status,
      createdAt: new Date(sale.createdAt),
      items: (sale.items as SalePayload['items']) ?? [],
      reference: sale.reference,
    };
  }

  private calculateTotal(dto: CreatePaymentDto) {
    return dto.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  }

  private async clearCachedCart(terminalId: string) {
    await this.redis.getClient().del(`pos:cart:${terminalId}`);
  }
}
