import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

/**
 * Data transfer object for creating a new user.
 */
export class CreateUserDto {
  /**
   * The user's email address.
   * @example "test@example.com"
   */
  @IsEmail()
  email!: string;

  /**
   * The user's full name.
   * @example "Test User"
   */
  @IsString()
  name!: string;

  /**
   * The user's password. Must be at least 10 characters long.
   * @example "password123"
   */
  @IsString()
  @MinLength(10)
  password!: string;

  /**
   * The ID of the tenant this user belongs to.
   * @example "tenant-123"
   */
  @IsOptional()
  @IsString()
  tenantId?: string;
}
