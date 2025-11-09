import { Injectable, Logger } from '@nestjs/common';
import type { BarcodeScannerDriver } from './interfaces';

/**
 * A mock implementation of a barcode scanner driver.
 *
 * This service simulates waiting for a barcode scan and returns a fixed mock code.
 * It is intended for development and testing purposes.
 */
@Injectable()
export class MockScannerService implements BarcodeScannerDriver {
  private readonly logger = new Logger(MockScannerService.name);

  /**
   * Simulates awaiting a barcode scan.
   *
   * @returns A promise that resolves with a mock barcode.
   */
  async awaitScan(): Promise<string> {
    this.logger.log('Mock-Scanner: Warte auf Scan-Ereignis (Rückgabewert simuliert).');
    return 'MOCK-SCAN-CODE';
  }
}
