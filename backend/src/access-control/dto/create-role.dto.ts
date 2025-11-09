import { IsArray, IsOptional, IsString } from 'class-validator';

/**
 * Data transfer object for creating a new role.
 */
export class CreateRoleDto {
  /**
   * The name of the role.
   * @example "Admin"
   */
  @IsString()
  name!: string;

  /**
   * A description of the role.
   * @example "Administrator role with full access"
   */
  @IsOptional()
  @IsString()
  description?: string;

  /**
   * The ID of the tenant this role belongs to.
   * @example "tenant-123"
   */
  @IsOptional()
  @IsString()
  tenantId?: string;

  /**
   * A list of permission keys to assign to the role.
   * @example ["users.create", "users.read"]
   */
  @IsArray()
  permissions!: string[];
}
