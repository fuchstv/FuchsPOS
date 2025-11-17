import { Injectable } from '@nestjs/common';
import { CashClosing, CashClosingType, CashEventType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type PaymentMethodSummary = { total: number; count: number };

type CashAdjustmentSummary = {
  deposits: number;
  withdrawals: number;
  net: number;
};

type CashClosingSummary = {
  totalGross: number;
  saleCount: number;
  paymentMethods: Record<string, PaymentMethodSummary>;
  cashAdjustments: CashAdjustmentSummary;
};

const FINALIZED_SALE_STATUSES: Prisma.SaleStatus[] = ['SUCCESS', 'REFUND', 'REFUNDED'];

export type CashClosingPayload = {
  id: number;
  type: CashClosingType;
  fromDate: Date;
  toDate: Date;
  createdAt: Date;
  saleCount: number;
  totalGross: number;
  paymentMethods: Record<string, PaymentMethodSummary>;
  cashAdjustments: CashAdjustmentSummary;
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

    const [sales, adjustments] = await Promise.all([
      this.prisma.sale.findMany({
        where: {
          status: { in: FINALIZED_SALE_STATUSES },
          createdAt: {
            gt: fromDate,
            lte: toDate,
          },
        },
        select: {
          total: true,
          paymentMethod: true,
        },
      }),
      this.prisma.cashEvent.findMany({
        where: {
          type: { in: [CashEventType.CASH_DEPOSIT, CashEventType.CASH_WITHDRAWAL] },
          createdAt: {
            gt: fromDate,
            lte: toDate,
          },
        },
        select: { type: true, metadata: true },
      }),
    ]);

    const summary = this.buildSummary(sales, adjustments);

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
    adjustments: Array<{ type: CashEventType; metadata: Prisma.JsonValue | null }>,
  ): CashClosingSummary {
    const summary: CashClosingSummary = {
      totalGross: 0,
      saleCount: sales.length,
      paymentMethods: {},
      cashAdjustments: { deposits: 0, withdrawals: 0, net: 0 },
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
    summary.cashAdjustments = this.computeAdjustments(adjustments);

    if (summary.cashAdjustments.net !== 0) {
      const cashBucket = summary.paymentMethods['CASH'] ?? { total: 0, count: 0 };
      cashBucket.total = Number((cashBucket.total + summary.cashAdjustments.net).toFixed(2));
      summary.paymentMethods['CASH'] = cashBucket;
    }

    return summary;
  }

  private computeAdjustments(
    adjustments: Array<{ type: CashEventType; metadata: Prisma.JsonValue | null }>,
  ): CashAdjustmentSummary {
    const result: CashAdjustmentSummary = { deposits: 0, withdrawals: 0, net: 0 };

    for (const adjustment of adjustments) {
      const amount = this.extractAmount(adjustment.metadata);
      if (!amount) {
        continue;
      }
      if (adjustment.type === CashEventType.CASH_DEPOSIT) {
        result.deposits = Number((result.deposits + amount).toFixed(2));
      }
      if (adjustment.type === CashEventType.CASH_WITHDRAWAL) {
        result.withdrawals = Number((result.withdrawals + amount).toFixed(2));
      }
    }

    result.net = Number((result.deposits - result.withdrawals).toFixed(2));
    return result;
  }

  private extractAmount(metadata: Prisma.JsonValue | null): number {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return 0;
    }
    const value = (metadata as Record<string, unknown>).amount;
    const numeric = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
  }

  private asNumber(value: Prisma.Decimal | number) {
    return typeof value === 'number' ? value : Number(value);
  }

  private mapRecord(record: CashClosing): CashClosingPayload {
    const summary = (record.summary as CashClosingSummary | null) ?? {
      totalGross: 0,
      saleCount: 0,
      paymentMethods: {},
      cashAdjustments: { deposits: 0, withdrawals: 0, net: 0 },
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
      cashAdjustments: summary.cashAdjustments,
    };
  }
}
