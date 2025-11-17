import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CashEventType, Prisma, Sale as SaleModel, TableTab as TableTabModel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CreatePaymentDto, PaymentMethod } from './dto/create-payment.dto';
import { SyncCartDto } from './dto/sync-cart.dto';
import { EmailReceiptDto } from './dto/email-receipt.dto';
import { PosHardwareService } from '../hardware/pos-hardware.service';
import { MailerService } from '../mailer/mailer.service';
import { renderReceiptEmail } from '../mailer/templates/receipt-email.template';
import { createReceiptViewModel, renderReceiptHtml, renderReceiptPdf } from '../mailer/templates/receipt-renderer';
import type { FiscalMetadataPayload, SalePayload } from './types/sale-payload';
import { FiscalizationService } from '../fiscal/fiscalization.service';
import { PreordersService } from '../preorders/preorders.service';
import { PosRealtimeGateway } from '../realtime/realtime.gateway';
import { RefundPaymentDto } from './dto/refund-payment.dto';
import { CreateTableTabDto, TableTabStatusDto, UpdateTableTabDto } from './dto/table-tab.dto';
import { CreateCashAdjustmentDto } from './dto/cash-adjustment.dto';

const LATEST_SALE_TTL_SECONDS = 60 * 5;
const CART_TTL_SECONDS = 60 * 60;

type TableCheckPayload = {
  id: string;
  label: string;
  items: Array<{ id: string; quantity: number }>;
};

type TableTabPayload = {
  id: number;
  tableId: string;
  label: string;
  areaLabel?: string | null;
  waiterId?: string | null;
  guestCount?: number | null;
  status: TableTabStatusDto;
  openedAt: Date;
  closedAt?: Date | null;
  checks: TableCheckPayload[];
  coursePlan?: SalePayload['courses'];
};

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
   * Retrieves the cached cart for a given terminal.
   *
   * @param terminalId - The ID of the terminal requesting the cart.
   * @returns The cached cart payload including metadata.
   */
  async getCart(terminalId: string) {
    const key = `pos:cart:${terminalId}`;
    const cart = await this.redis.getJson<(SyncCartDto & { updatedAt: string }) | null>(key);
    const ttl = await this.redis.getClient().ttl(key);

    if (!cart || ttl === -2) {
      throw new NotFoundException('Für dieses Terminal ist kein Warenkorb gespeichert.');
    }

    if (ttl === 0) {
      throw new BadRequestException('Der gespeicherte Warenkorb ist abgelaufen. Bitte synchronisiere erneut.');
    }

    const ttlSeconds = ttl >= 0 ? ttl : null;

    return { cart, ttlSeconds };
  }

  async listTables() {
    const tables = await this.prisma.tableTab.findMany({ orderBy: { openedAt: 'asc' } });
    return { tables: tables.map(table => this.toTableTabPayload(table)) };
  }

  async openTable(dto: CreateTableTabDto) {
    const table = await this.prisma.tableTab.create({
      data: {
        tableId: dto.tableId,
        label: dto.label,
        areaLabel: dto.areaLabel ?? null,
        waiterId: dto.waiterId ?? null,
        guestCount: dto.guestCount ?? null,
        checks: (dto.checks ?? []) as Prisma.InputJsonValue,
        coursePlan: (dto.coursePlan ?? []) as Prisma.InputJsonValue,
      },
    });

    const payload = this.toTableTabPayload(table);
    this.realtime.broadcast('table.updated', { table: payload });

    return {
      message: 'Tisch geöffnet',
      table: payload,
    };
  }

  async updateTable(id: number, dto: UpdateTableTabDto) {
    const table = await this.prisma.tableTab.update({
      where: { id },
      data: {
        label: dto.label ?? undefined,
        areaLabel: dto.areaLabel ?? undefined,
        waiterId: dto.waiterId ?? undefined,
        guestCount: typeof dto.guestCount === 'number' ? dto.guestCount : undefined,
        checks: dto.checks ? (dto.checks as Prisma.InputJsonValue) : undefined,
        coursePlan: dto.coursePlan ? (dto.coursePlan as Prisma.InputJsonValue) : undefined,
        status: dto.status ?? undefined,
        closedAt:
          dto.status === TableTabStatusDto.CLOSED
            ? new Date()
            : dto.status === TableTabStatusDto.OPEN
            ? null
            : undefined,
      },
    });

    const payload = this.toTableTabPayload(table);
    this.realtime.broadcast('table.updated', { table: payload });

    return {
      message: 'Tisch aktualisiert',
      table: payload,
    };
  }

  async closeTable(id: number) {
    const table = await this.prisma.tableTab.update({
      where: { id },
      data: { status: TableTabStatusDto.CLOSED, closedAt: new Date() },
    });

    const payload = this.toTableTabPayload(table);
    this.realtime.broadcast('table.closed', { table: payload });

    return {
      message: 'Tisch geschlossen',
      table: payload,
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
    const total = Number(this.calculateTotal(dto).toFixed(2));
    const { amountTendered, changeDue } = this.resolveCashDetails(dto, total);
    const sale = await this.createSaleEntity(dto, { total, amountTendered, changeDue });
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
      const { amountTendered, changeDue } = this.resolveCashDetails(dto, total);

      const fiscalization = await this.fiscalization.registerReceipt(receiptNo, dto, total);

      const sale = await this.createSaleEntity(dto, {
        receiptNo,
        total,
        fiscalization,
        amountTendered,
        changeDue,
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
   * Creates a refund for a previously captured sale.
   */
  async refundPayment(dto: RefundPaymentDto) {
    try {
      const originalSale = await this.prisma.sale.findUnique({ where: { id: dto.saleId } });
      if (!originalSale) {
        throw new NotFoundException(`Sale ${dto.saleId} not found`);
      }

      if (originalSale.status === 'REFUNDED') {
        throw new BadRequestException('Sale has already been fully refunded.');
      }

      if (originalSale.status === 'REFUND') {
        throw new BadRequestException('Refund transactions cannot be refunded.');
      }

      const negativeItems = dto.items.map(item => ({
        ...item,
        quantity: -Math.abs(item.quantity),
      }));

      const refundSaleDto = {
        items: negativeItems,
        paymentMethod: (originalSale.paymentMethod as PaymentMethod) ?? 'CASH',
        reference: originalSale.reference ?? undefined,
        locationId: originalSale.locationId ?? undefined,
      } as CreatePaymentDto;

      const receiptNo = this.generateReceiptNumber();
      const total = Number(this.calculateTotal(refundSaleDto).toFixed(2));
      const fiscalization = await this.fiscalization.registerReceipt(receiptNo, refundSaleDto, total, {
        type: 'REFUND',
      });

      const [refundSale] = await this.prisma.$transaction([
        this.prisma.sale.create({
          data: {
            receiptNo,
            paymentMethod: refundSaleDto.paymentMethod,
            total,
            status: 'REFUND',
            items: refundSaleDto.items as unknown as Prisma.InputJsonValue,
            reference: refundSaleDto.reference ?? null,
            locationId: refundSaleDto.locationId ?? null,
            fiscalMetadata: fiscalization,
            refundForId: originalSale.id,
            refundReason: dto.reason ?? null,
            operatorId: dto.operatorId ?? null,
          },
        }),
        this.prisma.sale.update({
          where: { id: originalSale.id },
          data: { status: 'REFUNDED' },
        }),
      ]);

      const payload = await this.buildSalePayload(refundSale);
      await this.redis.setJson('pos:latest-sale', payload, LATEST_SALE_TTL_SECONDS);
      await this.hardware.printReceipt(payload);

      this.realtime.broadcast('sale.refund', { sale: payload, originalSaleId: originalSale.id });
      this.realtime.broadcastQueueMetrics('payments', {
        pending: 0,
        lastReceipt: payload.receiptNo,
        lastTotal: payload.total,
      });

      return {
        message: 'Refund processed successfully',
        sale: payload,
      };
    } catch (error) {
      this.realtime.broadcastSystemError('refunds', error);
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
   * Generates a receipt document as HTML or PDF for download.
   */
  async getReceiptDocument(
    saleId: number,
    format: 'pdf' | 'html',
  ): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
    const sale = await this.prisma.sale.findUnique({ where: { id: saleId } });
    if (!sale) {
      throw new NotFoundException(`Sale ${saleId} not found`);
    }

    const normalizedFormat = format === 'pdf' || format === 'html' ? format : null;
    if (!normalizedFormat) {
      throw new BadRequestException('Unsupported document format requested.');
    }

    const payload = await this.buildSalePayload(sale);
    const viewModel = createReceiptViewModel(payload, { businessName: 'FuchsPOS' });

    if (normalizedFormat === 'html') {
      const html = renderReceiptHtml(viewModel);
      return {
        buffer: Buffer.from(html, 'utf-8'),
        filename: `receipt-${payload.receiptNo}.html`,
        contentType: 'text/html; charset=utf-8',
      };
    }

    const buffer = renderReceiptPdf(viewModel);
    return {
      buffer,
      filename: `receipt-${payload.receiptNo}.pdf`,
      contentType: 'application/pdf',
    };
  }

  /**
   * Lists all active pre-orders.
   * @returns A promise that resolves to an array of active pre-orders.
   */
  async listPreorders(tenantId: string) {
    return this.preorders.listActivePreorders(tenantId);
  }

  /**
   * Lists recent cash events.
   * @param limit - The maximum number of events to return.
   * @returns A promise that resolves to an array of cash events.
   */
  async listCashEvents(tenantId: string, limit = 25) {
    return this.preorders.listRecentCashEvents(tenantId, limit);
  }

  async recordCashDeposit(dto: CreateCashAdjustmentDto) {
    return this.recordCashAdjustment(CashEventType.CASH_DEPOSIT, dto);
  }

  async recordCashWithdrawal(dto: CreateCashAdjustmentDto) {
    return this.recordCashAdjustment(CashEventType.CASH_WITHDRAWAL, dto);
  }

  private async recordCashAdjustment(
    type: CashEventType.CASH_DEPOSIT | CashEventType.CASH_WITHDRAWAL,
    dto: CreateCashAdjustmentDto,
  ) {
    const tenantId = dto.tenantId.trim();
    if (!tenantId) {
      throw new BadRequestException('tenantId ist erforderlich.');
    }

    const amount = Number(dto.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('amount muss größer als 0 sein.');
    }

    const reason = dto.reason.trim();
    const operatorId = dto.operatorId.trim();
    const event = await this.preorders.recordCashAdjustment({
      tenantId,
      amount: Number(amount.toFixed(2)),
      reason,
      operatorId,
      type,
    });

    return {
      message:
        type === CashEventType.CASH_DEPOSIT
          ? 'Bareinzahlung erfolgreich verbucht'
          : 'Barauszahlung erfolgreich verbucht',
      event,
    };
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
    options?: {
      receiptNo?: string;
      total?: number;
      fiscalization?: FiscalMetadataPayload | undefined;
      status?: Prisma.SaleStatus;
      refundForId?: number | null;
      refundReason?: string | null;
      operatorId?: string | null;
      amountTendered?: number | null;
      changeDue?: number | null;
    },
  ): Promise<SaleModel> {
    const total = options?.total ?? Number(this.calculateTotal(dto).toFixed(2));
    const receiptNo = options?.receiptNo ?? this.generateReceiptNumber();

    return this.prisma.sale.create({
      data: {
        receiptNo,
        paymentMethod: dto.paymentMethod,
        total,
        amountTendered:
          typeof options?.amountTendered === 'number'
            ? options.amountTendered
            : typeof dto.amountTendered === 'number'
            ? dto.amountTendered
            : null,
        changeDue: typeof options?.changeDue === 'number' ? options.changeDue : null,
        status: options?.status ?? 'SUCCESS',
        items: dto.items as unknown as Prisma.InputJsonValue,
        reference: dto.reference ?? null,
        locationId: dto.locationId ?? null,
        tableId: dto.tableId ?? null,
        tableLabel: dto.tableLabel ?? null,
        areaLabel: dto.areaLabel ?? null,
        waiterId: dto.waiterId ?? null,
        coursePlan: dto.courses ? (dto.courses as Prisma.InputJsonValue) : null,
        tableTabId: dto.tableTabId ?? null,
        fiscalMetadata: options?.fiscalization,
        refundForId: options?.refundForId ?? null,
        refundReason: options?.refundReason ?? null,
        operatorId: options?.operatorId ?? null,
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

  private toTableTabPayload(tab: TableTabModel): TableTabPayload {
    const rawChecks = Array.isArray(tab.checks) ? (tab.checks as TableCheckPayload[]) : [];
    const rawCourses = (tab.coursePlan as SalePayload['courses']) ?? undefined;

    return {
      id: tab.id,
      tableId: tab.tableId,
      label: tab.label,
      areaLabel: tab.areaLabel,
      waiterId: tab.waiterId,
      guestCount: tab.guestCount,
      status: tab.status as TableTabStatusDto,
      openedAt: tab.openedAt,
      closedAt: tab.closedAt,
      checks: rawChecks,
      coursePlan: rawCourses,
    };
  }

  /**
   * Converts a sale model from the database to a base SalePayload object.
   * @param sale - The sale model.
   * @returns The base sale payload.
   */
  private toBaseSalePayload(sale: SaleModel): SalePayload {
    const items = (sale.items as SalePayload['items']) ?? [];
    const table =
      sale.tableTabId || sale.tableId || sale.tableLabel
        ? {
            tabId: sale.tableTabId,
            tableId: sale.tableId,
            label: sale.tableLabel,
            areaLabel: sale.areaLabel,
            waiterId: sale.waiterId,
          }
        : undefined;
    const courses = (sale.coursePlan as SalePayload['courses']) ?? undefined;
    const resolveNumericField = (value: unknown): number | null => {
      if (value === null || typeof value === 'undefined') {
        return null;
      }
      return typeof value === 'number' ? value : Number(value);
    };

    return {
      id: sale.id,
      receiptNo: sale.receiptNo,
      paymentMethod: sale.paymentMethod,
      total: typeof sale.total === 'number' ? sale.total : Number(sale.total),
      amountTendered: resolveNumericField(sale.amountTendered),
      changeDue: resolveNumericField(sale.changeDue),
      status: sale.status,
      createdAt: new Date(sale.createdAt),
      items,
      reference: sale.reference,
      locationId: sale.locationId,
      table,
      waiterId: sale.waiterId,
      courses,
      fiscalization: sale.fiscalMetadata
        ? (sale.fiscalMetadata as SalePayload['fiscalization'])
        : undefined,
      refundForId: sale.refundForId,
      refundReason: sale.refundReason,
      operatorId: sale.operatorId,
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

  private resolveCashDetails(dto: CreatePaymentDto, total: number) {
    if (dto.paymentMethod !== PaymentMethod.CASH) {
      return { amountTendered: null, changeDue: null } as const;
    }

    if (typeof dto.amountTendered !== 'number' || Number.isNaN(dto.amountTendered)) {
      throw new BadRequestException('amountTendered ist für Barzahlungen erforderlich.');
    }

    const amountTendered = Number(dto.amountTendered.toFixed(2));
    if (amountTendered < total) {
      throw new BadRequestException('Der erhaltene Barbetrag darf den Gesamtbetrag nicht unterschreiten.');
    }

    return {
      amountTendered,
      changeDue: Number((amountTendered - total).toFixed(2)),
    } as const;
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
