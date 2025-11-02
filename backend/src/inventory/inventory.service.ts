import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ImportBnnDocumentDto, BnnImportFormat } from './dto/import-bnn-document.dto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInventoryCountDto } from './dto/create-inventory-count.dto';
import { FinalizeInventoryCountDto } from './dto/finalize-inventory-count.dto';
import { RecordPriceChangeDto } from './dto/record-price-change.dto';

type ParsedBnnItem = {
  sku: string;
  name?: string;
  quantity: number;
  unitPrice?: number;
  lotNumber?: string;
  expirationDate?: string;
  storageLocationCode?: string;
  unit?: string;
  metadata?: Record<string, any>;
};

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async importGoodsReceipt(dto: ImportBnnDocumentDto) {
    const items = this.parseBnnPayload(dto);

    if (!items.length) {
      throw new BadRequestException('Keine Positionen im BNN-Dokument gefunden.');
    }

    const tenant = await this.prisma.tenant.findUnique({ where: { id: dto.tenantId } });
    if (!tenant) {
      throw new NotFoundException(`Tenant ${dto.tenantId} nicht gefunden.`);
    }

    const supplier = await this.ensureSupplier(dto.tenantId, dto.supplierName, dto.supplierNumber);

    const reference = dto.reference ?? `GR-${Date.now()}`;
    const receivedAt = dto.receivedAt ? new Date(dto.receivedAt) : new Date();

    const goodsReceipt = await this.prisma.goodsReceipt.create({
      data: {
        tenantId: dto.tenantId,
        supplierId: supplier?.id ?? null,
        reference,
        receivedAt,
        notes: dto.notes ?? null,
      },
    });

    const createdItems = [];

    for (const [index, item] of items.entries()) {
      const product = await this.ensureProduct(dto.tenantId, supplier?.id ?? null, item);
      const storageLocation = item.storageLocationCode
        ? await this.ensureStorageLocation(dto.tenantId, item.storageLocationCode)
        : null;

      const lotNumber = item.lotNumber ?? `${product.sku}-${Date.now()}-${index + 1}`;
      const quantity = this.toDecimal(item.quantity);
      const unitCost = this.toDecimal(item.unitPrice ?? parseFloat(product.defaultPrice.toString()));

      const batch = await this.prisma.batch.create({
        data: {
          productId: product.id,
          supplierId: supplier?.id ?? null,
          storageLocationId: storageLocation?.id ?? null,
          lotNumber,
          quantity,
          unitCost,
          expirationDate: item.expirationDate ? new Date(item.expirationDate) : null,
        },
      });

      const metadata: Prisma.InputJsonValue = {
        ...(item.metadata ?? {}),
        sourceFormat: dto.format,
      };

      const receiptItem = await this.prisma.goodsReceiptItem.create({
        data: {
          goodsReceiptId: goodsReceipt.id,
          productId: product.id,
          batchId: batch.id,
          quantity,
          unitCost,
          metadata,
        },
        include: {
          product: true,
          batch: true,
        },
      });

      createdItems.push(receiptItem);
    }

    await this.prisma.goodsReceiptImportLog.create({
      data: {
        goodsReceiptId: goodsReceipt.id,
        format: dto.format,
        sourceFileName: dto.fileName ?? null,
        rawPayload: dto.payload,
      },
    });

    return this.prisma.goodsReceipt.findUnique({
      where: { id: goodsReceipt.id },
      include: {
        supplier: true,
        items: {
          include: {
            product: true,
            batch: true,
          },
        },
        importSources: true,
      },
    });
  }

  async createInventoryCount(dto: CreateInventoryCountDto) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: dto.tenantId } });
    if (!tenant) {
      throw new NotFoundException(`Tenant ${dto.tenantId} nicht gefunden.`);
    }

    const location = dto.locationCode
      ? await this.ensureStorageLocation(dto.tenantId, dto.locationCode, dto.locationDescription)
      : null;

    const inventoryCount = await this.prisma.inventoryCount.create({
      data: {
        tenantId: dto.tenantId,
        locationId: location?.id ?? null,
      },
    });

    const createdItems = [];

    for (const line of dto.items ?? []) {
      const product = await this.findProductOrThrow(dto.tenantId, line.productSku);
      const batch = line.batchLotNumber
        ? await this.findBatch(product.id, line.batchLotNumber)
        : null;

      const expected =
        line.expectedQuantity ?? (batch ? parseFloat(batch.quantity.toString()) : 0);
      const counted = line.countedQuantity ?? expected;
      const difference = counted - expected;

      const countItem = await this.prisma.inventoryCountItem.create({
        data: {
          inventoryCountId: inventoryCount.id,
          productId: product.id,
          batchId: batch?.id ?? null,
          expectedQuantity: line.expectedQuantity !== undefined ? this.toDecimal(expected) : null,
          countedQuantity: this.toDecimal(counted),
          difference: this.toDecimal(difference),
        },
        include: {
          product: true,
          batch: true,
        },
      });

      createdItems.push(countItem);
    }

    return {
      ...inventoryCount,
      items: createdItems,
    };
  }

  async finalizeInventoryCount(id: number, dto: FinalizeInventoryCountDto) {
    const inventoryCount = await this.prisma.inventoryCount.findUnique({
      where: { id },
      include: {
        items: true,
        adjustments: true,
      },
    });

    if (!inventoryCount || inventoryCount.tenantId !== dto.tenantId) {
      throw new NotFoundException(`Inventur ${id} nicht gefunden.`);
    }

    if (inventoryCount.status === 'COMPLETED') {
      throw new BadRequestException('Inventur wurde bereits abgeschlossen.');
    }

    const createdAdjustments = [];
    const updatedItems = [];

    for (const line of dto.items ?? []) {
      const product = await this.findProductOrThrow(dto.tenantId, line.productSku);
      const batch = line.batchLotNumber
        ? await this.findBatch(product.id, line.batchLotNumber)
        : null;

      let countItem = inventoryCount.items.find((item) => {
        if (line.id && item.id === line.id) {
          return true;
        }
        return item.productId === product.id && (item.batchId ?? null) === (batch?.id ?? null);
      });

      const expected = countItem
        ? countItem.expectedQuantity
          ? parseFloat(countItem.expectedQuantity.toString())
          : 0
        : batch
          ? parseFloat(batch.quantity.toString())
          : 0;

      if (!countItem) {
        countItem = await this.prisma.inventoryCountItem.create({
          data: {
            inventoryCountId: inventoryCount.id,
            productId: product.id,
            batchId: batch?.id ?? null,
            expectedQuantity: expected ? this.toDecimal(expected) : null,
            countedQuantity: this.toDecimal(line.countedQuantity),
            difference: this.toDecimal(line.countedQuantity - expected),
          },
        });
        updatedItems.push(countItem);
        inventoryCount.items.push(countItem);
      } else {
        const difference = line.countedQuantity - expected;
        countItem = await this.prisma.inventoryCountItem.update({
          where: { id: countItem.id },
          data: {
            countedQuantity: this.toDecimal(line.countedQuantity),
            difference: this.toDecimal(difference),
          },
        });
        updatedItems.push(countItem);
      }

      const difference = line.countedQuantity - expected;
      if (dto.bookDifferences !== false && difference !== 0) {
        const adjustment = await this.prisma.inventoryAdjustment.create({
          data: {
            inventoryCountId: inventoryCount.id,
            productId: product.id,
            batchId: batch?.id ?? null,
            quantityChange: this.toDecimal(difference),
            reason: line.adjustmentReason ?? dto.defaultAdjustmentReason ?? 'Inventurdifferenz',
          },
        });
        createdAdjustments.push(adjustment);

        if (batch) {
          const currentQty = parseFloat(batch.quantity.toString());
          await this.prisma.batch.update({
            where: { id: batch.id },
            data: {
              quantity: this.toDecimal(currentQty + difference),
            },
          });
        }
      }
    }

    const completed = await this.prisma.inventoryCount.update({
      where: { id: inventoryCount.id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
      },
      include: {
        items: {
          include: {
            product: true,
            batch: true,
          },
        },
        adjustments: true,
      },
    });

    return {
      ...completed,
      adjustments: [...inventoryCount.adjustments, ...createdAdjustments],
      updatedItems,
    };
  }

  async recordPriceChange(dto: RecordPriceChangeDto) {
    const product = await this.findProductOrThrow(dto.tenantId, dto.productSku);
    const oldPrice = parseFloat(product.defaultPrice.toString());
    const newPrice = dto.newPrice;

    const effectiveFrom = dto.effectiveFrom ? new Date(dto.effectiveFrom) : new Date();
    const effectiveTo = dto.effectiveTo ? new Date(dto.effectiveTo) : null;

    let promotion = null;
    if (dto.promotion) {
      promotion = await this.prisma.promotion.create({
        data: {
          tenantId: dto.tenantId,
          name: dto.promotion.name,
          description: dto.promotion.description ?? null,
          startsAt: dto.promotion.startsAt ? new Date(dto.promotion.startsAt) : effectiveFrom,
          endsAt: dto.promotion.endsAt ? new Date(dto.promotion.endsAt) : effectiveTo,
        },
      });
    }

    const priceHistory = await this.prisma.priceHistory.create({
      data: {
        tenantId: dto.tenantId,
        productId: product.id,
        oldPrice: this.toDecimal(oldPrice),
        newPrice: this.toDecimal(newPrice),
        reason: dto.reason ?? null,
        effectiveFrom,
        effectiveTo,
        promotionId: promotion?.id ?? null,
      },
    });

    await this.prisma.product.update({
      where: { id: product.id },
      data: {
        defaultPrice: this.toDecimal(newPrice),
      },
    });

    return {
      product: await this.prisma.product.findUnique({
        where: { id: product.id },
        include: {
          supplier: true,
        },
      }),
      priceHistory,
      promotion,
    };
  }

  private parseBnnPayload(dto: ImportBnnDocumentDto): ParsedBnnItem[] {
    switch (dto.format) {
      case BnnImportFormat.JSON:
        return this.parseBnnJson(dto.payload);
      case BnnImportFormat.XML:
        return this.parseBnnXml(dto.payload);
      case BnnImportFormat.CSV:
      default:
        return this.parseBnnCsv(dto.payload);
    }
  }

  private parseBnnJson(payload: string): ParsedBnnItem[] {
    let data: any;
    try {
      data = JSON.parse(payload);
    } catch (error) {
      throw new BadRequestException('BNN JSON konnte nicht geparst werden.');
    }

    const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
    if (!items.length) {
      return [];
    }

    return items.map((item: Record<string, any>) => this.normalizeBnnItem(item));
  }

  private parseBnnCsv(payload: string): ParsedBnnItem[] {
    const lines = payload
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (!lines.length) {
      return [];
    }

    const delimiter = lines[0].includes(';') ? ';' : ',';
    const headers = lines[0].split(delimiter).map((header) => header.trim().toLowerCase());

    const items = lines.slice(1).map((line) => {
      const values = line.split(delimiter).map((value) => value.trim());
      const record: Record<string, string> = {};
      headers.forEach((header, index) => {
        record[header] = values[index];
      });
      return record;
    });

    return items.map((item) => this.normalizeBnnItem(item));
  }

  private parseBnnXml(payload: string): ParsedBnnItem[] {
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    const items: ParsedBnnItem[] = [];
    let match: RegExpExecArray | null;

    while ((match = itemRegex.exec(payload)) !== null) {
      const itemContent = match[1];
      const fieldRegex = /<([\w:-]+)>([\s\S]*?)<\/\1>/gi;
      const record: Record<string, string> = {};
      let fieldMatch: RegExpExecArray | null;

      while ((fieldMatch = fieldRegex.exec(itemContent)) !== null) {
        record[fieldMatch[1]] = fieldMatch[2].trim();
      }

      items.push(this.normalizeBnnItem(record));
    }

    return items;
  }

  private normalizeBnnItem(raw: Record<string, any>): ParsedBnnItem {
    const normalized = this.withLowerCaseKeys(raw);
    const sku =
      normalized.sku ??
      normalized.articlenumber ??
      normalized.article_number ??
      normalized.artikelnummer ??
      normalized.ean ??
      normalized.gtin;
    if (!sku) {
      throw new BadRequestException('Artikel ohne SKU/EAN im BNN-Dokument gefunden.');
    }

    const quantityValue =
      normalized.quantity ??
      normalized.qty ??
      normalized.orderedquantity ??
      normalized.deliveredquantity ??
      normalized.menge;

    const quantity = Number(quantityValue ?? 0);
    if (!Number.isFinite(quantity)) {
      throw new BadRequestException(`Ungültige Menge für Artikel ${sku}.`);
    }

    const unitPriceValue =
      normalized.unitprice ??
      normalized.price ??
      normalized.netprice ??
      normalized.grossprice ??
      normalized.preis;
    const expiration =
      normalized.expirationdate ??
      normalized.bestbefore ??
      normalized.mhd ??
      normalized.mindesthaltbarkeitsdatum;
    const lotNumber =
      normalized.lotnumber ?? normalized.lot ?? normalized.batch ?? normalized.chargennummer;

    const expirationDate = this.normalizeDateString(expiration);

    return {
      sku: String(sku),
      name: normalized.name ?? normalized.description ?? normalized.bezeichnung,
      quantity,
      unitPrice: unitPriceValue !== undefined && unitPriceValue !== null ? Number(unitPriceValue) : undefined,
      lotNumber: lotNumber ? String(lotNumber) : undefined,
      expirationDate,
      storageLocationCode:
        normalized.storagelocationcode ?? normalized.location ?? normalized.lagerort ?? normalized.bin ?? undefined,
      unit: normalized.unit ?? normalized.salesunit ?? normalized.einheit ?? undefined,
      metadata: raw,
    };
  }

  private async ensureSupplier(tenantId: string, name?: string, supplierNumber?: string) {
    if (!name && !supplierNumber) {
      return null;
    }

    const orClauses = [] as any[];
    if (name) {
      orClauses.push({ name });
    }
    if (supplierNumber) {
      orClauses.push({ bnnSupplierNumber: supplierNumber });
    }

    const supplier = await this.prisma.supplier.findFirst({
      where: {
        tenantId,
        ...(orClauses.length ? { OR: orClauses } : {}),
      },
    });

    if (supplier) {
      return supplier;
    }

    return this.prisma.supplier.create({
      data: {
        tenantId,
        name: name ?? `Supplier-${supplierNumber}`,
        bnnSupplierNumber: supplierNumber ?? null,
      },
    });
  }

  private async ensureProduct(
    tenantId: string,
    supplierId: number | null,
    item: ParsedBnnItem,
  ) {
    const existing = await this.prisma.product.findUnique({
      where: {
        tenantId_sku: {
          tenantId,
          sku: item.sku,
        },
      },
    });

    if (existing) {
      return existing;
    }

    return this.prisma.product.create({
      data: {
        tenantId,
        supplierId,
        sku: item.sku,
        name: item.name ?? item.sku,
        unit: item.unit ?? 'pcs',
        defaultPrice: this.toDecimal(item.unitPrice ?? 0),
      },
    });
  }

  private async ensureStorageLocation(tenantId: string, code: string, description?: string) {
    const existing = await this.prisma.storageLocation.findUnique({
      where: {
        tenantId_code: {
          tenantId,
          code,
        },
      },
    });

    if (existing) {
      return existing;
    }

    return this.prisma.storageLocation.create({
      data: {
        tenantId,
        code,
        description: description ?? null,
      },
    });
  }

  private async findProductOrThrow(tenantId: string, sku: string) {
    const product = await this.prisma.product.findUnique({
      where: {
        tenantId_sku: {
          tenantId,
          sku,
        },
      },
    });

    if (!product) {
      throw new NotFoundException(`Produkt ${sku} nicht gefunden.`);
    }

    return product;
  }

  private async findBatch(productId: number, lotNumber: string) {
    return this.prisma.batch.findFirst({
      where: {
        productId,
        lotNumber,
      },
    });
  }

  private toDecimal(value: number | string | Prisma.Decimal | null | undefined) {
    if (value === null || value === undefined) {
      return new Prisma.Decimal(0);
    }

    if (value instanceof Prisma.Decimal) {
      return value;
    }

    return new Prisma.Decimal(value as any);
  }

  private withLowerCaseKeys(input: Record<string, any>) {
    const result: Record<string, any> = { ...input };
    for (const key of Object.keys(input)) {
      result[key.toLowerCase()] = input[key];
    }
    return result;
  }

  private normalizeDateString(value: any) {
    if (!value) {
      return undefined;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return undefined;
    }

    return date.toISOString();
  }
}
