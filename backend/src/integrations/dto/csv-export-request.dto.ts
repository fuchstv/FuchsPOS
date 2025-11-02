import { Transform, Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, ValidateNested } from 'class-validator';
import { CsvColumnDefinitionDto } from './create-csv-preset.dto';

export class CsvExportRequestDto {
  @IsOptional()
  @Transform(({ value }) => (value ? new Date(value) : undefined))
  startDate?: Date;

  @IsOptional()
  @Transform(({ value }) => (value ? new Date(value) : undefined))
  endDate?: Date;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  presetId?: number;

  @IsOptional()
  @IsString()
  delimiter?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CsvColumnDefinitionDto)
  columns?: CsvColumnDefinitionDto[];
}
