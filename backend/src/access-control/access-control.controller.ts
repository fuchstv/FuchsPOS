import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AccessControlService } from './access-control.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { AssignRoleDto } from './dto/assign-role.dto';
import { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto';
import { TenantAdminGuard, TenantAdminRequest } from './tenant-admin.guard';

/**
 * Controller for managing access control, including users, roles, and permissions.
 */
@UseGuards(TenantAdminGuard)
@Controller('access-control')
export class AccessControlController {
  constructor(private readonly access: AccessControlService) {}

  /**
   * Lists all users.
   * @returns A list of all users.
   */
  @Get('users')
  listUsers(@Req() request: TenantAdminRequest) {
    return this.access.listUsers(this.getTenantId(request));
  }

  /**
   * Creates a new user.
   * @param dto - The data for creating a new user.
   * @returns The newly created user.
   */
  @Post('users')
  createUser(@Body() dto: CreateUserDto, @Req() request: TenantAdminRequest) {
    const tenantId = this.resolveTenantScope(request, dto.tenantId);
    return this.access.createUser(
      { ...dto, tenantId },
      { actorEmail: dto.email, tenantId },
    );
  }

  /**
   * Updates the status of a user.
   * @param dto - The data for updating the user's status.
   * @returns The updated user.
   */
  @Post('users/status')
  updateUserStatus(@Body() dto: UpdateUserStatusDto, @Req() request: TenantAdminRequest) {
    const tenantId = this.getTenantId(request);
    return this.access.updateUserStatus(dto, { actorEmail: 'system@fuchspos.local', tenantId });
  }

  /**
   * Lists all roles.
   * @returns A list of all roles.
   */
  @Get('roles')
  listRoles(@Req() request: TenantAdminRequest) {
    return this.access.listRoles(this.getTenantId(request));
  }

  /**
   * Creates a new role.
   * @param dto - The data for creating a new role.
   * @returns The newly created role.
   */
  @Post('roles')
  createRole(@Body() dto: CreateRoleDto, @Req() request: TenantAdminRequest) {
    const tenantId = this.resolveTenantScope(request, dto.tenantId);
    return this.access.createRole(
      { ...dto, tenantId },
      { actorEmail: 'system@fuchspos.local', tenantId },
    );
  }

  /**
   * Assigns a role to a user.
   * @param dto - The data for assigning the role.
   * @returns The result of the assignment.
   */
  @Post('roles/assign')
  assignRole(@Body() dto: AssignRoleDto, @Req() request: TenantAdminRequest) {
    const tenantId = this.getTenantId(request);
    return this.access.assignRole(dto, { actorEmail: dto.actorEmail, tenantId });
  }

  /**
   * Updates the permissions for a role.
   * @param dto - The data for updating the role's permissions.
   * @returns The updated role.
   */
  @Post('roles/permissions')
  updateRolePermissions(@Body() dto: UpdateRolePermissionsDto, @Req() request: TenantAdminRequest) {
    const tenantId = this.getTenantId(request);
    return this.access.updateRolePermissions(dto, { actorEmail: dto.actorEmail, tenantId });
  }

  /**
   * Lists all audit logs.
   * @returns A list of all audit logs.
   */
  @Get('audit-logs')
  listAuditLogs(@Req() request: TenantAdminRequest, @Query('limit') limit?: number) {
    return this.access.listAuditLogs(this.getTenantId(request), limit);
  }

  private getTenantId(request: TenantAdminRequest) {
    const tenantId = request.tenantAdmin?.tenantId;
    if (!tenantId) {
      throw new BadRequestException('Kein Tenant-Kontext vorhanden.');
    }
    return tenantId;
  }

  private resolveTenantScope(request: TenantAdminRequest, provided?: string | null) {
    const tenantId = this.getTenantId(request);
    if (provided && provided !== tenantId) {
      throw new ForbiddenException('Tenant-ID darf nicht überschrieben werden.');
    }
    return tenantId;
  }
}
