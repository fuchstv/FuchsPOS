import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches } from 'class-validator';

export class DatevExportDto {
  @IsOptional()
  @Transform(({ value }) => (value ? new Date(value) : undefined))
  startDate?: Date;

  @IsOptional()
  @Transform(({ value }) => (value ? new Date(value) : undefined))
  endDate?: Date;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{4,}$/, { message: 'cashAccount must be a numeric DATEV account' })
  cashAccount?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{4,}$/, { message: 'revenueAccount must be a numeric DATEV account' })
  revenueAccount?: string;

  @IsOptional()
  @Transform(({ value }) => (value ? Number(value) : undefined))
  @IsInt()
  transferWebhookId?: number;
}
