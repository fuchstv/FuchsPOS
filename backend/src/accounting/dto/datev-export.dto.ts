import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches } from 'class-validator';

/**
 * Data transfer object for generating a DATEV export.
 */
export class DatevExportDto {
  /**
   * The start date for the export.
   * @example "2023-01-01"
   */
  @IsOptional()
  @Transform(({ value }) => (value ? new Date(value) : undefined))
  startDate?: Date;

  /**
   * The end date for the export.
   * @example "2023-01-31"
   */
  @IsOptional()
  @Transform(({ value }) => (value ? new Date(value) : undefined))
  endDate?: Date;

  /**
   * The DATEV account for cash transactions.
   * @example "1000"
   */
  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{4,}$/, { message: 'cashAccount must be a numeric DATEV account' })
  cashAccount?: string;

  /**
   * The DATEV account for revenue.
   * @example "8400"
   */
  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{4,}$/, { message: 'revenueAccount must be a numeric DATEV account' })
  revenueAccount?: string;

  /**
   * The ID of the webhook to transfer the export to.
   * @example 1
   */
  @IsOptional()
  @Transform(({ value }) => (value ? Number(value) : undefined))
  @IsInt()
  transferWebhookId?: number;
}
