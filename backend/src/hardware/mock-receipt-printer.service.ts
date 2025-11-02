import { Injectable, Logger } from '@nestjs/common';
import type { SalePayload } from '../pos/types/sale-payload';
import type { ReceiptPrinterDriver } from './interfaces';

@Injectable()
export class MockReceiptPrinterService implements ReceiptPrinterDriver {
  private readonly logger = new Logger(MockReceiptPrinterService.name);

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
