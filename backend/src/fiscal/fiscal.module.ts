import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { FiscalManagementService } from './fiscal-management.service';
import { FiscalizationService } from './fiscalization.service';
import { FiskalyClientService } from './fiskaly-client.service';

@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [FiscalManagementService, FiskalyClientService, FiscalizationService],
  exports: [FiscalManagementService, FiscalizationService],
})
export class FiscalModule {}
