import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Defines a single column in a CSV export.
 */
export class CsvColumnDefinitionDto {
  /**
   * The header text for the column.
   * @example "Receipt Number"
   */
  @IsString()
  header!: string;

  /**
   * The path to the data field to export in this column.
   * Use dot notation for nested objects (e.g., 'sale.total').
   * @example "sale.receiptNo"
   */
  @IsString()
  path!: string;
}

/**
 * Data transfer object for creating a new CSV export preset.
 */
export class CreateCsvPresetDto {
  /**
   * The name of the preset.
   * @example "Daily Sales Report"
   */
  @IsString()
  name!: string;

  /**
   * An optional description for the preset.
   * @example "Exports all sales data for accounting."
   */
  @IsOptional()
  @IsString()
  description?: string;

  /**
   * The ID of the tenant this preset belongs to.
   * @example "tenant-123"
   */
  @IsOptional()
  @IsString()
  tenantId?: string;

  /**
   * The delimiter to use for separating columns in the CSV file.
   * @default ","
   * @example ";"
   */
  @IsOptional()
  @IsString()
  delimiter?: string;

  /**
   * An array of column definitions for the CSV export.
   */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CsvColumnDefinitionDto)
  columns!: CsvColumnDefinitionDto[];
}
