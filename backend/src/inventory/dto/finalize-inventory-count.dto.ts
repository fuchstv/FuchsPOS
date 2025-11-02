import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';

class FinalizeInventoryCountLineDto {
  @IsOptional()
  @IsNumber()
  id?: number;

  @IsString()
  productSku!: string;

  @IsOptional()
  @IsString()
  batchLotNumber?: string;

  @IsNumber()
  countedQuantity!: number;

  @IsOptional()
  @IsString()
  adjustmentReason?: string;
}

export class FinalizeInventoryCountDto {
  @IsString()
  tenantId!: string;

  @IsOptional()
  @IsBoolean()
  bookDifferences?: boolean;

  @IsOptional()
  @IsString()
  defaultAdjustmentReason?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FinalizeInventoryCountLineDto)
  items?: FinalizeInventoryCountLineDto[];
}

export { FinalizeInventoryCountLineDto };
