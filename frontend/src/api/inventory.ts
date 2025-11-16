import api from './client';

/**
 * Defines the supported formats for BNN document imports.
 */
export type BnnImportFormat = 'csv' | 'json' | 'xml';

/**
 * Payload for importing a goods receipt from a BNN document.
 */
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

/**
 * Information about the source of a goods receipt import.
 */
export interface GoodsReceiptImportSource {
  id: number;
  format: string;
  sourceFileName: string | null;
  rawPayload?: string;
  createdAt: string;
}

/**
 * A summary of a supplier.
 */
export interface SupplierSummary {
  id: number;
  name: string | null;
  supplierNumber: string | null;
}

/**
 * A summary of a product batch.
 */
export interface BatchSummary {
  id: number;
  lotNumber: string;
  quantity: string;
  unitCost: string | null;
  expirationDate: string | null;
}

/**
 * A summary of a product.
 */
export interface ProductSummary {
  id: number;
  sku: string;
  name: string;
  unit?: string | null;
  ean?: string | null;
}

/**
 * An item within a goods receipt.
 */
export interface GoodsReceiptItem {
  id: number;
  quantity: string;
  unitCost: string;
  metadata: unknown;
  product: ProductSummary;
  batch: BatchSummary | null;
}

/**
 * The response object for a goods receipt.
 */
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

/**
 * Imports a goods receipt from a BNN document.
 * @param payload - The data for the import.
 * @returns A promise that resolves to the created goods receipt.
 */
export async function importGoodsReceipt(payload: ImportGoodsReceiptPayload) {
  const { data } = await api.post<GoodsReceiptResponse>('/inventory/goods-receipts/import', payload);
  return data;
}

export interface ProductSupplierSummary {
  id: number;
  name: string;
  supplierNumber: string | null;
}

export interface ProductRecord {
  id: number;
  tenantId: string;
  sku: string;
  ean: string | null;
  name: string;
  unit: string;
  defaultPrice: string;
  supplierId: number | null;
  createdAt: string;
  updatedAt: string;
  supplier: ProductSupplierSummary | null;
}

export interface ListProductsParams {
  tenantId: string;
  search?: string;
  skip?: number;
  take?: number;
}

export interface ListProductsResponse {
  total: number;
  skip: number;
  take: number;
  items: ProductRecord[];
}

export async function listProducts(params: ListProductsParams) {
  const { data } = await api.get<ListProductsResponse>('/inventory/products', { params });
  return data;
}

export interface ImportProductInput {
  sku: string;
  ean?: string | null;
  name: string;
  unit?: string;
  defaultPrice?: number;
  supplierName?: string;
  supplierNumber?: string;
}

export interface ImportProductCatalogPayload {
  tenantId: string;
  items: ImportProductInput[];
}

export interface ImportProductCatalogResponse {
  summary: {
    created: number;
    updated: number;
    total: number;
  };
  created: ProductRecord[];
  updated: ProductRecord[];
}

export async function importProductCatalog(payload: ImportProductCatalogPayload) {
  const { data } = await api.post<ImportProductCatalogResponse>('/inventory/products/import', payload);
  return data;
}

export interface UpdateProductPayload {
  tenantId: string;
  sku?: string;
  ean?: string | null;
  name?: string;
  unit?: string;
  defaultPrice?: number;
  supplierName?: string;
  supplierNumber?: string;
}

export async function updateProduct(productId: number, payload: UpdateProductPayload) {
  const { data } = await api.patch<ProductRecord>(`/inventory/products/${productId}`, payload);
  return data;
}

/**
 * Input for a single line in an inventory count.
 */
export interface InventoryCountLineInput {
  productSku: string;
  batchLotNumber?: string;
  expectedQuantity?: number;
  countedQuantity?: number;
}

/**
 * Payload for creating a new inventory count.
 */
export interface CreateInventoryCountPayload {
  tenantId: string;
  locationCode?: string;
  locationDescription?: string;
  items?: InventoryCountLineInput[];
}

/**
 * An item within an inventory count.
 */
export interface InventoryCountItem {
  id: number;
  expectedQuantity: string | null;
  countedQuantity: string;
  difference: string;
  product: ProductSummary;
  batch: BatchSummary | null;
}

/**
 * The response object for an inventory count.
 */
export interface InventoryCountResponse {
  id: number;
  tenantId: string;
  locationId: number | null;
  status: 'OPEN' | 'COMPLETED';
  startedAt: string;
  completedAt: string | null;
  items: InventoryCountItem[];
}

/**
 * Creates a new inventory count.
 * @param payload - The data for the new inventory count.
 * @returns A promise that resolves to the created inventory count.
 */
export async function createInventoryCount(payload: CreateInventoryCountPayload) {
  const { data } = await api.post<InventoryCountResponse>('/inventory/counts', payload);
  return data;
}

/**
 * Input for a single line when finalizing an inventory count.
 */
export interface FinalizeInventoryCountLineInput {
  id?: number;
  productSku: string;
  batchLotNumber?: string;
  countedQuantity: number;
  adjustmentReason?: string;
}

/**
 * Payload for finalizing an inventory count.
 */
export interface FinalizeInventoryCountPayload {
  tenantId: string;
  bookDifferences?: boolean;
  defaultAdjustmentReason?: string;
  items?: FinalizeInventoryCountLineInput[];
}

/**
 * A summary of an inventory adjustment.
 */
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

/**
 * The response object when finalizing an inventory count.
 */
export interface FinalizeInventoryCountResponse extends InventoryCountResponse {
  adjustments: InventoryAdjustmentSummary[];
  updatedItems: InventoryCountItem[];
}

/**
 * Finalizes an inventory count.
 * @param id - The ID of the inventory count to finalize.
 * @param payload - The data for finalizing the count.
 * @returns A promise that resolves to the finalized inventory count response.
 */
export async function finalizeInventoryCount(id: number, payload: FinalizeInventoryCountPayload) {
  const { data } = await api.post<FinalizeInventoryCountResponse>(`/inventory/counts/${id}/finalize`, payload);
  return data;
}

/**
 * Input for creating a promotion.
 */
export interface PromotionInput {
  name: string;
  description?: string;
  startsAt?: string;
  endsAt?: string;
}

/**
 * Payload for recording a price change.
 */
export interface RecordPriceChangePayload {
  tenantId: string;
  productSku: string;
  newPrice: number;
  reason?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  promotion?: PromotionInput;
}

/**
 * A historical record of a price change.
 */
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

/**
 * The response object for a price change.
 */
export interface PriceChangeResponse {
  product: ProductSummary & {
    description?: string | null;
    defaultPrice?: string;
    supplier?: SupplierSummary | null;
  };
  priceHistory: PriceHistoryEntry;
  promotion: (PromotionInput & { id: number }) | null;
}

/**
 * Records a price change for a product.
 * @param payload - The data for the price change.
 * @returns A promise that resolves to the price change response.
 */
export async function recordPriceChange(payload: RecordPriceChangePayload) {
  const { data } = await api.post<PriceChangeResponse>('/inventory/price-changes', payload);
  return data;
}
