import { Injectable, Logger } from '@nestjs/common';
import type { CreatePaymentDto } from '../pos/dto/create-payment.dto';
import type { SaleItemPayload } from '../pos/types/sale-payload';
import { FiscalManagementService } from './fiscal-management.service';
import { FiskalyClientService } from './fiskaly-client.service';
import type { FiscalMetadataPayload } from '../pos/types/sale-payload';

const VAT_RATE = 0.07;

/**
 * Service for handling the fiscalization of receipts.
 */
@Injectable()
export class FiscalizationService {
  private readonly logger = new Logger(FiscalizationService.name);

  constructor(
    private readonly management: FiscalManagementService,
    private readonly fiskaly: FiskalyClientService,
  ) {}

  /**
   * Registers a receipt with the fiscalization service (Fiskaly).
   *
   * @param receiptNo - The receipt number.
   * @param dto - The payment data.
   * @param total - The total amount of the sale.
   * @returns A promise that resolves to the fiscal metadata, or undefined if fiscalization is not active.
   */
  async registerReceipt(
    receiptNo: string,
    dto: CreatePaymentDto,
    total: number,
  ): Promise<FiscalMetadataPayload | undefined> {
    const context = await this.management.getActiveContext();
    if (!context) {
      return undefined;
    }

    const items: SaleItemPayload[] = dto.items.map(item => ({
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    }));

    try {
      const startResponse = await this.fiskaly.startTransaction(context.tss.id, {
        type: 'RECEIPT',
        client_id: context.tenant.fiskalyClientId,
        cash_register_id: context.cashRegister.id,
      });

      const transactionId = startResponse.id;
      const schema = this.buildReceiptSchema(receiptNo, dto.paymentMethod, total, items);

      await this.fiskaly.updateTransaction(context.tss.id, transactionId, {
        schema: { standard_v1: schema },
      });

      const finishResponse = await this.fiskaly.finishTransaction(context.tss.id, transactionId, {});

      return {
        tenantId: context.tenant.id,
        tssId: context.tss.id,
        cashRegisterId: context.cashRegister.id,
        transactionId,
        clientId: context.tenant.fiskalyClientId,
        processData: {
          number: finishResponse.number ?? startResponse.number,
          timeStart: finishResponse.time_start ?? startResponse.time_start,
          timeEnd: finishResponse.time_end ?? finishResponse.time_start,
          state: finishResponse.state ?? startResponse.state,
        },
        signature: finishResponse.signature
          ? {
              value: finishResponse.signature.value,
              serialNumber: finishResponse.signature.serial_number,
              algorithm: finishResponse.signature.algorithm,
              publicKey: finishResponse.signature.public_key,
              timestamp: finishResponse.time_end ?? finishResponse.time_start,
            }
          : undefined,
        finishedAt: finishResponse.time_end ?? finishResponse.time_start,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Fiskalisierung fehlgeschlagen: ${message}`, error instanceof Error ? error.stack : undefined);
      throw error;
    }
  }

  /**
   * Builds the receipt schema for the Fiskaly API.
   *
   * @param receiptNo - The receipt number.
   * @param paymentMethod - The payment method.
   * @param total - The total amount of the sale.
   * @param items - The items included in the sale.
   * @returns The receipt schema.
   */
  private buildReceiptSchema(
    receiptNo: string,
    paymentMethod: string,
    total: number,
    items: SaleItemPayload[],
  ) {
    const gross = Number(total.toFixed(2));
    const net = Number((gross / (1 + VAT_RATE)).toFixed(2));
    const tax = Number((gross - net).toFixed(2));

    return {
      receipt: {
        receipt_number: receiptNo,
        receipt_date: new Date().toISOString(),
        amounts_per_vat_rate: [
          {
            vat_rate: Number((VAT_RATE * 100).toFixed(2)),
            amount: gross,
            amount_net: Number((gross - tax).toFixed(2)),
            amount_tax: tax,
          },
        ],
        payments: [
          {
            type: this.mapPaymentMethod(paymentMethod),
            amount: gross,
          },
        ],
        items: items.map(item => ({
          text: item.name,
          amount: Number((item.unitPrice * item.quantity).toFixed(2)),
          quantity: item.quantity,
        })),
      },
    };
  }

  /**
   * Maps a payment method to the corresponding Fiskaly payment type.
   *
   * @param method - The payment method.
   * @returns The Fiskaly payment type.
   */
  private mapPaymentMethod(method: string) {
    switch (method) {
      case 'CASH':
        return 'CASH';
      case 'CARD':
        return 'CARD';
      case 'VOUCHER':
        return 'VOUCHER';
      default:
        return 'NON_CASH';
    }
  }
}
