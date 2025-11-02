import { Module } from '@nestjs/common';
import { PosController } from './pos.controller';
import { PosService } from './pos.service';
import { HardwareModule } from '../hardware/hardware.module';
import { MailerModule } from '../mailer/mailer.module';

@Module({
  imports: [HardwareModule, MailerModule],
  controllers: [PosController],
  providers: [PosService],
})
export class PosModule {}
