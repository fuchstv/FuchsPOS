import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  ValidateNested,
} from 'class-validator';
import { CourseDto } from './create-payment.dto';

export class TableCheckItemDto {
  @IsString()
  @IsNotEmpty()
  id!: string;

  @Type(() => Number)
  @IsPositive()
  quantity!: number;
}

export class TableCheckDto {
  @IsString()
  @IsNotEmpty()
  id!: string;

  @IsString()
  @IsNotEmpty()
  label!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TableCheckItemDto)
  items!: TableCheckItemDto[];
}

export enum TableTabStatusDto {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
}

export class CreateTableTabDto {
  @IsString()
  @IsNotEmpty()
  tableId!: string;

  @IsString()
  @IsNotEmpty()
  label!: string;

  @IsOptional()
  @IsString()
  areaLabel?: string;

  @IsOptional()
  @IsString()
  waiterId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  guestCount?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TableCheckDto)
  checks?: TableCheckDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CourseDto)
  coursePlan?: CourseDto[];
}

export class UpdateTableTabDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsString()
  areaLabel?: string;

  @IsOptional()
  @IsString()
  waiterId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  guestCount?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TableCheckDto)
  checks?: TableCheckDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CourseDto)
  coursePlan?: CourseDto[];

  @IsOptional()
  @IsEnum(TableTabStatusDto)
  status?: TableTabStatusDto;
}
