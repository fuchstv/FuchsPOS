import type { SalePayload } from '../pos/types/sale-payload';

export interface ReceiptPrinterDriver {
  print(receipt: SalePayload): Promise<void>;
}

export interface BarcodeScannerDriver {
  awaitScan(): Promise<string>;
}

export const RECEIPT_PRINTER = 'RECEIPT_PRINTER_DRIVER';
export const BARCODE_SCANNER = 'BARCODE_SCANNER_DRIVER';
