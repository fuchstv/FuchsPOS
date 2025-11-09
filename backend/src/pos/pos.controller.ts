import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { PosService } from './pos.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { SyncCartDto } from './dto/sync-cart.dto';
import { EmailReceiptDto } from './dto/email-receipt.dto';

/**
 * Controller for Point of Sale (POS) operations.
 */
@Controller('pos')
export class PosController {
  constructor(private readonly posService: PosService) {}

  /**
   * Synchronizes the state of a shopping cart.
   * @param dto - The data for cart synchronization.
   * @returns A promise that resolves to the result of the sync operation.
   */
  @Post('cart/sync')
  syncCart(@Body() dto: SyncCartDto) {
    return this.posService.syncCart(dto);
  }

  /**
   * Processes a payment for a sale.
   * @param dto - The payment details.
   * @returns A promise that resolves to the completed sale.
   */
  @Post('payments')
  processPayment(@Body() dto: CreatePaymentDto) {
    return this.posService.processPayment(dto);
  }

  /**
   * Simulates a payment process without actual fiscalization or persistence.
   * @param dto - The payment details.
   * @returns A promise that resolves to the simulated sale data.
   */
  @Post('payments/simulate')
  simulatePayment(@Body() dto: CreatePaymentDto) {
    return this.posService.simulatePayment(dto);
  }

  /**
   * Sends a receipt to a customer via email.
   * @param dto - The data for sending the email receipt.
   * @returns A promise that resolves when the email is sent.
   */
  @Post('receipts/email')
  sendReceiptByEmail(@Body() dto: EmailReceiptDto) {
    return this.posService.sendReceiptEmail(dto);
  }

  /**
   * Lists all open pre-orders.
   * @returns A promise that resolves to a list of pre-orders.
   */
  @Get('preorders')
  listPreorders() {
    return this.posService.listPreorders();
  }

  /**
   * Lists recent cash events.
   * @param limit - The maximum number of events to return.
   * @returns A promise that resolves to a list of cash events.
   */
  @Get('cash-events')
  listCashEvents(@Query('limit') limit?: string) {
    const parsed = limit ? Number(limit) : undefined;
    const take = parsed && !Number.isNaN(parsed) ? parsed : undefined;
    return this.posService.listCashEvents(take);
  }
}
