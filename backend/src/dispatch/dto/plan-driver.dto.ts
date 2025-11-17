import { IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class PlanDriverDto {
  @IsNumber()
  orderId!: number;

  @IsString()
  @IsNotEmpty()
  driverName!: string;

  @IsOptional()
  @IsString()
  vehicleId?: string;

  @IsOptional()
  @IsDateString()
  eta?: string;
}
