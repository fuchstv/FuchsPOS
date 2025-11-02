import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import axios from 'axios';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { DatevExportDto } from './dto/datev-export.dto';

const DATEV_HEADER = [
  'Umsatz (ohne Soll/Haben-Kz)',
  'Soll/Haben-Kennzeichen',
  'WKZ Umsatz',
  'Konto',
  'Gegenkonto (ohne BU-Schlüssel)',
  'BU-Schlüssel',
  'Belegdatum',
  'Belegfeld 1',
  'Buchungstext',
];

@Injectable()
export class AccountingService {
  constructor(private readonly prisma: PrismaService) {}

  async generateDatevExport(dto: DatevExportDto, actorUserId?: number) {
    const where: Prisma.SaleWhereInput = {};
    if (dto.startDate || dto.endDate) {
      where.createdAt = {
        gte: dto.startDate ?? undefined,
        lte: dto.endDate ?? undefined,
      };
    }

    const sales = await this.prisma.sale.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        receiptNo: true,
        total: true,
        createdAt: true,
        paymentMethod: true,
        fiscalMetadata: true,
      },
    });

    const revenueAccount = dto.revenueAccount ?? '8400';
    const cashAccount = dto.cashAccount ?? '1000';
    const rows = [DATEV_HEADER];
    let totalAmount = 0;

    for (const sale of sales) {
      const amount = this.asNumber(sale.total);
      totalAmount += amount;
      rows.push([
        amount.toFixed(2),
        'S',
        'EUR',
        revenueAccount,
        cashAccount,
        this.resolveTaxKey(sale),
        this.formatDate(sale.createdAt),
        sale.receiptNo,
        `POS ${sale.paymentMethod}`,
      ]);
    }

    const content = rows.map((row) => row.join(';')).join('\n');
    const checksum = createHash('sha1').update(content).digest('hex');
    const fileName = `DATEV_${this.formatDate(new Date())}_${sales.length}.csv`;

    const exportLog = await this.prisma.datevExportLog.create({
      data: {
        fromDate: dto.startDate ?? new Date('1970-01-01'),
        toDate: dto.endDate ?? new Date(),
        documentCount: sales.length,
        totalAmount,
        formatVersion: 'EXTF-21',
        fileName,
        checksum,
        triggeredBy: actorUserId ?? null,
      },
    });

    if (dto.transferWebhookId) {
      await this.transferToWebhook(dto.transferWebhookId, {
        fileName,
        checksum,
        totalAmount,
        documentCount: sales.length,
        content,
        period: { from: exportLog.fromDate, to: exportLog.toDate },
      });
    }

    return {
      fileName,
      mimeType: 'text/csv',
      checksum,
      rows: sales.length,
      totalAmount: Number(totalAmount.toFixed(2)),
      content,
      logId: exportLog.id,
    };
  }

  private formatDate(date: Date) {
    const day = `${date.getUTCDate()}`.padStart(2, '0');
    const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
    const year = date.getUTCFullYear();
    return `${day}.${month}.${year}`;
  }

  private resolveTaxKey(sale: { fiscalMetadata: Prisma.JsonValue | null }): string {
    const meta = sale.fiscalMetadata as null | { taxRate?: number };
    if (!meta?.taxRate) {
      return ' '; // DATEV expects blank when unknown
    }
    if (meta.taxRate === 7) {
      return '81';
    }
    if (meta.taxRate === 0) {
      return '40';
    }
    return '19';
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

  private async transferToWebhook(webhookId: number, payload: unknown) {
    const webhook = await this.prisma.apiWebhook.findUnique({ where: { id: webhookId } });
    if (!webhook) {
      throw new NotFoundException(`Webhook ${webhookId} not found`);
    }

    if (!webhook.isActive) {
      return { delivered: false, reason: 'Webhook disabled' };
    }

    try {
      await axios.post(
        webhook.targetUrl,
        payload,
        webhook.secret
          ? {
              headers: {
                'X-FuchsPOS-Signature': createHash('sha256')
                  .update(webhook.secret + JSON.stringify(payload))
                  .digest('hex'),
              },
            }
          : undefined,
      );
      await this.prisma.apiWebhook.update({
        where: { id: webhookId },
        data: {
          lastTriggeredAt: new Date(),
          lastError: null,
        },
      });
      return { delivered: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      await this.prisma.apiWebhook.update({
        where: { id: webhookId },
        data: {
          lastTriggeredAt: new Date(),
          lastError: message,
        },
      });
      return { delivered: false, reason: message };
    }
  }
}
