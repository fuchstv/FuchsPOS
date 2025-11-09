import { Transform, Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, ValidateNested } from 'class-validator';
import { CsvColumnDefinitionDto } from './create-csv-preset.dto';

/**
 * Data transfer object for requesting a CSV export.
 */
export class CsvExportRequestDto {
  /**
   * The start date for the export range.
   * @example "2023-01-01"
   */
  @IsOptional()
  @Transform(({ value }) => (value ? new Date(value) : undefined))
  startDate?: Date;

  /**
   * The end date for the export range.
   * @example "2023-01-31"
   */
  @IsOptional()
  @Transform(({ value }) => (value ? new Date(value) : undefined))
  endDate?: Date;

  /**
   * The ID of a saved preset to use for the export.
   * If provided, the `delimiter` and `columns` from the preset will be used,
   * unless they are overridden in this DTO.
   * @example 1
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  presetId?: number;

  /**
   * The delimiter to use for the CSV file.
   * Overrides the delimiter from the preset if `presetId` is also provided.
   * @example ";"
   */
  @IsOptional()
  @IsString()
  delimiter?: string;

  /**
   * An array of column definitions to use for the export.
   * Overrides the columns from the preset if `presetId` is also provided.
   */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CsvColumnDefinitionDto)
  columns?: CsvColumnDefinitionDto[];
}
