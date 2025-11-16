import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma, Sale } from '@prisma/client';
import axios from 'axios';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCsvPresetDto, CsvColumnDefinitionDto } from './dto/create-csv-preset.dto';
import { CsvExportRequestDto } from './dto/csv-export-request.dto';
import { CreateWebhookDto } from './dto/create-webhook.dto';
import { TriggerWebhookDto } from './dto/trigger-webhook.dto';

const OPENGTINDB_ENDPOINT = 'https://opengtindb.org/api.php';
const DEFAULT_QUERY_ID = process.env.OPENGTINDB_QUERY_ID ?? '400000000';

type OpenGtinRecord = Record<string, string | null>;

export type EanLookupStatus = 'FOUND' | 'NOT_FOUND' | 'ERROR';

export type EanLookupResult = {
  ean: string;
  status: EanLookupStatus;
  name?: string | null;
  brand?: string | null;
  description?: string | null;
  mainCategory?: string | null;
  subCategory?: string | null;
  message?: string | null;
  raw: OpenGtinRecord;
};

/**
 * Service for handling integrations like CSV exports and webhooks.
 */
@Injectable()
export class IntegrationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lists all CSV export presets.
   * @returns A promise that resolves to a list of CSV export presets.
   */
  async listCsvPresets() {
    return this.prisma.csvExportPreset.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Creates a new CSV export preset.
   * @param dto - The data for creating the preset.
   * @param ownerId - The ID of the user who owns the preset.
   * @returns A promise that resolves to the newly created preset.
   */
  async createCsvPreset(dto: CreateCsvPresetDto, ownerId?: number) {
    return this.prisma.csvExportPreset.create({
      data: {
        name: dto.name,
        description: dto.description,
        tenantId: dto.tenantId,
        delimiter: dto.delimiter ?? ',',
        columns: dto.columns as unknown as Prisma.InputJsonValue,
        ownerId: ownerId ?? null,
      },
    });
  }

  /**
   * Generates a CSV export of sales data.
   * @param dto - The request data for the CSV export.
   * @returns A promise that resolves to an object containing the CSV file content and metadata.
   */
  async generateCsvExport(dto: CsvExportRequestDto) {
    const preset = dto.presetId
      ? await this.prisma.csvExportPreset.findUnique({ where: { id: dto.presetId } })
      : null;
    if (dto.presetId && !preset) {
      throw new NotFoundException(`CSV preset ${dto.presetId} not found`);
    }

    const columns = dto.columns?.length
      ? dto.columns
      : ((preset?.columns as unknown as CsvColumnDefinitionDto[]) ?? []);
    if (!columns?.length) {
      throw new Error('No column definition provided');
    }

    const delimiter = dto.delimiter ?? preset?.delimiter ?? ';';
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
        status: true,
        items: true,
        reference: true,
      },
    });

    const header = columns.map((column) => column.header);
    const rows = [header.join(delimiter)];

    for (const sale of sales) {
      const items = this.normaliseItems(sale);
      if (!items.length) {
        rows.push(this.buildRow(columns, delimiter, sale, null));
        continue;
      }
      for (const item of items) {
        rows.push(this.buildRow(columns, delimiter, sale, item));
      }
    }

    return {
      presetId: preset?.id ?? null,
      fileName: `POS_EXPORT_${Date.now()}.csv`,
      mimeType: 'text/csv',
      rows: rows.length - 1,
      content: rows.join('\n'),
    };
  }

  /**
   * Lists all API webhooks.
   * @returns A promise that resolves to a list of webhooks.
   */
  async listWebhooks() {
    return this.prisma.apiWebhook.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Creates a new API webhook.
   * @param dto - The data for creating the webhook.
   * @returns A promise that resolves to the newly created webhook.
   */
  async createWebhook(dto: CreateWebhookDto) {
    return this.prisma.apiWebhook.create({
      data: {
        event: dto.event,
        targetUrl: dto.targetUrl,
        secret: dto.secret,
        tenantId: dto.tenantId,
      },
    });
  }

  /**
   * Triggers a webhook for testing purposes.
   * @param dto - The data for triggering the webhook.
   * @returns A promise that resolves to an object indicating the delivery status.
   */
  async triggerWebhook(dto: TriggerWebhookDto) {
    const webhook = await this.prisma.apiWebhook.findUnique({ where: { id: dto.webhookId } });
    if (!webhook) {
      throw new NotFoundException(`Webhook ${dto.webhookId} not found`);
    }
    if (!webhook.isActive) {
      throw new Error('Webhook is inactive');
    }

    const payload = {
      event: dto.sampleEvent ?? webhook.event,
      timestamp: new Date().toISOString(),
      sample: true,
      data: {
        message: 'FuchsPOS webhook connectivity test',
      },
    };

    const headers = webhook.secret
      ? {
          'X-FuchsPOS-Signature': createHash('sha256')
            .update(webhook.secret + JSON.stringify(payload))
            .digest('hex'),
        }
      : undefined;

    const response = await axios.post(webhook.targetUrl, payload, headers ? { headers } : undefined);
    await this.prisma.apiWebhook.update({
      where: { id: dto.webhookId },
      data: {
        lastTriggeredAt: new Date(),
        lastError: null,
      },
    });

    return {
      delivered: true,
      status: response.status,
    };
  }

  /**
   * Looks up product metadata in the OpenGTIN/EAN database.
   * @param ean - The barcode to look up.
   */
  async lookupEan(ean: string): Promise<EanLookupResult> {
    const sanitized = ean?.replace(/[^0-9]/g, '');
    if (!sanitized) {
      throw new BadRequestException('EAN darf nicht leer sein.');
    }
    if (sanitized.length < 8 || sanitized.length > 14) {
      throw new BadRequestException('Ungültige EAN-Länge.');
    }

    let payload = '';
    try {
      const { data } = await axios.get<string>(OPENGTINDB_ENDPOINT, {
        params: {
          cmd: 'ean',
          ean: sanitized,
          queryid: DEFAULT_QUERY_ID,
        },
        responseType: 'text',
        timeout: 5000,
      });
      payload = typeof data === 'string' ? data : String(data ?? '');
    } catch (error) {
      const message =
        axios.isAxiosError(error) && error.response?.status === 404
          ? 'EAN-Datensatz wurde nicht gefunden.'
          : 'EAN-Datenbank ist derzeit nicht erreichbar.';
      throw new ServiceUnavailableException(message);
    }

    if (!payload.trim()) {
      return {
        ean: sanitized,
        status: 'ERROR',
        message: 'EAN-Datenbank hat keine Daten zurückgegeben.',
        raw: {},
      };
    }

    const { record, rawText } = this.parseOpenGtinResponse(payload);
    return this.buildLookupResult(record, sanitized, rawText);
  }

  /**
   * Normalizes the 'items' property of a sale, ensuring it's always an array.
   * @param sale - The sale object.
   * @returns An array of sale items.
   */
  private normaliseItems(sale: { items: Prisma.JsonValue }): Array<Record<string, unknown>> {
    const items = sale.items as Array<Record<string, unknown>> | null;
    return Array.isArray(items) ? items : [];
  }

  private parseOpenGtinResponse(payload: string): { record: OpenGtinRecord; rawText: string } {
    const record: OpenGtinRecord = {};
    payload
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .forEach(line => {
        const [key, ...valueParts] = line.split('=');
        if (!key) {
          return;
        }
        const value = valueParts.length ? valueParts.join('=').trim() : null;
        record[key.toLowerCase()] = value && value.length ? value : null;
      });

    return { record, rawText: payload.trim() };
  }

  private buildLookupResult(
    record: OpenGtinRecord,
    fallbackEan: string,
    rawText: string,
  ): EanLookupResult {
    const errorCode = record.error ?? record.result ?? null;
    let status: EanLookupStatus = 'ERROR';
    if (errorCode === '0') {
      status = 'FOUND';
    } else if (errorCode === '1') {
      status = 'NOT_FOUND';
    }

    const raw: OpenGtinRecord = { ...record };
    const hasStructuredPayload = Object.keys(record).length > 0;
    const baseMessage = record.error_text ?? record.result_text ?? null;
    const message =
      baseMessage ??
      (status === 'NOT_FOUND'
        ? 'EAN nicht gefunden.'
        : hasStructuredPayload
          ? null
          : 'Antwort der EAN-Datenbank konnte nicht interpretiert werden.');

    return {
      ean: record.ean ?? fallbackEan,
      status,
      name: record.name ?? record.productname ?? null,
      brand: record.brand ?? record.vendor ?? record.manufacturer ?? null,
      description: record.description ?? record.text ?? null,
      mainCategory: record.maincat ?? record.category ?? null,
      subCategory: record.subcat ?? record.subcategory ?? null,
      message,
      raw: hasStructuredPayload ? raw : { raw: rawText },
    };
  }

  /**
   * Builds a single CSV row based on the column definitions.
   * @param columns - The column definitions.
   * @param delimiter - The CSV delimiter.
   * @param sale - The sale data.
   * @param item - The item data (if applicable).
   * @returns The formatted CSV row as a string.
   */
  private buildRow(
    columns: CsvColumnDefinitionDto[],
    delimiter: string,
    sale: Pick<Sale, 'receiptNo' | 'total' | 'paymentMethod' | 'createdAt' | 'status' | 'items' | 'reference'>,
    item: Record<string, unknown> | null,
  ) {
    const values = columns.map((column) => {
      const raw = this.resolvePath(column.path, sale, item);
      if (raw === undefined || raw === null) {
        return '';
      }
      if (raw instanceof Date) {
        return raw.toISOString();
      }
      if (typeof raw === 'number') {
        return raw.toString();
      }
      return String(raw);
    });
    return values.map((value) => this.escapeCsv(value, delimiter)).join(delimiter);
  }

  /**
   * Resolves a value from a sale or item object using a path string.
   * @param path - The path to the value (e.g., 'sale.total', 'item.name').
   * @param sale - The sale object.
   * @param item - The item object.
   * @returns The resolved value, or undefined if not found.
   */
  private resolvePath(
    path: string,
    sale: Pick<Sale, 'receiptNo' | 'total' | 'paymentMethod' | 'createdAt' | 'status' | 'items' | 'reference'>,
    item: Record<string, unknown> | null,
  ) {
    if (path.startsWith('sale.')) {
      return this.walkPath(path.replace(/^sale\./, ''), sale as unknown as Record<string, unknown>);
    }
    if (path.startsWith('item.') && item) {
      return this.walkPath(path.replace(/^item\./, ''), item);
    }
    if (path === 'sale.total') {
      return this.asNumber(sale.total as unknown as Prisma.Decimal);
    }
    return undefined;
  }

  /**
   * Traverses an object using a dot-separated path string.
   * @param path - The path to the value.
   * @param target - The object to traverse.
   * @returns The resolved value, or undefined if not found.
   */
  private walkPath(path: string, target: Record<string, unknown>) {
    return path.split('.').reduce<unknown>((value, key) => {
      if (value && typeof value === 'object' && key in (value as Record<string, unknown>)) {
        return (value as Record<string, unknown>)[key];
      }
      return undefined;
    }, target);
  }

  /**
   * Escapes a string for use in a CSV file.
   * @param value - The string to escape.
   * @param delimiter - The CSV delimiter.
   * @returns The escaped string.
   */
  private escapeCsv(value: string, delimiter: string) {
    if (value.includes(delimiter) || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  /**
   * Converts a Prisma.Decimal, number, or string to a number.
   * @param value The value to convert.
   * @returns The converted number.
   */
  private asNumber(value: Prisma.Decimal | number | string) {
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'string') {
      return Number(value);
    }
    return value.toNumber();
  }
}
