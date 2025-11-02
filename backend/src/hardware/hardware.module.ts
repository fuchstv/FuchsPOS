import { Module } from '@nestjs/common';
import {
  BARCODE_SCANNER,
  RECEIPT_PRINTER,
} from './interfaces';
import { MockReceiptPrinterService } from './mock-receipt-printer.service';
import { MockScannerService } from './mock-scanner.service';
import { PosHardwareService } from './pos-hardware.service';

@Module({
  providers: [
    MockReceiptPrinterService,
    MockScannerService,
    PosHardwareService,
    { provide: RECEIPT_PRINTER, useExisting: MockReceiptPrinterService },
    { provide: BARCODE_SCANNER, useExisting: MockScannerService },
  ],
  exports: [PosHardwareService],
})
export class HardwareModule {}
