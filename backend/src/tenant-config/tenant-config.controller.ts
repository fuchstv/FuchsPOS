import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { TenantConfigService } from './tenant-config.service';
import { CreateTssDto } from './dto/create-tss.dto';
import { UpdateTssDto } from './dto/update-tss.dto';
import { CreateCashRegisterDto } from './dto/create-cash-register.dto';
import { UpdateCashRegisterDto } from './dto/update-cash-register.dto';

@Controller('tenant-config')
export class TenantConfigController {
  constructor(private readonly service: TenantConfigService) {}

  @Get('tenants')
  listTenantProfiles() {
    return this.service.listTenantProfiles();
  }

  @Get(':tenantId/tss')
  listTss(@Param('tenantId') tenantId: string) {
    return this.service.listTss(tenantId.trim());
  }

  @Post(':tenantId/tss')
  createTss(@Param('tenantId') tenantId: string, @Body() dto: CreateTssDto) {
    return this.service.createTss(tenantId.trim(), dto);
  }

  @Put('tss/:tssId')
  updateTss(@Param('tssId') tssId: string, @Body() dto: UpdateTssDto) {
    return this.service.updateTss(tssId, dto);
  }

  @Delete('tss/:tssId')
  deleteTss(@Param('tssId') tssId: string) {
    return this.service.deleteTss(tssId);
  }

  @Get(':tenantId/cash-registers')
  listCashRegisters(@Param('tenantId') tenantId: string) {
    return this.service.listCashRegisters(tenantId.trim());
  }

  @Post(':tenantId/cash-registers')
  createCashRegister(
    @Param('tenantId') tenantId: string,
    @Body() dto: CreateCashRegisterDto,
  ) {
    return this.service.createCashRegister(tenantId.trim(), dto);
  }

  @Put('cash-registers/:registerId')
  updateCashRegister(
    @Param('registerId') registerId: string,
    @Body() dto: UpdateCashRegisterDto,
  ) {
    return this.service.updateCashRegister(registerId, dto);
  }

  @Delete('cash-registers/:registerId')
  deleteCashRegister(@Param('registerId') registerId: string) {
    return this.service.deleteCashRegister(registerId);
  }
}
