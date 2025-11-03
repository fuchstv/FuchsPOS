import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString } from 'class-validator';

const GRANULARITIES = ['day', 'week', 'month', 'quarter', 'year'] as const;
export type Granularity = (typeof GRANULARITIES)[number];

export class DateRangeQueryDto {
  @IsOptional()
  @Transform(({ value }) => (value ? new Date(value) : undefined))
  startDate?: Date;

  @IsOptional()
  @Transform(({ value }) => (value ? new Date(value) : undefined))
  endDate?: Date;

  @IsOptional()
  @IsEnum(GRANULARITIES, {
    message: `granularity must be one of ${GRANULARITIES.join(', ')}`,
  })
  granularity?: Granularity;

  @IsOptional()
  @IsString()
  locationId?: string;
}

export const DEFAULT_GRANULARITY: Granularity = 'day';
