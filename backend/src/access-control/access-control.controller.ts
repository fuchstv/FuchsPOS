import { Body, Controller, Get, Post } from '@nestjs/common';
import { AccessControlService } from './access-control.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { AssignRoleDto } from './dto/assign-role.dto';
import { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto';

/**
 * Controller for managing access control, including users, roles, and permissions.
 */
@Controller('access-control')
export class AccessControlController {
  constructor(private readonly access: AccessControlService) {}

  /**
   * Lists all users.
   * @returns A list of all users.
   */
  @Get('users')
  listUsers() {
    return this.access.listUsers();
  }

  /**
   * Creates a new user.
   * @param dto - The data for creating a new user.
   * @returns The newly created user.
   */
  @Post('users')
  createUser(@Body() dto: CreateUserDto) {
    return this.access.createUser(dto, { actorEmail: dto.email, tenantId: dto.tenantId });
  }

  /**
   * Updates the status of a user.
   * @param dto - The data for updating the user's status.
   * @returns The updated user.
   */
  @Post('users/status')
  updateUserStatus(@Body() dto: UpdateUserStatusDto) {
    return this.access.updateUserStatus(dto, { actorEmail: 'system@fuchspos.local' });
  }

  /**
   * Lists all roles.
   * @returns A list of all roles.
   */
  @Get('roles')
  listRoles() {
    return this.access.listRoles();
  }

  /**
   * Creates a new role.
   * @param dto - The data for creating a new role.
   * @returns The newly created role.
   */
  @Post('roles')
  createRole(@Body() dto: CreateRoleDto) {
    return this.access.createRole(dto, { actorEmail: 'system@fuchspos.local', tenantId: dto.tenantId });
  }

  /**
   * Assigns a role to a user.
   * @param dto - The data for assigning the role.
   * @returns The result of the assignment.
   */
  @Post('roles/assign')
  assignRole(@Body() dto: AssignRoleDto) {
    return this.access.assignRole(dto, { actorEmail: dto.actorEmail });
  }

  /**
   * Updates the permissions for a role.
   * @param dto - The data for updating the role's permissions.
   * @returns The updated role.
   */
  @Post('roles/permissions')
  updateRolePermissions(@Body() dto: UpdateRolePermissionsDto) {
    return this.access.updateRolePermissions(dto, { actorEmail: dto.actorEmail });
  }

  /**
   * Lists all audit logs.
   * @returns A list of all audit logs.
   */
  @Get('audit-logs')
  listAuditLogs() {
    return this.access.listAuditLogs();
  }
}
