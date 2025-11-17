import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateCashRegisterDto {
  @IsString()
  id!: string;

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsString()
  tssId!: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
