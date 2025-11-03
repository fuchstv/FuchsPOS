import api from './client';

export type BnnImportFormat = 'csv' | 'json' | 'xml';

export interface ImportGoodsReceiptPayload {
  tenantId: string;
  format: BnnImportFormat;
  payload: string;
  supplierName?: string;
  supplierNumber?: string;
  fileName?: string;
  reference?: string;
  receivedAt?: string;
  notes?: string;
}

export interface GoodsReceiptImportSource {
  id: number;
  format: string;
  sourceFileName: string | null;
  rawPayload?: string;
  createdAt: string;
}

export interface SupplierSummary {
  id: number;
  name: string | null;
  supplierNumber: string | null;
}

export interface BatchSummary {
  id: number;
  lotNumber: string;
  quantity: string;
  unitCost: string | null;
  expirationDate: string | null;
}

export interface ProductSummary {
  id: number;
  sku: string;
  name: string;
  unit?: string | null;
}

export interface GoodsReceiptItem {
  id: number;
  quantity: string;
  unitCost: string;
  metadata: unknown;
  product: ProductSummary;
  batch: BatchSummary | null;
}

export interface GoodsReceiptResponse {
  id: number;
  tenantId: string;
  supplier: SupplierSummary | null;
  reference: string | null;
  receivedAt: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  items: GoodsReceiptItem[];
  importSources: GoodsReceiptImportSource[];
}

export async function importGoodsReceipt(payload: ImportGoodsReceiptPayload) {
  const { data } = await api.post<GoodsReceiptResponse>('/inventory/goods-receipts/import', payload);
  return data;
}

export interface InventoryCountLineInput {
  productSku: string;
  batchLotNumber?: string;
  expectedQuantity?: number;
  countedQuantity?: number;
}

export interface CreateInventoryCountPayload {
  tenantId: string;
  locationCode?: string;
  locationDescription?: string;
  items?: InventoryCountLineInput[];
}

export interface InventoryCountItem {
  id: number;
  expectedQuantity: string | null;
  countedQuantity: string;
  difference: string;
  product: ProductSummary;
  batch: BatchSummary | null;
}

export interface InventoryCountResponse {
  id: number;
  tenantId: string;
  locationId: number | null;
  status: 'OPEN' | 'COMPLETED';
  startedAt: string;
  completedAt: string | null;
  items: InventoryCountItem[];
}

export async function createInventoryCount(payload: CreateInventoryCountPayload) {
  const { data } = await api.post<InventoryCountResponse>('/inventory/counts', payload);
  return data;
}

export interface FinalizeInventoryCountLineInput {
  id?: number;
  productSku: string;
  batchLotNumber?: string;
  countedQuantity: number;
  adjustmentReason?: string;
}

export interface FinalizeInventoryCountPayload {
  tenantId: string;
  bookDifferences?: boolean;
  defaultAdjustmentReason?: string;
  items?: FinalizeInventoryCountLineInput[];
}

export interface InventoryAdjustmentSummary {
  id: number;
  productId: number;
  batchId: number | null;
  quantityChange: string;
  reason: string | null;
  createdAt: string;
  product?: ProductSummary;
  batch?: BatchSummary | null;
}

export interface FinalizeInventoryCountResponse extends InventoryCountResponse {
  adjustments: InventoryAdjustmentSummary[];
  updatedItems: InventoryCountItem[];
}

export async function finalizeInventoryCount(id: number, payload: FinalizeInventoryCountPayload) {
  const { data } = await api.post<FinalizeInventoryCountResponse>(`/inventory/counts/${id}/finalize`, payload);
  return data;
}

export interface PromotionInput {
  name: string;
  description?: string;
  startsAt?: string;
  endsAt?: string;
}

export interface RecordPriceChangePayload {
  tenantId: string;
  productSku: string;
  newPrice: number;
  reason?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  promotion?: PromotionInput;
}

export interface PriceHistoryEntry {
  id: number;
  tenantId: string;
  productId: number;
  oldPrice: string;
  newPrice: string;
  reason: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  promotionId: number | null;
  createdAt: string;
}

export interface PriceChangeResponse {
  product: ProductSummary & {
    description?: string | null;
    defaultPrice?: string;
    supplier?: SupplierSummary | null;
  };
  priceHistory: PriceHistoryEntry;
  promotion: (PromotionInput & { id: number }) | null;
}

export async function recordPriceChange(payload: RecordPriceChangePayload) {
  const { data } = await api.post<PriceChangeResponse>('/inventory/price-changes', payload);
  return data;
}
