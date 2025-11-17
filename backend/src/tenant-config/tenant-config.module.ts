import { Module } from '@nestjs/common';
import { TenantConfigController } from './tenant-config.controller';
import { TenantConfigService } from './tenant-config.service';
import { TenantModulesController } from './tenant-modules.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [TenantConfigController, TenantModulesController],
  providers: [TenantConfigService],
})
export class TenantConfigModule {}
