import { IsOptional, IsString } from 'class-validator';

export class UpdateTssDto {
  @IsOptional()
  @IsString()
  serialNumber?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  certPath?: string;
}
