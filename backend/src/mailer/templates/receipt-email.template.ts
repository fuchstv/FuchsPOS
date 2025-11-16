import type { SalePayload } from '../../pos/types/sale-payload';
import { createReceiptViewModel, renderReceiptHtml, ReceiptTemplateOptions } from './receipt-renderer';

export function renderReceiptEmail(sale: SalePayload, options?: ReceiptTemplateOptions) {
  const viewModel = createReceiptViewModel(sale, options);
  const subject = `${viewModel.businessName} – Ihr digitaler Beleg ${sale.receiptNo}`;
  const html = renderReceiptHtml(viewModel);

  return { subject, html };
}
