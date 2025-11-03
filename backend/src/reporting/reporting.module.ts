import { Module } from '@nestjs/common';
import { ReportingController } from './reporting.controller';
import { ReportingService } from './reporting.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ReportExportService } from './report-export.service';
import { MailerModule } from '../mailer/mailer.module';

@Module({
  imports: [PrismaModule, MailerModule],
  controllers: [ReportingController],
  providers: [ReportingService, ReportExportService],
  exports: [ReportingService, ReportExportService],
})
export class ReportingModule {}
