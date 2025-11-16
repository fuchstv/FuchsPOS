import { Injectable } from '@nestjs/common';
import { CashClosing, CashClosingType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type PaymentMethodSummary = { total: number; count: number };

type CashClosingSummary = {
  totalGross: number;
  saleCount: number;
  paymentMethods: Record<string, PaymentMethodSummary>;
};

export type CashClosingPayload = {
  id: number;
  type: CashClosingType;
  fromDate: Date;
  toDate: Date;
  createdAt: Date;
  saleCount: number;
  totalGross: number;
  paymentMethods: Record<string, PaymentMethodSummary>;
};

@Injectable()
export class CashClosingService {
  constructor(private readonly prisma: PrismaService) {}

  async listClosings(limit = 10): Promise<CashClosingPayload[]> {
    const records = await this.prisma.cashClosing.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return records.map(record => this.mapRecord(record));
  }

  async createClosing(type: CashClosingType): Promise<CashClosingPayload> {
    const toDate = new Date();
    const fromDate = await this.resolveFromDate(toDate);

    const sales = await this.prisma.sale.findMany({
      where: {
        status: 'SUCCESS',
        createdAt: {
          gt: fromDate,
          lte: toDate,
        },
      },
      select: {
        total: true,
        paymentMethod: true,
      },
    });

    const summary = this.buildSummary(sales);

    const record = await this.prisma.cashClosing.create({
      data: {
        type,
        fromDate,
        toDate,
        summary: summary as Prisma.InputJsonValue,
      },
    });

    return this.mapRecord(record);
  }

  private async resolveFromDate(now: Date): Promise<Date> {
    const lastZClosing = await this.prisma.cashClosing.findFirst({
      where: { type: 'Z' },
      orderBy: { toDate: 'desc' },
      select: { toDate: true },
    });

    if (lastZClosing?.toDate) {
      return lastZClosing.toDate;
    }

    const earliestSale = await this.prisma.sale.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    });

    if (earliestSale?.createdAt) {
      return earliestSale.createdAt;
    }

    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    return startOfDay;
  }

  private buildSummary(
    sales: Array<{ total: Prisma.Decimal | number; paymentMethod: string }>,
  ): CashClosingSummary {
    const summary: CashClosingSummary = {
      totalGross: 0,
      saleCount: sales.length,
      paymentMethods: {},
    };

    let runningTotal = 0;

    for (const sale of sales) {
      const amount = this.asNumber(sale.total);
      runningTotal += amount;
      const bucket = summary.paymentMethods[sale.paymentMethod] ?? { total: 0, count: 0 };
      bucket.total = Number((bucket.total + amount).toFixed(2));
      bucket.count += 1;
      summary.paymentMethods[sale.paymentMethod] = bucket;
    }

    summary.totalGross = Number(runningTotal.toFixed(2));

    return summary;
  }

  private asNumber(value: Prisma.Decimal | number) {
    return typeof value === 'number' ? value : Number(value);
  }

  private mapRecord(record: CashClosing): CashClosingPayload {
    const summary = (record.summary as CashClosingSummary | null) ?? {
      totalGross: 0,
      saleCount: 0,
      paymentMethods: {},
    };

    return {
      id: record.id,
      type: record.type,
      fromDate: record.fromDate,
      toDate: record.toDate,
      createdAt: record.createdAt,
      saleCount: summary.saleCount,
      totalGross: summary.totalGross,
      paymentMethods: summary.paymentMethods,
    };
  }
}
