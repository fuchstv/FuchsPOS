import { Body, Controller, Post } from '@nestjs/common';
import { PosService } from './pos.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { SyncCartDto } from './dto/sync-cart.dto';
import { EmailReceiptDto } from './dto/email-receipt.dto';

@Controller('pos')
export class PosController {
  constructor(private readonly posService: PosService) {}

  @Post('cart/sync')
  syncCart(@Body() dto: SyncCartDto) {
    return this.posService.syncCart(dto);
  }

  @Post('payments')
  processPayment(@Body() dto: CreatePaymentDto) {
    return this.posService.processPayment(dto);
  }

  @Post('payments/simulate')
  simulatePayment(@Body() dto: CreatePaymentDto) {
    return this.posService.simulatePayment(dto);
  }

  @Post('receipts/email')
  sendReceiptByEmail(@Body() dto: EmailReceiptDto) {
    return this.posService.sendReceiptEmail(dto);
  }
}
