import { Injectable, Logger } from '@nestjs/common';
import type { BarcodeScannerDriver } from './interfaces';

@Injectable()
export class MockScannerService implements BarcodeScannerDriver {
  private readonly logger = new Logger(MockScannerService.name);

  async awaitScan(): Promise<string> {
    this.logger.log('Mock-Scanner: Warte auf Scan-Ereignis (Rückgabewert simuliert).');
    return 'MOCK-SCAN-CODE';
  }
}
