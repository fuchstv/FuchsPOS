import type { PaymentMethod } from '../dto/create-payment.dto';
import type {
  CashEventPayload,
  DeliveryDocumentPayload,
  PreorderSummaryPayload,
} from '../../preorders/preorders.service';

export type SaleItemPayload = {
  name: string;
  unitPrice: number;
  quantity: number;
};

export type FiscalSignaturePayload = {
  value?: string;
  serialNumber?: string;
  algorithm?: string;
  publicKey?: string;
  timestamp?: string;
};

export type FiscalMetadataPayload = {
  tenantId: string;
  tssId: string;
  cashRegisterId: string;
  transactionId: string;
  clientId: string;
  processData?: Record<string, any>;
  signature?: FiscalSignaturePayload;
  finishedAt?: string;
};

export type SalePayload = {
  id: number;
  receiptNo: string;
  paymentMethod: PaymentMethod | string;
  total: number;
  status: string;
  createdAt: Date;
  items: SaleItemPayload[];
  reference?: string | null;
  fiscalization?: FiscalMetadataPayload;
  documents?: DeliveryDocumentPayload[];
  cashEvents?: CashEventPayload[];
  preorder?: PreorderSummaryPayload;
};
