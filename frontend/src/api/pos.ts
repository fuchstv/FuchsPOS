import type { AxiosResponse } from 'axios';
import api from './client';
import type {
  CashEventRecord,
  CreateTableTabPayload,
  TableTabRecord,
  UpdateTableTabPayload,
} from '../store/types';

export function fetchReceiptDocument(
  saleId: number,
  format: 'pdf' | 'html',
): Promise<AxiosResponse<Blob>> {
  return api.get<Blob>(`/pos/receipts/${saleId}/download`, {
    params: { format },
    responseType: 'blob',
  });
}

export function listPosTables() {
  return api.get<{ tables: TableTabRecord[] }>(`/pos/tables`);
}

export function createPosTable(payload: CreateTableTabPayload) {
  return api.post<{ table: TableTabRecord }>(`/pos/tables`, payload);
}

export function updatePosTable(id: number, payload: UpdateTableTabPayload) {
  return api.patch<{ table: TableTabRecord }>(`/pos/tables/${id}`, payload);
}

export function closePosTable(id: number) {
  return api.post<{ table: TableTabRecord }>(`/pos/tables/${id}/close`);
}

export type CashAdjustmentRequest = {
  tenantId: string;
  amount: number;
  reason: string;
  operatorId: string;
};

export function createCashDepositEvent(payload: CashAdjustmentRequest) {
  return api.post<{ event: CashEventRecord }>(`/pos/cash-events/deposit`, payload);
}

export function createCashWithdrawalEvent(payload: CashAdjustmentRequest) {
  return api.post<{ event: CashEventRecord }>(`/pos/cash-events/withdrawal`, payload);
}
