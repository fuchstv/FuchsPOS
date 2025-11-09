import { Injectable, Logger } from '@nestjs/common';
import type { SalePayload } from '../pos/types/sale-payload';
import type { ReceiptPrinterDriver } from './interfaces';

/**
 * A mock implementation of a receipt printer driver.
 *
 * This service simulates printing a receipt by logging its contents to the console.
 * It is intended for development and testing purposes.
 */
@Injectable()
export class MockReceiptPrinterService implements ReceiptPrinterDriver {
  private readonly logger = new Logger(MockReceiptPrinterService.name);

  /**
   * Simulates printing a receipt by logging its details to the console.
   *
   * @param receipt - The sale payload representing the receipt to be printed.
   * @returns A promise that resolves when the logging is complete.
   */
  async print(receipt: SalePayload): Promise<void> {
    this.logger.log(
      `Mock-Drucker: Bon ${receipt.receiptNo} über ${receipt.total.toFixed(2)} EUR wird ausgegeben`,
    );

    if (receipt.fiscalization) {
      this.logger.debug(
        `TSS-Daten – Mandant: ${receipt.fiscalization.tenantId}, TSS: ${receipt.fiscalization.tssId}, Transaktion: ${receipt.fiscalization.transactionId}`,
      );
      if (receipt.fiscalization.signature?.value) {
        this.logger.debug(`Signatur: ${receipt.fiscalization.signature.value}`);
      }
    }
  }
}
