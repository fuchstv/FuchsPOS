import { IsArray, IsInt, IsOptional, IsString } from 'class-validator';

export class UpdateRolePermissionsDto {
  @IsInt()
  roleId!: number;

  @IsArray()
  permissions!: string[];

  @IsOptional()
  @IsString()
  actorEmail?: string;
}
