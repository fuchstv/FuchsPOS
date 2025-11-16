import { BadRequestException, Body, Controller, Get, Param, ParseIntPipe, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PosService } from './pos.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { SyncCartDto } from './dto/sync-cart.dto';
import { EmailReceiptDto } from './dto/email-receipt.dto';
import { CashClosingService } from './cash-closing.service';
import { RefundPaymentDto } from './dto/refund-payment.dto';

/**
 * Controller for Point of Sale (POS) operations.
 */
@Controller('pos')
export class PosController {
  constructor(
    private readonly posService: PosService,
    private readonly cashClosing: CashClosingService,
  ) {}

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
   * Restores the most recently persisted cart for a terminal.
   */
  @Get('cart')
  async getCart(@Query('terminalId') terminalId?: string) {
    if (!terminalId) {
      throw new BadRequestException('terminalId ist erforderlich.');
    }

    return this.posService.getCart(terminalId);
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
   * Issues a refund for an existing sale.
   */
  @Post('payments/:id/refund')
  refundPayment(@Param('id', ParseIntPipe) saleId: number, @Body() dto: RefundPaymentDto) {
    if (dto.saleId !== saleId) {
      throw new BadRequestException('Sale ID in body does not match requested resource.');
    }
    return this.posService.refundPayment(dto);
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
   * Streams a receipt document (PDF or HTML) for download.
   */
  @Get('receipts/:id/download')
  async downloadReceipt(
    @Param('id', ParseIntPipe) saleId: number,
    @Query('format') format: string | undefined,
    @Res() res: Response,
  ) {
    const normalizedFormat: 'pdf' | 'html' = format?.toLowerCase() === 'html' ? 'html' : 'pdf';
    const document = await this.posService.getReceiptDocument(saleId, normalizedFormat);

    res.setHeader('Content-Type', document.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${document.filename}"`);
    res.send(document.buffer);
  }

  /**
   * Returns the most recent sale to allow terminals to resume after a reload.
   */
  @Get('payments/latest')
  getLatestSale() {
    return this.posService.getLatestSale();
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

  /**
   * Returns the most recent cash closings.
   */
  @Get('closings')
  async listClosings(@Query('limit') limit?: string) {
    const parsed = limit ? Number(limit) : undefined;
    const take = parsed && !Number.isNaN(parsed) ? parsed : undefined;
    const closings = await this.cashClosing.listClosings(take);
    return { closings };
  }

  /**
   * Creates an intermediate closing (X-Bon).
   */
  @Post('closings/x')
  async createXClosing() {
    const closing = await this.cashClosing.createClosing('X');
    return {
      message: 'X-Bon erstellt',
      closing,
    };
  }

  /**
   * Creates a final daily closing (Z-Bon).
   */
  @Post('closings/z')
  async createZClosing() {
    const closing = await this.cashClosing.createClosing('Z');
    return {
      message: 'Z-Bon erstellt',
      closing,
    };
  }
}
