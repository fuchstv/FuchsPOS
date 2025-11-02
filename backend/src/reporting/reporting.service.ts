import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DateRangeQueryDto, DEFAULT_GRANULARITY, Granularity } from './dto/date-range.dto';
import { EmployeePerformanceQueryDto } from './dto/employee-performance.dto';
import { ExpiryReportQueryDto } from './dto/expiry-query.dto';

type PrimitiveSaleItem = {
  productId?: number;
  sku?: string;
  name?: string;
  category?: string;
  articleGroup?: string;
  unitPrice?: number;
  quantity?: number;
  employeeId?: string;
};

type AggregatedBucket = {
  period: string;
  total: number;
  transactions: number;
  paymentMethods: Record<string, { count: number; total: number }>;
};

@Injectable()
export class ReportingService {
  constructor(private readonly prisma: PrismaService) {}

  async getSalesSummary(query: DateRangeQueryDto) {
    const records = await this.prisma.sale.findMany({
      where: this.buildSaleDateFilter(query),
      select: {
        id: true,
        total: true,
        createdAt: true,
        paymentMethod: true,
        status: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const granularity = query.granularity ?? DEFAULT_GRANULARITY;
    const buckets = new Map<string, AggregatedBucket>();

    for (const record of records) {
      if (record.status !== 'SUCCESS') {
        continue;
      }

      const key = this.getPeriodKey(record.createdAt, granularity);
      const bucket = buckets.get(key) ?? {
        period: key,
        total: 0,
        transactions: 0,
        paymentMethods: {},
      };

      const total = this.asNumber(record.total);
      bucket.total += total;
      bucket.transactions += 1;
      const method = bucket.paymentMethods[record.paymentMethod] ?? { count: 0, total: 0 };
      method.count += 1;
      method.total += total;
      bucket.paymentMethods[record.paymentMethod] = method;
      buckets.set(key, bucket);
    }

    return Array.from(buckets.values()).sort((a, b) => a.period.localeCompare(b.period));
  }

  async getEmployeePerformance(query: EmployeePerformanceQueryDto) {
    const limit = query.limit ?? 10;
    const records = await this.prisma.sale.findMany({
      where: this.buildSaleDateFilter(query),
      select: {
        id: true,
        total: true,
        reference: true,
        items: true,
      },
    });

    const performance = new Map<string, { revenue: number; tickets: number; avgBasket: number }>();

    for (const record of records) {
      const employee = this.extractEmployeeFromSale(record);
      if (!employee) {
        continue;
      }

      const metrics = performance.get(employee) ?? { revenue: 0, tickets: 0, avgBasket: 0 };
      const total = this.asNumber(record.total);
      metrics.revenue += total;
      metrics.tickets += 1;
      performance.set(employee, metrics);
    }

    return Array.from(performance.entries())
      .map(([employeeId, metrics]) => ({
        employeeId,
        revenue: Number(metrics.revenue.toFixed(2)),
        tickets: metrics.tickets,
        avgBasket: Number((metrics.revenue / Math.max(metrics.tickets, 1)).toFixed(2)),
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, limit);
  }

  async getCategoryPerformance(query: DateRangeQueryDto) {
    const records = await this.prisma.sale.findMany({
      where: this.buildSaleDateFilter(query),
      select: {
        items: true,
        total: true,
      },
    });

    const categories = new Map<
      string,
      { revenue: number; units: number; items: number; shareOfRevenue: number }
    >();
    let grandTotal = 0;

    for (const record of records) {
      const total = this.asNumber(record.total);
      grandTotal += total;
      const items = this.normaliseSaleItems(record.items as PrimitiveSaleItem[] | null);
      for (const item of items) {
        const category = item.category ?? item.articleGroup ?? 'Unkategorisiert';
        const bucket = categories.get(category) ?? { revenue: 0, units: 0, items: 0, shareOfRevenue: 0 };
        const lineTotal = (item.unitPrice ?? 0) * (item.quantity ?? 0);
        bucket.revenue += lineTotal;
        bucket.units += item.quantity ?? 0;
        bucket.items += 1;
        categories.set(category, bucket);
      }
    }

    return Array.from(categories.entries())
      .map(([category, bucket]) => ({
        category,
        revenue: Number(bucket.revenue.toFixed(2)),
        units: Number(bucket.units.toFixed(3)),
        items: bucket.items,
        shareOfRevenue:
          grandTotal > 0 ? Number(((bucket.revenue / grandTotal) * 100).toFixed(2)) : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }

  async getExpiryOverview(query: ExpiryReportQueryDto) {
    const today = new Date();
    const horizonEnd = query.endDate ?? new Date(today.getTime() + 1000 * 60 * 60 * 24 * 30);
    const batches = await this.prisma.batch.findMany({
      where: {
        expirationDate: {
          not: null,
          gte: query.includeHealthy ? undefined : today,
          lte: horizonEnd,
        },
      },
      select: {
        id: true,
        lotNumber: true,
        quantity: true,
        expirationDate: true,
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
          },
        },
        storageLocation: {
          select: {
            id: true,
            code: true,
          },
        },
      },
      orderBy: { expirationDate: 'asc' },
    });

    return batches.map((batch) => {
      const daysRemaining = batch.expirationDate
        ? Math.ceil((batch.expirationDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
        : null;
      const status = daysRemaining === null
        ? 'UNKNOWN'
        : daysRemaining < 0
        ? 'EXPIRED'
        : daysRemaining <= 7
        ? 'CRITICAL'
        : daysRemaining <= 30
        ? 'WARNING'
        : 'HEALTHY';

      return {
        batchId: batch.id,
        lotNumber: batch.lotNumber,
        product: batch.product,
        storageLocation: batch.storageLocation,
        expirationDate: batch.expirationDate,
        quantity: Number(batch.quantity),
        daysRemaining,
        status,
      };
    });
  }

  async getDashboard(query: DateRangeQueryDto) {
    const [sales, employees, categories, expiry] = await Promise.all([
      this.getSalesSummary(query),
      this.getEmployeePerformance({ ...query, limit: 5 }),
      this.getCategoryPerformance(query),
      this.getExpiryOverview({ ...query, includeHealthy: false }),
    ]);

    return {
      sales,
      employees,
      categories,
      expiry,
    };
  }

  private buildSaleDateFilter(query: DateRangeQueryDto): Prisma.SaleWhereInput {
    if (!query.startDate && !query.endDate) {
      return {};
    }
    return {
      createdAt: {
        gte: query.startDate,
        lte: query.endDate,
      },
    };
  }

  private getPeriodKey(date: Date, granularity: Granularity) {
    const year = date.getUTCFullYear();
    const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
    const day = `${date.getUTCDate()}`.padStart(2, '0');

    switch (granularity) {
      case 'day':
        return `${year}-${month}-${day}`;
      case 'week': {
        const firstDayOfYear = new Date(Date.UTC(year, 0, 1));
        const pastDaysOfYear =
          (date.getTime() - firstDayOfYear.getTime()) / (24 * 60 * 60 * 1000);
        const week = Math.ceil((pastDaysOfYear + firstDayOfYear.getUTCDay() + 1) / 7);
        return `${year}-W${`${week}`.padStart(2, '0')}`;
      }
      case 'month':
        return `${year}-${month}`;
      case 'quarter': {
        const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
        return `${year}-Q${quarter}`;
      }
      case 'year':
        return `${year}`;
      default:
        return `${year}-${month}-${day}`;
    }
  }

  private asNumber(value: Prisma.Decimal | number | bigint | null): number {
    if (value === null) {
      return 0;
    }
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'bigint') {
      return Number(value);
    }
    if (typeof (value as Prisma.Decimal).toNumber === 'function') {
      return (value as Prisma.Decimal).toNumber();
    }
    return Number(value);
  }

  private normaliseSaleItems(items: PrimitiveSaleItem[] | null): PrimitiveSaleItem[] {
    if (!items?.length) {
      return [];
    }
    return items
      .map((item) => ({
        ...item,
        unitPrice: typeof item.unitPrice === 'number' ? item.unitPrice : Number(item.unitPrice ?? 0),
        quantity: typeof item.quantity === 'number' ? item.quantity : Number(item.quantity ?? 0),
      }))
      .filter((item) => Number.isFinite(item.unitPrice ?? 0) && Number.isFinite(item.quantity ?? 0));
  }

  private extractEmployeeFromSale(
    sale: { reference: string | null; items: Prisma.JsonValue },
  ): string | null {
    if (sale.reference) {
      return sale.reference;
    }

    const items = this.normaliseSaleItems(sale.items as PrimitiveSaleItem[] | null);
    const candidate = items.find((item) => item.employeeId);
    return candidate?.employeeId ?? null;
  }
}
