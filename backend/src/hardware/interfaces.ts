import type { SalePayload } from '../pos/types/sale-payload';

/**
 * Interface for a receipt printer driver.
 */
export interface ReceiptPrinterDriver {
  /**
   * Prints a receipt.
   * @param receipt - The sale payload to print.
   * @returns A promise that resolves when the receipt is printed.
   */
  print(receipt: SalePayload): Promise<void>;
}

/**
 * Interface for a barcode scanner driver.
 */
export interface BarcodeScannerDriver {
  /**
   * Awaits a barcode scan.
   * @returns A promise that resolves with the scanned barcode.
   */
  awaitScan(): Promise<string>;
}

/**
 * Injection token for the receipt printer driver.
 */
export const RECEIPT_PRINTER = 'RECEIPT_PRINTER_DRIVER';

/**
 * Injection token for the barcode scanner driver.
 */
export const BARCODE_SCANNER = 'BARCODE_SCANNER_DRIVER';
