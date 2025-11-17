import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { TenantConfigService } from './tenant-config.service';
import { UpdateTenantModulesDto } from './dto/update-tenant-modules.dto';

@Controller('tenants')
export class TenantModulesController {
  constructor(private readonly tenantConfig: TenantConfigService) {}

  @Get(':tenantId/modules')
  listModules(@Param('tenantId') tenantId: string) {
    return this.tenantConfig.listTenantModules(tenantId.trim());
  }

  @Put(':tenantId/modules')
  updateModules(@Param('tenantId') tenantId: string, @Body() dto: UpdateTenantModulesDto) {
    return this.tenantConfig.setTenantModules(tenantId.trim(), dto.modules);
  }
}
