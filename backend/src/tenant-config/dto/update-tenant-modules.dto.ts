import { TenantModuleKey } from '@prisma/client';
import { IsArray, IsEnum } from 'class-validator';

export class UpdateTenantModulesDto {
  @IsArray()
  @IsEnum(TenantModuleKey, { each: true })
  modules!: TenantModuleKey[];
}
