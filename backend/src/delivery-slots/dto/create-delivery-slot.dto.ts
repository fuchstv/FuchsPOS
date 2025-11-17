import { IsDateString, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateDeliverySlotDto {
  @IsString()
  @IsNotEmpty()
  tenantId!: string;

  @IsDateString()
  startTime!: string;

  @IsDateString()
  endTime!: string;

  @IsInt()
  @Min(1)
  @Max(500)
  maxOrders = 10;

  @IsInt()
  @Min(1)
  maxKitchenLoad = 100;

  @IsInt()
  @Min(1)
  maxStorageLoad = 100;

  @IsOptional()
  @IsString()
  notes?: string;
}
