import type { PaymentMethod } from '../dto/create-payment.dto';

export type SaleItemPayload = {
  name: string;
  unitPrice: number;
  quantity: number;
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
};
