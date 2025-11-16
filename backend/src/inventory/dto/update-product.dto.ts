import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';

export class UpdateProductDto {
  @IsString()
  tenantId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  sku?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{8,14}$/)
  ean?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  unit?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowNaN: false, maxDecimalPlaces: 4 })
  @Min(0)
  defaultPrice?: number;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  supplierName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  supplierNumber?: string;
}
