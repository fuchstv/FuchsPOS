import { IsInt, IsOptional, IsString } from 'class-validator';

export class AssignRoleDto {
  @IsInt()
  userId!: number;

  @IsInt()
  roleId!: number;

  @IsOptional()
  @IsString()
  actorEmail?: string;
}
