import { IsDateString, IsOptional, IsString } from 'class-validator';

export class ListDeliverySlotsDto {
  @IsString()
  tenantId!: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
