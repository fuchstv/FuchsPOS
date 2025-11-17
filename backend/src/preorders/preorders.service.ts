import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  CashEventType,
  DeliveryDocumentType,
  PreorderStatus,
  Prisma,
  Sale,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PosRealtimeGateway } from '../realtime/realtime.gateway';
import type { PreorderItemInput, WoltOrderSyncPayload } from './types';

/**
 * Represents the data payload for a delivery document.
 */
export type DeliveryDocumentPayload = {
  id: number;
  type: DeliveryDocumentType;
  documentNumber: string;
  createdAt: string;
  updatedAt: string;
  payload: Record<string, any>;
};

/**
 * Represents the data payload for a cash event.
 */
export type CashEventPayload = {
  id: number;
  type: CashEventType;
  createdAt: string;
  metadata?: Record<string, any>;
  sale?: { id: number; receiptNo: string } | null;
  preorder?: { id: number; externalReference: string } | null;
  tenantId?: string | null;
};

/**
 * Represents a single entry in the status history of a pre-order.
 */
export type PreorderStatusHistoryPayload = {
  id: number;
  status: PreorderStatus;
  createdAt: string;
  notes?: string | null;
};

/**
 * Represents a summary of a pre-order.
 */
export type PreorderSummaryPayload = {
  id: number;
  externalReference: string;
  status: PreorderStatus;
  customerName?: string | null;
  scheduledPickup?: string | null;
  sale?: { id: number; receiptNo: string | null } | null;
};

/**
 * Represents the full data payload for a pre-order.
 */
export type PreorderPayload = PreorderSummaryPayload & {
  items: PreorderItemInput[];
  documents: DeliveryDocumentPayload[];
  statusHistory: PreorderStatusHistoryPayload[];
};

/**
 * Represents data that augments a sale with related pre-order information.
 */
export type SaleAugmentation = {
  documents: DeliveryDocumentPayload[];
  cashEvents: CashEventPayload[];
  preorder?: PreorderSummaryPayload;
};

/**
 * Service for managing pre-orders, cash events, and delivery documents.
 * It handles the lifecycle of pre-orders from creation to completion,
 * including integration with external services like Wolt.
 */
@Injectable()
export class PreordersService {
  private readonly logger = new Logger(PreordersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: PosRealtimeGateway,
  ) {}

  /**
   * Lists all active pre-orders (status ORDERED or READY).
   * @returns A promise that resolves to an array of active pre-order payloads.
   */
  async listActivePreorders(tenantId: string): Promise<PreorderPayload[]> {
    const preorders = await this.prisma.preorder.findMany({
      where: { tenantId, status: { in: [PreorderStatus.ORDERED, PreorderStatus.READY] } },
      include: {
        sale: { select: { id: true, receiptNo: true } },
        statusHistory: { orderBy: { createdAt: 'asc' } },
        documents: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const payload = preorders.map(preorder => this.toPreorderPayload(preorder));
    void this.publishPreorderMetrics();
    return payload;
  }

  /**
   * Lists recent cash events.
   * @param limit - The maximum number of events to return.
   * @returns A promise that resolves to an array of cash event payloads.
   */
  async listRecentCashEvents(tenantId: string, limit = 25): Promise<CashEventPayload[]> {
    const events = await this.prisma.cashEvent.findMany({
      where: {
        OR: [
          { tenantId },
          { preorder: { tenantId } },
          { sale: { preorder: { tenantId } } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        sale: { select: { id: true, receiptNo: true } },
        preorder: { select: { id: true, externalReference: true } },
      },
    });

    return events.map(event => this.toCashEventPayload(event));
  }

  /**
   * Builds an augmentation object for a sale, containing related documents, cash events, and pre-order info.
   * @param saleId - The ID of the sale to augment.
   * @returns A promise that resolves to the sale augmentation object.
   */
  async buildSaleAugmentation(saleId: number): Promise<SaleAugmentation> {
    const [documents, events, preorder] = await Promise.all([
      this.prisma.deliveryDocument.findMany({
        where: { saleId },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.cashEvent.findMany({
        where: { saleId },
        orderBy: { createdAt: 'asc' },
        include: {
          sale: { select: { id: true, receiptNo: true } },
          preorder: { select: { id: true, externalReference: true } },
        },
      }),
      this.prisma.preorder.findFirst({
        where: { saleId },
        include: { sale: { select: { id: true, receiptNo: true } } },
      }),
    ]);

    return {
      documents: documents.map(document => this.toDocumentPayload(document)),
      cashEvents: events.map(event => this.toCashEventPayload(event)),
      preorder: preorder ? this.toPreorderSummary(preorder) : undefined,
    };
  }

  /**
   * Creates or updates a pre-order based on data from a Wolt order.
   * @param order - The Wolt order synchronization payload.
   * @returns A promise that resolves to the created or updated pre-order payload.
   */
  async upsertFromWolt(order: WoltOrderSyncPayload): Promise<PreorderPayload> {
    const status = this.mapWoltStatus(order.status);
    const scheduledPickup = order.scheduledPickup ? new Date(order.scheduledPickup) : null;

    const result = await this.prisma.$transaction(async tx => {
      const woltOrder = await tx.woltOrder.upsert({
        where: { externalId: order.externalId },
        update: {
          status: order.status,
          tenantId: order.tenantId ?? null,
          rawPayload: (order.rawPayload ?? order) as Prisma.InputJsonValue,
        },
        create: {
          externalId: order.externalId,
          status: order.status,
          tenantId: order.tenantId ?? null,
          rawPayload: (order.rawPayload ?? order) as Prisma.InputJsonValue,
        },
      });

      const existing = await tx.preorder.findUnique({
        where: { externalReference: order.externalId },
      });

      if (!existing) {
        const created = await tx.preorder.create({
          data: {
            externalReference: order.externalId,
            tenantId: order.tenantId ?? null,
            customerName: order.customerName ?? null,
            scheduledPickup,
            items: (order.items as unknown as Prisma.InputJsonValue) ?? Prisma.JsonNull,
            woltOrderId: woltOrder.id,
          },
        });

        await tx.preorderStatusTransition.create({
          data: {
            preorderId: created.id,
            status,
            notes: order.statusLabel ?? 'Initialer Wolt-Import',
          },
        });

        await tx.preorder.update({
          where: { id: created.id },
          data: { status },
        });

        this.logger.debug(`Neuer Wolt-Vorauftrag ${order.externalId} mit Status ${status} angelegt.`);
        return created.id;
      }

      await tx.preorder.update({
        where: { id: existing.id },
        data: {
          customerName: order.customerName ?? null,
          scheduledPickup,
          items: (order.items as unknown as Prisma.InputJsonValue) ?? Prisma.JsonNull,
          woltOrderId: woltOrder.id,
          tenantId: order.tenantId ?? existing.tenantId ?? null,
        },
      });

      if (existing.status !== status) {
        await tx.preorderStatusTransition.create({
          data: {
            preorderId: existing.id,
            status,
            notes: order.statusLabel ?? 'Wolt-Statusaktualisierung',
          },
        });

        await tx.preorder.update({
          where: { id: existing.id },
          data: { status },
        });

        this.logger.debug(
          `Wolt-Vorauftrag ${order.externalId} auf Status ${status} aktualisiert (${order.status}).`,
        );
      }

      return existing.id;
    });

    const payload = await this.loadPreorderPayload(result);
    this.emitPreorderUpdate(payload);
    return payload;
  }

  /**
   * Transitions a pre-order to a new status, creating associated documents and events.
   * @param preorderId - The ID of the pre-order to transition.
   * @param status - The new status.
   * @param options - Optional data for the transition, like notes or a sale ID.
   * @returns A promise that resolves to an object containing the updated pre-order and any created documents and events.
   */
  async transitionStatus(
    preorderId: number,
    status: PreorderStatus,
    options?: { notes?: string; saleId?: number; metadata?: Record<string, any> },
  ): Promise<{ preorder: PreorderPayload; documents: DeliveryDocumentPayload[]; events: CashEventPayload[] }>
  {
    const { preorder, documents, events } = await this.prisma.$transaction(async tx => {
      const existing = await tx.preorder.findUnique({
        where: { id: preorderId },
        include: { sale: { select: { id: true, receiptNo: true } } },
      });

      if (!existing) {
        throw new NotFoundException(`Preorder ${preorderId} nicht gefunden`);
      }

      const shouldUpdateStatus = existing.status !== status;

      if (options?.saleId && existing.saleId !== options.saleId) {
        await tx.preorder.update({
          where: { id: preorderId },
          data: { saleId: options.saleId },
        });
      }

      if (shouldUpdateStatus) {
        await tx.preorder.update({
          where: { id: preorderId },
          data: { status },
        });
      }

      await tx.preorderStatusTransition.create({
        data: {
          preorderId,
          status,
          notes: options?.notes ?? null,
        },
      });

      const documents: DeliveryDocumentPayload[] = [];
      const events: CashEventPayload[] = [];

      if (status === PreorderStatus.READY && shouldUpdateStatus) {
        const document = await this.createDeliveryDocument(tx, preorderId, DeliveryDocumentType.DELIVERY_NOTE, options?.metadata);
        documents.push(document);
        const event = await this.createCashEvent(tx, {
          preorderId,
          type: CashEventType.PREORDER_READY,
          metadata: { ...options?.metadata, documentNumber: document.documentNumber },
          tenantId: existing.tenantId ?? undefined,
        });
        events.push(event);
      }

      if (status === PreorderStatus.PICKED_UP && shouldUpdateStatus) {
        const document = await this.createDeliveryDocument(tx, preorderId, DeliveryDocumentType.PICKUP_RECEIPT, {
          ...(options?.metadata ?? {}),
          saleId: options?.saleId ?? existing.saleId ?? undefined,
        });
        documents.push(document);
        const event = await this.createCashEvent(tx, {
          preorderId,
          saleId: options?.saleId ?? existing.saleId ?? undefined,
          type: CashEventType.PREORDER_PICKED_UP,
          metadata: {
            ...options?.metadata,
            documentNumber: document.documentNumber,
          },
          tenantId: existing.tenantId ?? undefined,
        });
        events.push(event);
      }

      const payload = await this.loadPreorderPayload(preorderId, tx);
      if (shouldUpdateStatus) {
        this.logger.debug(`Vorauftrag ${preorderId} wechselte auf Status ${status}.`);
      } else {
        this.logger.verbose(`Status ${status} für Vorauftrag ${preorderId} erneut protokolliert.`);
      }
      return { preorder: payload, documents, events };
    });

    this.emitPreorderUpdate(preorder);
    events.forEach(event => this.emitCashEvent(event));

    return { preorder, documents, events };
  }

  /**
   * Handles the completion of a sale, linking it to a pre-order if a reference is provided.
   * @param sale - The completed sale object.
   * @param reference - An optional reference to a pre-order.
   */
  async handleSaleCompletion(sale: Sale, reference?: string | null) {
    const normalizedReference = reference?.trim();
    const preorder = normalizedReference
      ? await this.prisma.preorder.findUnique({ where: { externalReference: normalizedReference } })
      : null;

    const saleEvent = await this.createCashEvent(this.prisma, {
      saleId: sale.id,
      type: CashEventType.SALE_COMPLETED,
      metadata: {
        reference: normalizedReference ?? null,
        receiptNo: sale.receiptNo,
        total: Number(sale.total),
      },
      tenantId: preorder?.tenantId ?? undefined,
    });
    this.emitCashEvent(saleEvent);

    if (!normalizedReference) {
      return;
    }

    if (!preorder) {
      this.logger.warn(`Kein Vorauftrag für Referenz ${normalizedReference} gefunden.`);
      return;
    }

    await this.prisma.preorder.update({
      where: { id: preorder.id },
      data: { saleId: sale.id },
    });

    await this.transitionStatus(preorder.id, PreorderStatus.PICKED_UP, {
      notes: 'Abholung bezahlt und abgeschlossen',
      saleId: sale.id,
      metadata: { receiptNo: sale.receiptNo },
    });
  }

  /**
   * Records a manual cash adjustment (deposit or withdrawal) for the given tenant.
   */
  async recordCashAdjustment(input: {
    tenantId: string;
    amount: number;
    reason: string;
    operatorId: string;
    type: CashEventType.CASH_DEPOSIT | CashEventType.CASH_WITHDRAWAL;
  }): Promise<CashEventPayload> {
    const event = await this.createCashEvent(this.prisma, {
      type: input.type,
      tenantId: input.tenantId,
      metadata: {
        amount: Number(input.amount.toFixed(2)),
        reason: input.reason,
        operatorId: input.operatorId,
      },
    });
    this.emitCashEvent(event);
    return event;
  }

  /**
   * Loads the full payload for a pre-order by its ID.
   * @param id - The ID of the pre-order.
   * @param tx - An optional Prisma transaction client.
   * @returns A promise that resolves to the pre-order payload.
   */
  private async loadPreorderPayload(id: number, tx?: Prisma.TransactionClient): Promise<PreorderPayload> {
    const client = tx ?? this.prisma;
    const preorder = await client.preorder.findUnique({
      where: { id },
      include: {
        sale: { select: { id: true, receiptNo: true } },
        statusHistory: { orderBy: { createdAt: 'asc' } },
        documents: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!preorder) {
      throw new NotFoundException(`Preorder ${id} nicht gefunden`);
    }

    return this.toPreorderPayload(preorder);
  }

  /**
   * Creates a delivery document for a pre-order.
   * @param tx - The Prisma transaction client.
   * @param preorderId - The ID of the pre-order.
   * @param type - The type of document to create.
   * @param metadata - Optional metadata for the document.
   * @returns A promise that resolves to the created document payload.
   */
  private async createDeliveryDocument(
    tx: Prisma.TransactionClient,
    preorderId: number,
    type: DeliveryDocumentType,
    metadata?: Record<string, any>,
  ): Promise<DeliveryDocumentPayload> {
    const preorder = await tx.preorder.findUnique({
      where: { id: preorderId },
      include: {
        sale: { select: { id: true, receiptNo: true } },
      },
    });

    if (!preorder) {
      throw new NotFoundException(`Preorder ${preorderId} nicht gefunden`);
    }

    const documentNumber = this.generateDocumentNumber(type === DeliveryDocumentType.DELIVERY_NOTE ? 'DN' : 'PR');

    const payload = {
      preorder: {
        id: preorder.id,
        externalReference: preorder.externalReference,
        status: preorder.status,
      },
      sale: preorder.sale ? { id: preorder.sale.id, receiptNo: preorder.sale.receiptNo } : null,
      items: this.normaliseItems(preorder.items),
      metadata: metadata ?? null,
      generatedAt: new Date().toISOString(),
    };

    const saleId = typeof metadata?.saleId === 'number' ? metadata.saleId : preorder.saleId ?? null;

    const document = await tx.deliveryDocument.create({
      data: {
        preorderId,
        saleId,
        type,
        documentNumber,
        payload: payload as unknown as Prisma.InputJsonValue,
      },
    });

    return this.toDocumentPayload(document);
  }

  /**
   * Creates a cash event.
   * @param client - The Prisma client or transaction client.
   * @param data - The data for the cash event.
   * @returns A promise that resolves to the created cash event payload.
   */
  private async createCashEvent(
    client: Prisma.TransactionClient | PrismaService,
    data: {
      saleId?: number;
      preorderId?: number;
      type: CashEventType;
      metadata?: Record<string, any> | null;
      tenantId?: string;
    },
  ): Promise<CashEventPayload> {
    const event = await client.cashEvent.create({
      data: {
        saleId: data.saleId ?? null,
        preorderId: data.preorderId ?? null,
        type: data.type,
        metadata: data.metadata ? (data.metadata as Prisma.InputJsonValue) : undefined,
        tenantId: data.tenantId ?? null,
      },
      include: {
        sale: { select: { id: true, receiptNo: true } },
        preorder: { select: { id: true, externalReference: true } },
      },
    });

    return this.toCashEventPayload(event);
  }

  /**
   * Converts a pre-order from the database into a full PreorderPayload.
   * @param preorder - The pre-order object from Prisma.
   * @returns The full pre-order payload.
   */
  private toPreorderPayload(preorder: any): PreorderPayload {
    return {
      ...this.toPreorderSummary(preorder),
      items: this.normaliseItems(preorder.items),
      documents: Array.isArray(preorder.documents)
        ? preorder.documents.map((document: any) => this.toDocumentPayload(document))
        : [],
      statusHistory: Array.isArray(preorder.statusHistory)
        ? preorder.statusHistory.map((history: any) => this.toStatusHistoryPayload(history))
        : [],
    };
  }

  /**
   * Converts a pre-order from the database into a PreorderSummaryPayload.
   * @param preorder - The pre-order object from Prisma.
   * @returns The pre-order summary payload.
   */
  private toPreorderSummary(preorder: any): PreorderSummaryPayload {
    return {
      id: preorder.id,
      externalReference: preorder.externalReference,
      status: preorder.status,
      customerName: preorder.customerName,
      scheduledPickup: preorder.scheduledPickup ? new Date(preorder.scheduledPickup).toISOString() : null,
      sale: preorder.sale
        ? { id: preorder.sale.id, receiptNo: preorder.sale.receiptNo }
        : null,
    };
  }

  /**
   * Converts a delivery document from the database into a DeliveryDocumentPayload.
   * @param document - The document object from Prisma.
   * @returns The delivery document payload.
   */
  private toDocumentPayload(document: any): DeliveryDocumentPayload {
    return {
      id: document.id,
      type: document.type,
      documentNumber: document.documentNumber,
      createdAt: new Date(document.createdAt).toISOString(),
      updatedAt: new Date(document.updatedAt).toISOString(),
      payload: (document.payload as Record<string, any>) ?? {},
    };
  }

  /**
   * Converts a cash event from the database into a CashEventPayload.
   * @param event - The event object from Prisma.
   * @returns The cash event payload.
   */
  private toCashEventPayload(event: any): CashEventPayload {
    return {
      id: event.id,
      type: event.type,
      createdAt: new Date(event.createdAt).toISOString(),
      metadata: (event.metadata as Record<string, any>) ?? undefined,
      sale: event.sale ?? null,
      preorder: event.preorder ?? null,
      tenantId: event.tenantId ?? null,
    };
  }

  /**
   * Converts a status history entry from the database into a PreorderStatusHistoryPayload.
   * @param history - The history object from Prisma.
   * @returns The status history payload.
   */
  private toStatusHistoryPayload(history: any): PreorderStatusHistoryPayload {
    return {
      id: history.id,
      status: history.status,
      createdAt: new Date(history.createdAt).toISOString(),
      notes: history.notes,
    };
  }

  /**
   * Normalizes the items from a pre-order's JSON field into a structured array.
   * @param items - The raw `items` JSON value from the database.
   * @returns An array of normalized pre-order items.
   */
  private normaliseItems(items: Prisma.JsonValue): PreorderItemInput[] {
    if (!items || !Array.isArray(items)) {
      return [];
    }

    return (items as any[]).map(item => ({
      name: item.name ?? item.title ?? 'Position',
      quantity: Number(item.quantity ?? 1),
      unitPrice: typeof item.unitPrice === 'number' ? item.unitPrice : Number(item.price ?? 0),
      sku: item.sku ?? item.id ?? undefined,
    }));
  }

  /**
   * Converts a string status into a PreorderStatus enum value.
   * @param status - The status string.
   * @returns The corresponding PreorderStatus enum value.
   */
  private toStatus(status: string): PreorderStatus {
    const normalised = status.toLowerCase();
    switch (normalised) {
      case 'ready':
      case 'bereit':
        return PreorderStatus.READY;
      case 'picked_up':
      case 'abgeholt':
      case 'delivered':
        return PreorderStatus.PICKED_UP;
      default:
        return PreorderStatus.ORDERED;
    }
  }

  /**
   * Maps a Wolt status string to a PreorderStatus enum value.
   * @param status - The Wolt status string.
   * @returns The corresponding PreorderStatus.
   */
  private mapWoltStatus(status: string): PreorderStatus {
    return this.toStatus(status);
  }

  /**
   * Generates a unique document number with a given prefix.
   * @param prefix - The prefix for the document number (e.g., 'DN' for delivery note).
   * @returns A unique document number string.
   */
  private generateDocumentNumber(prefix: string) {
    return `${prefix}-${Date.now()}`;
  }

  /**
   * Broadcasts a pre-order update to connected real-time clients.
   * @param preorder - The updated pre-order payload.
   */
  private emitPreorderUpdate(preorder: PreorderPayload) {
    this.realtime.broadcast('preorder.updated', { preorder });
    void this.publishPreorderMetrics();
  }

  /**
   * Broadcasts a new cash event to connected real-time clients.
   * @param event - The created cash event payload.
   */
  private emitCashEvent(event: CashEventPayload) {
    this.realtime.broadcast('cash-event.created', { event });
  }

  /**
   * Calculates and broadcasts metrics for active pre-orders.
   */
  private async publishPreorderMetrics() {
    try {
      const [total, ready] = await Promise.all([
        this.prisma.preorder.count({
          where: { status: { in: [PreorderStatus.ORDERED, PreorderStatus.READY] } },
        }),
        this.prisma.preorder.count({ where: { status: PreorderStatus.READY } }),
      ]);
      this.realtime.broadcastQueueMetrics('preorders', { total, ready });
    } catch (error) {
      this.logger.warn(
        `Preorder-Metriken konnten nicht ermittelt werden: ${error instanceof Error ? error.message : error}`,
      );
      this.realtime.broadcastSystemError('preorders', 'Metriken für Vorbestellungen konnten nicht berechnet werden.', {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
