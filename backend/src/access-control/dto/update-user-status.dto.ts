import { IsBoolean, IsInt, IsOptional, IsString } from 'class-validator';

export class UpdateUserStatusDto {
  @IsInt()
  userId!: number;

  @IsBoolean()
  isActive!: boolean;

  @IsOptional()
  @IsString()
  reason?: string;
}
