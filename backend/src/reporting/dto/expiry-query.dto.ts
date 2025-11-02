import { Type } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { DateRangeQueryDto } from './date-range.dto';

export class ExpiryReportQueryDto extends DateRangeQueryDto {
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeHealthy?: boolean;
}
