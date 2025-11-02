import { Module } from '@nestjs/common';
import { PosController } from './pos.controller';
import { PosService } from './pos.service';
import { HardwareModule } from '../hardware/hardware.module';
import { MailerModule } from '../mailer/mailer.module';
import { FiscalModule } from '../fiscal/fiscal.module';
import { PreordersModule } from '../preorders/preorders.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [HardwareModule, MailerModule, FiscalModule, PreordersModule, RealtimeModule],
  controllers: [PosController],
  providers: [PosService],
})
export class PosModule {}
