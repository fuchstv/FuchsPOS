/**
 * Represents the input structure for a single item within a pre-order.
 */
export type PreorderItemInput = {
  /** The name of the product. */
  name: string;
  /** The quantity of the product. */
  quantity: number;
  /** The price of a single unit of the product. */
  unitPrice?: number;
  /** The stock keeping unit (SKU) of the product. */
  sku?: string;
};

/**
 * Represents the payload for synchronizing an order from Wolt.
 */
export type WoltOrderSyncPayload = {
  /** The unique external ID of the Wolt order. */
  externalId: string;
  /** The status of the order from Wolt. */
  status: string;
  /** A human-readable label for the status. */
  statusLabel?: string;
  /** The name of the customer. */
  customerName?: string | null;
  /** The scheduled pickup time in ISO 8601 format. */
  scheduledPickup?: string | null;
  /** An array of items included in the order. */
  items: PreorderItemInput[];
  /** The ID of the tenant associated with the order. */
  tenantId?: string | null;
  /** The raw, unprocessed payload received from Wolt. */
  rawPayload: unknown;
};
