import { Module } from '@nestjs/common';
import { PosController } from './pos.controller';
import { PosService } from './pos.service';
import { HardwareModule } from '../hardware/hardware.module';
import { MailerModule } from '../mailer/mailer.module';
import { FiscalModule } from '../fiscal/fiscal.module';
import { PreordersModule } from '../preorders/preorders.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { CashClosingService } from './cash-closing.service';

/**
 * The module for Point of Sale (POS) functionality.
 *
 * This module integrates various other modules like Hardware, Mailer, Fiscal,
 * Preorders, and Realtime to provide a complete POS solution.
 */
@Module({
  imports: [HardwareModule, MailerModule, FiscalModule, PreordersModule, RealtimeModule],
  controllers: [PosController],
  providers: [PosService, CashClosingService],
})
export class PosModule {}
