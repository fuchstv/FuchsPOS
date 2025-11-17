import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateCashRegisterDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  tssId?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
