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

export type DeliveryDocumentPayload = {
  id: number;
  type: DeliveryDocumentType;
  documentNumber: string;
  createdAt: string;
  updatedAt: string;
  payload: Record<string, any>;
};

export type CashEventPayload = {
  id: number;
  type: CashEventType;
  createdAt: string;
  metadata?: Record<string, any>;
  sale?: { id: number; receiptNo: string } | null;
  preorder?: { id: number; externalReference: string } | null;
};

export type PreorderStatusHistoryPayload = {
  id: number;
  status: PreorderStatus;
  createdAt: string;
  notes?: string | null;
};

export type PreorderSummaryPayload = {
  id: number;
  externalReference: string;
  status: PreorderStatus;
  customerName?: string | null;
  scheduledPickup?: string | null;
  sale?: { id: number; receiptNo: string | null } | null;
};

export type PreorderPayload = PreorderSummaryPayload & {
  items: PreorderItemInput[];
  documents: DeliveryDocumentPayload[];
  statusHistory: PreorderStatusHistoryPayload[];
};

export type SaleAugmentation = {
  documents: DeliveryDocumentPayload[];
  cashEvents: CashEventPayload[];
  preorder?: PreorderSummaryPayload;
};

@Injectable()
export class PreordersService {
  private readonly logger = new Logger(PreordersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: PosRealtimeGateway,
  ) {}

  async listActivePreorders(): Promise<PreorderPayload[]> {
    const preorders = await this.prisma.preorder.findMany({
      where: { status: { in: [PreorderStatus.ORDERED, PreorderStatus.READY] } },
      include: {
        sale: { select: { id: true, receiptNo: true } },
        statusHistory: { orderBy: { createdAt: 'asc' } },
        documents: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return preorders.map(preorder => this.toPreorderPayload(preorder));
  }

  async listRecentCashEvents(limit = 25): Promise<CashEventPayload[]> {
    const events = await this.prisma.cashEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        sale: { select: { id: true, receiptNo: true } },
        preorder: { select: { id: true, externalReference: true } },
      },
    });

    return events.map(event => this.toCashEventPayload(event));
  }

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

  async handleSaleCompletion(sale: Sale, reference?: string | null) {
    const saleEvent = await this.createCashEvent(this.prisma, {
      saleId: sale.id,
      type: CashEventType.SALE_COMPLETED,
      metadata: {
        reference: reference ?? null,
        receiptNo: sale.receiptNo,
        total: Number(sale.total),
      },
    });
    this.emitCashEvent(saleEvent);

    if (!reference) {
      return;
    }

    const preorder = await this.prisma.preorder.findUnique({ where: { externalReference: reference } });
    if (!preorder) {
      this.logger.warn(`Kein Vorauftrag für Referenz ${reference} gefunden.`);
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

  private async createCashEvent(
    client: Prisma.TransactionClient | PrismaService,
    data: {
      saleId?: number;
      preorderId?: number;
      type: CashEventType;
      metadata?: Record<string, any> | null;
    },
  ): Promise<CashEventPayload> {
    const event = await client.cashEvent.create({
      data: {
        saleId: data.saleId ?? null,
        preorderId: data.preorderId ?? null,
        type: data.type,
        metadata: data.metadata ? (data.metadata as Prisma.InputJsonValue) : undefined,
      },
      include: {
        sale: { select: { id: true, receiptNo: true } },
        preorder: { select: { id: true, externalReference: true } },
      },
    });

    return this.toCashEventPayload(event);
  }

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

  private toCashEventPayload(event: any): CashEventPayload {
    return {
      id: event.id,
      type: event.type,
      createdAt: new Date(event.createdAt).toISOString(),
      metadata: (event.metadata as Record<string, any>) ?? undefined,
      sale: event.sale ?? null,
      preorder: event.preorder ?? null,
    };
  }

  private toStatusHistoryPayload(history: any): PreorderStatusHistoryPayload {
    return {
      id: history.id,
      status: history.status,
      createdAt: new Date(history.createdAt).toISOString(),
      notes: history.notes,
    };
  }

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

  private mapWoltStatus(status: string): PreorderStatus {
    return this.toStatus(status);
  }

  private generateDocumentNumber(prefix: string) {
    return `${prefix}-${Date.now()}`;
  }

  private emitPreorderUpdate(preorder: PreorderPayload) {
    this.realtime.broadcast('preorder.updated', { preorder });
  }

  private emitCashEvent(event: CashEventPayload) {
    this.realtime.broadcast('cash-event.created', { event });
  }
}
