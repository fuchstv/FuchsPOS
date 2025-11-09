import { IsBoolean, IsInt, IsOptional, IsString } from 'class-validator';

/**
 * Data transfer object for updating a user's status.
 */
export class UpdateUserStatusDto {
  /**
   * The ID of the user to update.
   * @example 1
   */
  @IsInt()
  userId!: number;

  /**
   * The new status for the user. `true` for active, `false` for inactive.
   * @example false
   */
  @IsBoolean()
  isActive!: boolean;

  /**
   * The reason for the status change.
   * @example "User left the company"
   */
  @IsOptional()
  @IsString()
  reason?: string;
}
