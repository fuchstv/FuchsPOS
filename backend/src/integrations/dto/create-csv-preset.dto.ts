import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class CsvColumnDefinitionDto {
  @IsString()
  header!: string;

  @IsString()
  path!: string;
}

export class CreateCsvPresetDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsOptional()
  @IsString()
  delimiter?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CsvColumnDefinitionDto)
  columns!: CsvColumnDefinitionDto[];
}
