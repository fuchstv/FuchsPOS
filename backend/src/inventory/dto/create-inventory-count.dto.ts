import { Type } from 'class-transformer';
import { IsArray, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';

class InventoryCountLineDto {
  @IsString()
  productSku!: string;

  @IsOptional()
  @IsString()
  batchLotNumber?: string;

  @IsOptional()
  @IsNumber()
  expectedQuantity?: number;

  @IsOptional()
  @IsNumber()
  countedQuantity?: number;
}

export class CreateInventoryCountDto {
  @IsString()
  tenantId!: string;

  @IsOptional()
  @IsString()
  locationCode?: string;

  @IsOptional()
  @IsString()
  locationDescription?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InventoryCountLineDto)
  items?: InventoryCountLineDto[];
}

export { InventoryCountLineDto };
