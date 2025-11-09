import { Inject, Injectable } from '@nestjs/common';
import type { SalePayload } from '../pos/types/sale-payload';
import {
  BARCODE_SCANNER,
  RECEIPT_PRINTER,
  type BarcodeScannerDriver,
  type ReceiptPrinterDriver,
} from './interfaces';

/**
 * Service for interacting with POS hardware devices.
 *
 * This service provides a unified interface for controlling hardware
 * like receipt printers and barcode scanners, using the injected drivers.
 */
@Injectable()
export class PosHardwareService {
  constructor(
    @Inject(RECEIPT_PRINTER) private readonly printer: ReceiptPrinterDriver,
    @Inject(BARCODE_SCANNER) private readonly scanner: BarcodeScannerDriver,
  ) {}

  /**
   * Prints a receipt using the configured receipt printer driver.
   *
   * @param receipt - The sale payload to be printed.
   * @returns A promise that resolves when the receipt has been printed.
   */
  async printReceipt(receipt: SalePayload) {
    await this.printer.print(receipt);
  }

  /**
   * Awaits a barcode scan from the configured barcode scanner driver.
   *
   * @returns A promise that resolves with the scanned barcode string.
   */
  async awaitScan() {
    return this.scanner.awaitScan();
  }
}
