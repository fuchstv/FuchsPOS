import type { AxiosResponse } from 'axios';
import api from './client';

export function fetchReceiptDocument(
  saleId: number,
  format: 'pdf' | 'html',
): Promise<AxiosResponse<Blob>> {
  return api.get<Blob>(`/pos/receipts/${saleId}/download`, {
    params: { format },
    responseType: 'blob',
  });
}
