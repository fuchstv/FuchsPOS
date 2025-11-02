export type PreorderItemInput = {
  name: string;
  quantity: number;
  unitPrice?: number;
  sku?: string;
};

export type WoltOrderSyncPayload = {
  externalId: string;
  status: string;
  statusLabel?: string;
  customerName?: string | null;
  scheduledPickup?: string | null;
  items: PreorderItemInput[];
  tenantId?: string | null;
  rawPayload: unknown;
};
