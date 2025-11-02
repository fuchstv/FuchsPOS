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

export type PaymentIntentStatus = 'pending' | 'failed';

export type PaymentIntent = {
  id: string;
  payload: PaymentRequestPayload;
  createdAt: string;
  status: PaymentIntentStatus;
  error?: string;
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
