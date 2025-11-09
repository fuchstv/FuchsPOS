import { IsInt, IsOptional, IsString } from 'class-validator';

/**
 * Data transfer object for assigning a role to a user.
 */
export class AssignRoleDto {
  /**
   * The ID of the user to assign the role to.
   * @example 1
   */
  @IsInt()
  userId!: number;

  /**
   * The ID of the role to assign.
   * @example 1
   */
  @IsInt()
  roleId!: number;

  /**
   * The email of the user performing the action.
   * @example "admin@example.com"
   */
  @IsOptional()
  @IsString()
  actorEmail?: string;
}
