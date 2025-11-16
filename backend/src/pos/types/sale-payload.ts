import type { PaymentMethod } from '../dto/create-payment.dto';
import type {
  CashEventPayload,
  DeliveryDocumentPayload,
  PreorderSummaryPayload,
} from '../../preorders/preorders.service';

/**
 * Represents a single item within a sale.
 */
export type SaleItemPayload = {
  /** The name of the product. */
  name: string;
  /** The price of a single unit. */
  unitPrice: number;
  /** The quantity of the product sold. */
  quantity: number;
};

/**
 * Represents the digital signature from the fiscalization service.
 */
export type FiscalSignaturePayload = {
  /** The signature value. */
  value?: string;
  /** The serial number of the signing certificate. */
  serialNumber?: string;
  /** The algorithm used for signing. */
  algorithm?: string;
  /** The public key corresponding to the signature. */
  publicKey?: string;
  /** The timestamp of the signature. */
  timestamp?: string;
};

/**
 * Represents the metadata returned from the fiscalization service for a transaction.
 */
export type FiscalMetadataPayload = {
  /** The ID of the fiscal tenant. */
  tenantId: string;
  /** The ID of the Technical Security System (TSS) used. */
  tssId: string;
  /** The ID of the cash register used. */
  cashRegisterId: string;
  /** The unique ID of the fiscal transaction. */
  transactionId: string;
  /** The ID of the client used for the transaction. */
  clientId: string;
  /** Additional process data from the fiscal service. */
  processData?: Record<string, any>;
  /** The digital signature of the transaction. */
  signature?: FiscalSignaturePayload;
  /** The timestamp when the fiscalization process was finished. */
  finishedAt?: string;
};

/**
 * Represents the complete data payload for a sale, including all related information.
 */
export type SalePayload = {
  /** The unique ID of the sale. */
  id: number;
  /** The receipt number for the sale. */
  receiptNo: string;
  /** The payment method used. */
  paymentMethod: PaymentMethod | string;
  /** The total amount of the sale. */
  total: number;
  /** The status of the sale (e.g., 'SUCCESS'). */
  status: string;
  /** The date and time when the sale was created. */
  createdAt: Date;
  /** An array of items included in the sale. */
  items: SaleItemPayload[];
  /** An optional reference, such as a pre-order ID. */
  reference?: string | null;
  /** The ID of the location where the sale occurred. */
  locationId?: string | null;
  /** The fiscalization metadata for the sale, if applicable. */
  fiscalization?: FiscalMetadataPayload;
  /** Associated delivery documents, if any. */
  documents?: DeliveryDocumentPayload[];
  /** Associated cash events, if any. */
  cashEvents?: CashEventPayload[];
  /** A summary of the associated pre-order, if any. */
  preorder?: PreorderSummaryPayload;
  /** Indicates if the sale is a refund and links to the original sale. */
  refundForId?: number | null;
  /** Optional refund reason. */
  refundReason?: string | null;
  /** Optional operator reference for refunds. */
  operatorId?: string | null;
};
