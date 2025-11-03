import type { AxiosError } from 'axios';

export type CatalogItem = {
  id: string;
  name: string;
  price: number;
  category: 'Beverage' | 'Food' | 'Merch';
};

export type CartItem = {
  id: string;
  quantity: number;
};

export type PaymentMethod = 'CARD' | 'CASH' | 'VOUCHER' | 'MOBILE';

export type PaymentMethodDefinition = {
  type: PaymentMethod;
  label: string;
  description: string;
  supportsOffline: boolean;
};

export type PaymentState = 'idle' | 'processing' | 'success' | 'error' | 'queued';

export type PaymentLineItem = {
  name: string;
  unitPrice: number;
  quantity: number;
};

export type PaymentRequestPayload = {
  items: PaymentLineItem[];
  paymentMethod: PaymentMethod;
  reference?: string;
  customerEmail?: string;
  terminalId: string;
};

export type PaymentIntentStatus = 'pending' | 'failed' | 'conflict';

export type PaymentConflict = {
  type: 'duplicate-sale' | 'unknown';
  message: string;
  detectedAt: string;
  saleId?: number;
  receiptNo?: string;
  resolved?: boolean;
};

export type PaymentIntent = {
  id: string;
  payload: PaymentRequestPayload;
  createdAt: string;
  status: PaymentIntentStatus;
  error?: string;
  retryCount: number;
  lastAttemptAt?: string;
  nextRetryAt?: string;
  conflict?: PaymentConflict;
};

export type DeliveryDocumentType = 'DELIVERY_NOTE' | 'PICKUP_RECEIPT';

export type DeliveryDocument = {
  id: number;
  type: DeliveryDocumentType;
  documentNumber: string;
  createdAt: string;
  updatedAt: string;
  payload: Record<string, unknown>;
};

export type CashEventType = 'SALE_COMPLETED' | 'PREORDER_READY' | 'PREORDER_PICKED_UP';

export type CashEventRecord = {
  id: number;
  type: CashEventType;
  createdAt: string;
  metadata?: Record<string, unknown>;
  sale?: { id: number; receiptNo: string } | null;
  preorder?: { id: number; externalReference: string } | null;
};

export type PreorderStatus = 'ORDERED' | 'READY' | 'PICKED_UP';

export type PreorderStatusHistory = {
  id: number;
  status: PreorderStatus;
  createdAt: string;
  notes?: string | null;
};

export type PreorderSummary = {
  id: number;
  externalReference: string;
  status: PreorderStatus;
  customerName?: string | null;
  scheduledPickup?: string | null;
  sale?: { id: number; receiptNo: string | null } | null;
};

export type PreorderItem = {
  name: string;
  quantity: number;
  unitPrice?: number;
  sku?: string;
};

export type PreorderRecord = PreorderSummary & {
  items: PreorderItem[];
  documents: DeliveryDocument[];
  statusHistory: PreorderStatusHistory[];
};

export type SaleRecord = {
  id: number;
  receiptNo: string;
  paymentMethod: PaymentMethod;
  total: number;
  status: string;
  createdAt: string;
  items: PaymentLineItem[];
  reference?: string | null;
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

export type SaleResponse = {
  message: string;
  sale: SaleRecord;
};

export type ApiError = AxiosError<{ message?: string }> | Error;

export type CartTotals = {
  net: number;
  tax: number;
  gross: number;
};
