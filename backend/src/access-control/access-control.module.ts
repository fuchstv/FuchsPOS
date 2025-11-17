import { Module } from '@nestjs/common';
import { AccessControlService } from './access-control.service';
import { AccessControlController } from './access-control.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { TenantAdminGuard } from './tenant-admin.guard';

/**
 * The module for managing access control.
 * It imports the PrismaModule to interact with the database.
 */
@Module({
  imports: [PrismaModule],
  providers: [AccessControlService, TenantAdminGuard],
  controllers: [AccessControlController],
  exports: [AccessControlService],
})
export class AccessControlModule {}
