import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  Prisma,
  ReportExport,
  ReportExportFormat,
  ReportExportStatus,
  ReportExportType,
} from '@prisma/client';
import { Cron, CronExpression } from '@nestjs/schedule';
import { createHash } from 'crypto';
import { Workbook } from 'exceljs';
import { MailerService } from '../mailer/mailer.service';
import { renderReportExportReadyEmail } from '../mailer/templates/report-export-ready.template';
import { PrismaService } from '../prisma/prisma.service';
import { ReportExportListQueryDto, ReportExportRequestDto } from './dto/report-export.dto';
import { Granularity } from './dto/date-range.dto';
import { ReportingService } from './reporting.service';

/**
 * Defines the filters for a report export.
 */
type ReportExportFilters = {
  startDate?: string;
  endDate?: string;
  granularity?: string;
  locationId?: string;
};

/**
 * Represents a dataset to be exported, including headers and rows.
 */
type Dataset = {
  name: string;
  headers: string[];
  rows: Record<string, string | number | null>[];
};

/**
 * Represents a summary of a report export, including its status and metadata.
 */
type ExportSummary = {
  id: number;
  type: ReportExportType;
  format: ReportExportFormat;
  status: ReportExportStatus;
  createdAt: Date;
  startedAt?: Date | null;
  completedAt?: Date | null;
  fileName?: string | null;
  mimeType?: string | null;
  downloadPath?: string | null;
  filters: ReportExportFilters;
  notificationEmail?: string | null;
  error?: string | null;
};

const TYPE_LABELS: Record<ReportExportType, string> = {
  SALES_SUMMARY: 'sales-summary',
  EMPLOYEE_PERFORMANCE: 'employee-performance',
  CATEGORY_PERFORMANCE: 'category-performance',
};

/**
 * Service for managing the creation, queuing, and processing of report exports.
 *
 * This service handles requests to export reports in various formats (CSV, Excel),
 * manages a queue of pending exports, and processes them asynchronously.
 */
@Injectable()
export class ReportExportService {
  private readonly logger = new Logger(ReportExportService.name);
  private hasLoggedMissingTable = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly reporting: ReportingService,
    private readonly mailer: MailerService,
  ) {}

  /**
   * Enqueues a new report export request.
   * If a similar export already exists, it may be reused or re-queued.
   * @param dto - The request data for the export.
   * @returns A promise that resolves to a summary of the enqueued export.
   */
  async enqueue(dto: ReportExportRequestDto): Promise<ExportSummary> {
    await this.ensureReportExportTableOrThrow();
    const filters = this.normaliseFilters(dto);
    const type = dto.type as ReportExportType;
    const format = dto.format as ReportExportFormat;

    const record = await this.ensureExport(type, format, filters, dto.notificationEmail);
    return this.toSummary(record);
  }

  /**
   * Lists existing report exports based on query filters.
   * @param query - The filtering criteria.
   * @returns A promise that resolves to an array of export summaries.
   */
  async listExports(query: ReportExportListQueryDto): Promise<ExportSummary[]> {
    if (!(await this.hasReportExportTable())) {
      return [];
    }
    const where: Prisma.ReportExportWhereInput = {};

    if (query.type) {
      where.type = query.type as ReportExportType;
    }
    if (query.format) {
      where.format = query.format as ReportExportFormat;
    }
    if (query.locationId) {
      where.locationId = query.locationId;
    }
    if (query.startDate || query.endDate) {
      where.createdAt = {
        gte: query.startDate ?? undefined,
        lte: query.endDate ?? undefined,
      };
    }

    const limit = query.limit && Number.isFinite(query.limit) ? Math.min(query.limit, 200) : 50;

    const exports = await this.prisma.reportExport.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return exports.map((record) => this.toSummary(record));
  }

  /**
   * Retrieves a single report export by its ID.
   * @param id - The ID of the export.
   * @returns A promise that resolves to the export record.
   * @throws NotFoundException if the export does not exist.
   */
  async getExportOrThrow(id: number) {
    await this.ensureReportExportTableOrThrow();
    const record = await this.prisma.reportExport.findUnique({ where: { id } });
    if (!record) {
      throw new NotFoundException(`Report export ${id} not found`);
    }
    return record;
  }

  /**
   * A scheduled job that enqueues daily exports for all report types and formats.
   * Runs every day at 3 AM.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async scheduleDailyExports() {
    if (!(await this.hasReportExportTable())) {
      return;
    }
    const now = new Date();
    const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const filters: ReportExportFilters = {
      startDate: start.toISOString(),
      endDate: now.toISOString(),
      granularity: 'day',
    };

    for (const type of Object.values(ReportExportType)) {
      for (const format of Object.values(ReportExportFormat)) {
        await this.ensureExport(type, format, filters);
      }
    }
  }

  /**
   * A scheduled job that triggers the processing of the export queue.
   * Runs every minute.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async processQueue() {
    await this.processPendingExports();
  }

  /**
   * Processes a batch of pending report exports from the queue.
   * @param limit - The maximum number of exports to process in this batch.
   */
  async processPendingExports(limit = 3) {
    if (!(await this.hasReportExportTable())) {
      return;
    }
    const pending = await this.prisma.reportExport.findMany({
      where: { status: ReportExportStatus.PENDING },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    for (const record of pending) {
      const updated = await this.prisma.reportExport.updateMany({
        where: { id: record.id, status: ReportExportStatus.PENDING },
        data: { status: ReportExportStatus.PROCESSING, startedAt: new Date(), error: null },
      });

      if (!updated.count) {
        continue;
      }

      try {
        await this.generateExport(record.id);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Export ${record.id} failed: ${message}`);
        await this.prisma.reportExport.update({
          where: { id: record.id },
          data: { status: ReportExportStatus.FAILED, error: message },
        });
      }
    }
  }

  /**
   * Ensures an export record exists, creating or updating it as needed.
   * This is used to avoid duplicate exports for the same parameters.
   * @param type - The type of report.
   * @param format - The export format.
   * @param filters - The report filters.
   * @param notificationEmail - The email address for notifications.
   * @returns A promise that resolves to the created or updated export record.
   */
  private async ensureExport(
    type: ReportExportType,
    format: ReportExportFormat,
    filters: ReportExportFilters,
    notificationEmail?: string,
  ) {
    const fingerprint = this.buildFingerprint(type, format, filters);

    const existing = await this.prisma.reportExport.findUnique({ where: { fingerprint } });
    if (existing) {
      if (existing.status === ReportExportStatus.FAILED) {
        return this.prisma.reportExport.update({
          where: { id: existing.id },
          data: {
            status: ReportExportStatus.PENDING,
            error: null,
            notificationEmail: notificationEmail ?? existing.notificationEmail,
          },
        });
      }

      if (notificationEmail && notificationEmail !== existing.notificationEmail) {
        return this.prisma.reportExport.update({
          where: { id: existing.id },
          data: { notificationEmail },
        });
      }

      return existing;
    }

    return this.prisma.reportExport.create({
      data: {
        type,
        format,
        status: ReportExportStatus.PENDING,
        fingerprint,
        filters: filters as unknown as Prisma.InputJsonValue,
        fromDate: filters.startDate ? new Date(filters.startDate) : null,
        toDate: filters.endDate ? new Date(filters.endDate) : null,
        granularity: filters.granularity ?? null,
        locationId: filters.locationId ?? null,
        notificationEmail: notificationEmail ?? null,
      },
    });
  }

  /**
   * Generates the actual report file for a given export ID.
   * @param exportId - The ID of the export to generate.
   */
  private async generateExport(exportId: number) {
    const record = await this.prisma.reportExport.findUnique({ where: { id: exportId } });
    if (!record) {
      throw new Error(`Report export ${exportId} not found`);
    }

    const filters = this.parseFilters(record.filters);
    const query = this.toQuery(filters);

    let dataset: Dataset;
    switch (record.type) {
      case ReportExportType.SALES_SUMMARY: {
        const sales = await this.reporting.getSalesSummary(query);
        dataset = this.buildSalesDataset(sales);
        break;
      }
      case ReportExportType.EMPLOYEE_PERFORMANCE: {
        const employees = await this.reporting.getEmployeePerformance({ ...query, limit: 100 });
        dataset = this.buildEmployeeDataset(employees);
        break;
      }
      case ReportExportType.CATEGORY_PERFORMANCE: {
        const categories = await this.reporting.getCategoryPerformance(query);
        dataset = this.buildCategoryDataset(categories);
        break;
      }
      default:
        throw new Error(`Unsupported report export type: ${record.type}`);
    }

    const fileName = this.buildFileName(record);

    const file =
      record.format === ReportExportFormat.CSV
        ? this.renderCsv(dataset, fileName)
        : await this.renderExcel(dataset, fileName);

    const updated = await this.prisma.reportExport.update({
      where: { id: record.id },
      data: {
        status: ReportExportStatus.READY,
        fileName: file.fileName,
        mimeType: file.mimeType,
        fileData: file.content,
        completedAt: new Date(),
        error: null,
      },
    });

    if (updated.notificationEmail) {
      const { subject, html } = renderReportExportReadyEmail({
        type: updated.type,
        format: updated.format,
        fileName: updated.fileName ?? file.fileName,
        fromDate: updated.fromDate,
        toDate: updated.toDate,
        granularity: updated.granularity,
        locationId: updated.locationId,
      });

      await this.mailer.sendReportReadyEmail(updated.notificationEmail, subject, html);
    }

    this.logger.log(`Export ${record.id} completed (${updated.format})`);
  }

  /**
   * Normalizes the filters from a request DTO into a consistent object.
   * @param query - The request DTO.
   * @returns The normalized filters object.
   */
  private normaliseFilters(query: ReportExportRequestDto): ReportExportFilters {
    return {
      startDate: query.startDate ? query.startDate.toISOString() : undefined,
      endDate: query.endDate ? query.endDate.toISOString() : undefined,
      granularity: query.granularity,
      locationId: query.locationId,
    };
  }

  /**
   * Parses the filters from the JSON field in the database.
   * @param filters - The JSON value from the database.
   * @returns The parsed filters object.
   */
  private parseFilters(filters: Prisma.JsonValue | null | undefined): ReportExportFilters {
    if (!filters || typeof filters !== 'object') {
      return {};
    }
    const payload = filters as ReportExportFilters;
    return {
      startDate: payload.startDate,
      endDate: payload.endDate,
      granularity: payload.granularity,
      locationId: payload.locationId,
    };
  }

  /**
   * Converts a filters object into a query object for the ReportingService.
   * @param filters - The filters object.
   * @returns The query object.
   */
  private toQuery(filters: ReportExportFilters) {
    return {
      startDate: filters.startDate ? new Date(filters.startDate) : undefined,
      endDate: filters.endDate ? new Date(filters.endDate) : undefined,
      granularity: filters.granularity as Granularity | undefined,
      locationId: filters.locationId,
    };
  }

  /**
   * Converts a full export record from the database into a summary object.
   * @param record - The database record.
   * @returns The export summary.
   */
  private toSummary(record: ReportExport): ExportSummary {
    const filters = this.parseFilters(record.filters);
    return {
      id: record.id,
      type: record.type,
      format: record.format,
      status: record.status,
      createdAt: record.createdAt,
      startedAt: record.startedAt,
      completedAt: record.completedAt,
      fileName: record.fileName,
      mimeType: record.mimeType,
      filters,
      notificationEmail: record.notificationEmail,
      downloadPath: record.status === ReportExportStatus.READY ? `/reporting/exports/${record.id}/download` : null,
      error: record.error,
    };
  }

  /**
   * Builds a unique fingerprint for a set of export parameters.
   * @param type - The report type.
   * @param format - The export format.
   * @param filters - The report filters.
   * @returns A SHA1 hash representing the parameters.
   */
  private buildFingerprint(
    type: ReportExportType,
    format: ReportExportFormat,
    filters: ReportExportFilters,
  ): string {
    const payload = JSON.stringify({ type, format, ...filters });
    return createHash('sha1').update(payload).digest('hex');
  }

  /**
   * Constructs a file name for an export.
   * @param record - The export record.
   * @returns The generated file name.
   */
  private buildFileName(record: ReportExport) {
    const base = TYPE_LABELS[record.type] ?? 'report';
    const start = record.fromDate ? this.formatDateForFile(record.fromDate) : 'start';
    const end = record.toDate ? this.formatDateForFile(record.toDate) : 'end';
    const extension = record.format === ReportExportFormat.CSV ? 'csv' : 'xlsx';
    return `${base}_${start}_${end}.${extension}`;
  }

  /**
   * Formats a date for use in a file name (YYYYMMDD).
   * @param date - The date to format.
   * @returns The formatted date string.
   */
  private formatDateForFile(date: Date) {
    const year = date.getUTCFullYear();
    const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
    const day = `${date.getUTCDate()}`.padStart(2, '0');
    return `${year}${month}${day}`;
  }

  /**
   * Renders a dataset into a CSV file buffer.
   * @param dataset - The dataset to render.
   * @param fileName - The desired file name.
   * @returns An object containing the file name, MIME type, and content buffer.
   */
  private renderCsv(dataset: Dataset, fileName: string) {
    const delimiter = ';';
    const escape = (value: string | number | null) => {
      if (value === null || value === undefined) {
        return '';
      }
      const stringValue = String(value);
      if (/["\n;]/.test(stringValue)) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      return stringValue;
    };

    const rows = [
      dataset.headers.join(delimiter),
      ...dataset.rows.map((row) => dataset.headers.map((header) => escape(row[header] ?? '')).join(delimiter)),
    ];

    return {
      fileName,
      mimeType: 'text/csv',
      content: Buffer.from(rows.join('\n'), 'utf-8'),
    };
  }

  /**
   * Renders a dataset into an Excel (XLSX) file buffer.
   * @param dataset - The dataset to render.
   * @param fileName - The desired file name.
   * @returns A promise that resolves to an object containing the file name, MIME type, and content buffer.
   */
  private async renderExcel(dataset: Dataset, fileName: string) {
    const workbook = new Workbook();
    const sheet = workbook.addWorksheet(dataset.name);

    sheet.addRow(dataset.headers);
    dataset.rows.forEach((row) => {
      sheet.addRow(dataset.headers.map((header) => row[header] ?? null));
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return {
      fileName,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      content: Buffer.from(buffer),
    };
  }

  /**
   * Converts sales summary data into a standardized dataset format for export.
   * @param data - The sales summary data.
   * @returns The formatted dataset.
   */
  private buildSalesDataset(
    data: Array<{
      period: string;
      total: number;
      transactions: number;
      paymentMethods: Record<string, { count: number; total: number }>;
    }>,
  ): Dataset {
    return {
      name: 'Sales',
      headers: ['Periode', 'Umsatz', 'Transaktionen', 'Zahlarten'],
      rows: data.map((bucket) => ({
        Periode: bucket.period,
        Umsatz: Number(bucket.total.toFixed(2)),
        Transaktionen: bucket.transactions,
        Zahlarten: Object.entries(bucket.paymentMethods)
          .map(([method, stats]) => `${method}: ${stats.count} (${stats.total.toFixed(2)})`)
          .join(' | '),
      })),
    };
  }

  /**
   * Converts employee performance data into a standardized dataset format for export.
   * @param data - The employee performance data.
   * @returns The formatted dataset.
   */
  private buildEmployeeDataset(
    data: Array<{ employeeId: string; revenue: number; tickets: number; avgBasket: number }>,
  ): Dataset {
    return {
      name: 'Employees',
      headers: ['Mitarbeiter', 'Umsatz', 'Belege', 'Ø Bon'],
      rows: data.map((row) => ({
        Mitarbeiter: row.employeeId,
        Umsatz: Number(row.revenue.toFixed(2)),
        Belege: row.tickets,
        'Ø Bon': Number(row.avgBasket.toFixed(2)),
      })),
    };
  }

  /**
   * Converts category performance data into a standardized dataset format for export.
   * @param data - The category performance data.
   * @returns The formatted dataset.
   */
  private buildCategoryDataset(
    data: Array<{ category: string; revenue: number; units: number; items: number; shareOfRevenue: number }>,
  ): Dataset {
    return {
      name: 'Categories',
      headers: ['Kategorie', 'Umsatz', 'Einheiten', 'Positionen', 'Umsatzanteil (%)'],
      rows: data.map((row) => ({
        Kategorie: row.category,
        Umsatz: Number(row.revenue.toFixed(2)),
        Einheiten: Number(row.units.toFixed(3)),
        Positionen: row.items,
        'Umsatzanteil (%)': Number(row.shareOfRevenue.toFixed(2)),
      })),
    };
  }

  /**
   * Checks if the `ReportExport` table exists in the database and throws an error if it doesn't.
   */
  private async ensureReportExportTableOrThrow() {
    if (await this.hasReportExportTable()) {
      return;
    }

    throw new ServiceUnavailableException(
      'Report exports are not available because the database schema is out of date. Please run the latest Prisma migrations.',
    );
  }

  /**
   * Checks if the `ReportExport` table exists in the database.
   * @returns A promise that resolves to true if the table exists, false otherwise.
   */
  private async hasReportExportTable(): Promise<boolean> {
    try {
      const result = await this.prisma.$queryRaw<{ exists: boolean }[]>`
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.tables
          WHERE table_schema = current_schema()
            AND lower(table_name) = 'reportexport'
        ) as "exists";
      `;

      const exists = Boolean(result?.[0]?.exists);

      if (!exists && !this.hasLoggedMissingTable) {
        this.logger.warn(
          'Report export table is missing. Run "prisma migrate deploy" to apply the latest migrations.',
        );
        this.hasLoggedMissingTable = true;
      } else if (exists) {
        this.hasLoggedMissingTable = false;
      }

      return exists;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to verify report export table presence: ${detail}`);
      return false;
    }
  }
}
