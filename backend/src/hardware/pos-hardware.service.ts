import { Inject, Injectable } from '@nestjs/common';
import type { SalePayload } from '../pos/types/sale-payload';
import {
  BARCODE_SCANNER,
  RECEIPT_PRINTER,
  type BarcodeScannerDriver,
  type ReceiptPrinterDriver,
} from './interfaces';

@Injectable()
export class PosHardwareService {
  constructor(
    @Inject(RECEIPT_PRINTER) private readonly printer: ReceiptPrinterDriver,
    @Inject(BARCODE_SCANNER) private readonly scanner: BarcodeScannerDriver,
  ) {}

  async printReceipt(receipt: SalePayload) {
    await this.printer.print(receipt);
  }

  async awaitScan() {
    return this.scanner.awaitScan();
  }
}
