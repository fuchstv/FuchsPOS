import { IsOptional, IsString } from 'class-validator';

export class CreateTssDto {
  @IsString()
  id!: string;

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
