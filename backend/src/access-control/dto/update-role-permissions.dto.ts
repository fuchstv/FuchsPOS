import { IsArray, IsInt, IsOptional, IsString } from 'class-validator';

/**
 * Data transfer object for updating the permissions of a role.
 */
export class UpdateRolePermissionsDto {
  /**
   * The ID of the role to update.
   * @example 1
   */
  @IsInt()
  roleId!: number;

  /**
   * A list of permission keys to set for the role.
   * @example ["users.create", "users.read"]
   */
  @IsArray()
  permissions!: string[];

  /**
   * The email of the user performing the action.
   * @example "admin@example.com"
   */
  @IsOptional()
  @IsString()
  actorEmail?: string;
}
