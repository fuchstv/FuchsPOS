import { Module } from '@nestjs/common';
import { AccountingService } from './accounting.service';
import { AccountingController } from './accounting.controller';
import { PrismaModule } from '../prisma/prisma.module';

/**
 * The module for handling accounting-related functionality.
 * It imports the PrismaModule to interact with the database.
 */
@Module({
  imports: [PrismaModule],
  providers: [AccountingService],
  controllers: [AccountingController],
  exports: [AccountingService],
})
export class AccountingModule {}
