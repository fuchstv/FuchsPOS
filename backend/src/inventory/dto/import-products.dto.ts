import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class ImportProductItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  sku!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{8,14}$/)
  ean?: string | null;

  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;

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

export class ImportProductsDto {
  @IsString()
  @IsNotEmpty()
  tenantId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportProductItemDto)
  @ArrayMinSize(1)
  items!: ImportProductItemDto[];
}
