import type { AxiosError } from 'axios';

/**
 * Represents an item available for sale in the product catalog.
 */
export type CatalogItem = {
  /** The unique identifier for the product. */
  id: string;
  /** The display name of the product. */
  name: string;
  /** The price of a single unit of the product. */
  price: number;
  /** The category the product belongs to. */
  category: 'Beverage' | 'Food' | 'Merch';
  /** Optional EAN/GTIN for barcode scans. */
  ean?: string | null;
};

/**
 * Represents an item that has been added to the shopping cart.
 */
export type CartItem = {
  /** The ID of the product, corresponding to a `CatalogItem`. */
  id: string;
  /** The number of units of this product in the cart. */
  quantity: number;
};

/**
 * Defines the available payment methods.
 */
export type PaymentMethod = 'CARD' | 'CASH' | 'VOUCHER' | 'MOBILE';

/**
 * Defines the properties and behavior of a payment method.
 */
export type PaymentMethodDefinition = {
  /** The type of the payment method. */
  type: PaymentMethod;
  /** The human-readable label for the payment method. */
  label: string;
  /** A short description of the payment method. */
  description: string;
  /** Indicates whether this payment method can be used in offline mode. */
  supportsOffline: boolean;
};

/**
 * Represents the possible states of a payment transaction.
 */
export type PaymentState = 'idle' | 'processing' | 'success' | 'error' | 'queued';

/**
 * Represents a single line item within a payment request or sale record.
 */
export type PaymentLineItem = {
  /** The name of the product. */
  name: string;
  /** The price per unit at the time of the transaction. */
  unitPrice: number;
  /** The quantity of the product being purchased. */
  quantity: number;
};

/**
 * Defines the payload for creating a new payment request.
 */
export type PaymentRequestPayload = {
  /** The list of items being purchased. */
  items: PaymentLineItem[];
  /** The selected payment method. */
  paymentMethod: PaymentMethod;
  /** An optional reference for the payment (e.g., invoice number). */
  reference?: string;
  /** An optional customer email for sending a digital receipt. */
  customerEmail?: string;
  /** The unique identifier of the POS terminal making the request. */
  terminalId: string;
};

/**
 * Defines the possible statuses for a payment intent stored in the offline queue.
 */
export type PaymentIntentStatus = 'pending' | 'failed' | 'conflict';

/**
 * Describes a conflict that occurred during the synchronization of an offline payment.
 */
export type PaymentConflict = {
  /** The type of conflict detected. */
  type: 'duplicate-sale' | 'unknown';
  /** A human-readable message describing the conflict. */
  message: string;
  /** The timestamp when the conflict was detected. */
  detectedAt: string;
  /** The ID of the sale that caused the conflict, if available. */
  saleId?: number;
  /** The receipt number of the conflicting sale, if available. */
  receiptNo?: string;
  /** Indicates whether the conflict has been manually resolved. */
  resolved?: boolean;
};

/**
 * Represents a payment transaction that is queued for processing, typically in offline mode.
 */
export type PaymentIntent = {
  /** A unique identifier for the queued payment. */
  id: string;
  /** The original payload of the payment request. */
  payload: PaymentRequestPayload;
  /** The timestamp when the payment was created. */
  createdAt: string;
  /** The current status of the queued payment. */
  status: PaymentIntentStatus;
  /** Any error message associated with the last processing attempt. */
  error?: string;
  /** The number of times a retry has been attempted. */
  retryCount: number;
  /** The timestamp of the last attempt to process this payment. */
  lastAttemptAt?: string;
  /** The scheduled time for the next retry attempt. */
  nextRetryAt?: string;
  /** Details about any conflict that occurred during processing. */
  conflict?: PaymentConflict;
};

/**
 * Defines the types of delivery documents that can be associated with a sale or preorder.
 */
export type DeliveryDocumentType = 'DELIVERY_NOTE' | 'PICKUP_RECEIPT';

/**
 * Represents a delivery-related document.
 */
export type DeliveryDocument = {
  id: number;
  type: DeliveryDocumentType;
  documentNumber: string;
  createdAt: string;
  updatedAt: string;
  payload: Record<string, unknown>;
};

/**
 * Defines the types of events that can occur at the cash register.
 */
export type CashEventType = 'SALE_COMPLETED' | 'PREORDER_READY' | 'PREORDER_PICKED_UP';

/**
 * Represents a recorded event related to cash register operations.
 */
export type CashEventRecord = {
  id: number;
  type: CashEventType;
  createdAt: string;
  metadata?: Record<string, unknown>;
  sale?: { id: number; receiptNo: string } | null;
  preorder?: { id: number; externalReference: string } | null;
};

/**
 * Represents the result of a cash closing (X- or Z-Bon).
 */
export type CashClosingRecord = {
  id: number;
  type: 'X' | 'Z';
  fromDate: string;
  toDate: string;
  createdAt: string;
  saleCount: number;
  totalGross: number;
  paymentMethods: Record<string, { total: number; count: number }>;
};

/**
 * Defines the possible statuses of a preorder.
 */
export type PreorderStatus = 'ORDERED' | 'READY' | 'PICKED_UP';

/**
 * Represents an entry in the status history of a preorder.
 */
export type PreorderStatusHistory = {
  id: number;
  status: PreorderStatus;
  createdAt: string;
  notes?: string | null;
};

/**
 * Provides a summary view of a preorder.
 */
export type PreorderSummary = {
  id: number;
  externalReference: string;
  status: PreorderStatus;
  customerName?: string | null;
  scheduledPickup?: string | null;
  sale?: { id: number; receiptNo: string | null } | null;
};

/**
 * Represents a single item within a preorder.
 */
export type PreorderItem = {
  name: string;
  quantity: number;
  unitPrice?: number;
  sku?: string;
};

/**
 * Represents a full preorder record, including all its details.
 */
export type PreorderRecord = PreorderSummary & {
  /** The list of items included in the preorder. */
  items: PreorderItem[];
  /** Any delivery documents associated with the preorder. */
  documents: DeliveryDocument[];
  /** The history of status changes for the preorder. */
  statusHistory: PreorderStatusHistory[];
};

/**
 * Represents a completed sale transaction.
 */
export type SaleRecord = {
  id: number;
  receiptNo: string;
  paymentMethod: PaymentMethod;
  total: number;
  status: string;
  createdAt: string;
  items: PaymentLineItem[];
  reference?: string | null;
  /** Fiscalization data required for legal compliance (e.g., TSE in Germany). */
  fiscalization?: {
    tenantId: string;
    tssId: string;
    cashRegisterId: string;
    transactionId: string;
    clientId: string;
    processData?: Record<string, unknown>;
    signature?: {
      value?: string;
      serialNumber?: string;
      algorithm?: string;
      publicKey?: string;
      timestamp?: string;
    };
    finishedAt?: string;
  };
  documents?: DeliveryDocument[];
  cashEvents?: CashEventRecord[];
  preorder?: PreorderSummary | null;
};

/**
 * Defines the structure of the API response for a successful payment.
 */
export type SaleResponse = {
  /** A confirmation message. */
  message: string;
  /** The details of the completed sale. */
  sale: SaleRecord;
};

/**
 * Represents a generic API error, extending AxiosError for more specific details.
 */
export type ApiError = AxiosError<{ message?: string }> | Error;

/**
 * Represents the calculated totals for a shopping cart.
 */
export type CartTotals = {
  /** The total price of all items before tax. */
  net: number;
  /** The total amount of tax for the items in the cart. */
  tax: number;
  /** The final price including tax. */
  gross: number;
};
