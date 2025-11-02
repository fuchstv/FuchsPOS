import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  ValidateNested,
} from 'class-validator';

const CATEGORIES = ['Beverage', 'Food', 'Merch'] as const;

export class SyncCartItemDto {
  @IsString()
  @IsNotEmpty()
  id!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsNumber()
  @Type(() => Number)
  @IsPositive()
  unitPrice!: number;

  @IsNumber()
  @Type(() => Number)
  @IsPositive()
  quantity!: number;

  @IsIn(CATEGORIES)
  category!: (typeof CATEGORIES)[number];
}

export class SyncCartDto {
  @IsString()
  @IsNotEmpty()
  terminalId!: string;

  @IsArray()
  @ArrayMinSize(0)
  @ValidateNested({ each: true })
  @Type(() => SyncCartItemDto)
  items!: SyncCartItemDto[];

  @IsString()
  @IsNotEmpty()
  currency!: string;

  @IsNumber()
  @Type(() => Number)
  total!: number;

  @IsNumber()
  @Type(() => Number)
  @IsOptional()
  tax?: number;
}
