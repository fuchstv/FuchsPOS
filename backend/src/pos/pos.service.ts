import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CreatePaymentDto } from './dto/create-payment.dto';

type SalePayload = {
  id: number;
  receiptNo: string;
  paymentMethod: string;
  total: number;
  status: string;
  createdAt: Date;
  items: Array<{
    name: string;
    unitPrice: number;
    quantity: number;
  }>;
  reference?: string | null;
};

@Injectable()
export class PosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async simulatePayment(dto: CreatePaymentDto) {
    const total = dto.items.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0,
    );

    const sale = await this.prisma.sale.create({
      data: {
        receiptNo: `R-${Date.now()}`,
        paymentMethod: dto.paymentMethod,
        total: new Prisma.Decimal(total.toFixed(2)),
        status: 'SUCCESS',
        items: dto.items,
        reference: dto.reference ?? null,
      },
    });

    const payload: SalePayload = {
      id: sale.id,
      receiptNo: sale.receiptNo,
      paymentMethod: sale.paymentMethod,
      total: sale.total.toNumber(),
      status: sale.status,
      createdAt: sale.createdAt,
      items: (sale.items as unknown as SalePayload['items']) ?? [],
      reference: sale.reference,
    };

    await this.redis.setJson('pos:latest-sale', payload, 60 * 5);

    return {
      message: 'Payment simulated successfully',
      sale: payload,
    };
  }
}
