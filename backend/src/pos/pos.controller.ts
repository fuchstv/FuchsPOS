import { Body, Controller, Post } from '@nestjs/common';
import { PosService } from './pos.service';
import { CreatePaymentDto } from './dto/create-payment.dto';

@Controller('pos')
export class PosController {
  constructor(private readonly posService: PosService) {}

  @Post('payments/simulate')
  simulatePayment(@Body() dto: CreatePaymentDto) {
    return this.posService.simulatePayment(dto);
  }
}
