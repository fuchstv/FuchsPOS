import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsOptional } from 'class-validator';
import { DateRangeQueryDto } from './date-range.dto';

export enum ReportExportTypeDto {
  SALES_SUMMARY = 'SALES_SUMMARY',
  EMPLOYEE_PERFORMANCE = 'EMPLOYEE_PERFORMANCE',
  CATEGORY_PERFORMANCE = 'CATEGORY_PERFORMANCE',
}

export enum ReportExportFormatDto {
  CSV = 'CSV',
  XLSX = 'XLSX',
}

export class ReportExportRequestDto extends DateRangeQueryDto {
  @IsEnum(ReportExportTypeDto)
  type!: ReportExportTypeDto;

  @IsEnum(ReportExportFormatDto)
  format!: ReportExportFormatDto;

  @IsOptional()
  @IsEmail()
  notificationEmail?: string;
}

export class ReportExportListQueryDto extends DateRangeQueryDto {
  @IsOptional()
  @IsEnum(ReportExportTypeDto)
  type?: ReportExportTypeDto;

  @IsOptional()
  @IsEnum(ReportExportFormatDto)
  format?: ReportExportFormatDto;

  @IsOptional()
  @Transform(({ value }) => (value ? Number(value) : undefined))
  limit?: number;
}
