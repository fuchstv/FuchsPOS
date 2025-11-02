import { Body, Controller, Get, Post } from '@nestjs/common';
import { AccessControlService } from './access-control.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { AssignRoleDto } from './dto/assign-role.dto';
import { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto';

@Controller('access-control')
export class AccessControlController {
  constructor(private readonly access: AccessControlService) {}

  @Get('users')
  listUsers() {
    return this.access.listUsers();
  }

  @Post('users')
  createUser(@Body() dto: CreateUserDto) {
    return this.access.createUser(dto, { actorEmail: dto.email, tenantId: dto.tenantId });
  }

  @Post('users/status')
  updateUserStatus(@Body() dto: UpdateUserStatusDto) {
    return this.access.updateUserStatus(dto, { actorEmail: 'system@fuchspos.local' });
  }

  @Get('roles')
  listRoles() {
    return this.access.listRoles();
  }

  @Post('roles')
  createRole(@Body() dto: CreateRoleDto) {
    return this.access.createRole(dto, { actorEmail: 'system@fuchspos.local', tenantId: dto.tenantId });
  }

  @Post('roles/assign')
  assignRole(@Body() dto: AssignRoleDto) {
    return this.access.assignRole(dto, { actorEmail: dto.actorEmail });
  }

  @Post('roles/permissions')
  updateRolePermissions(@Body() dto: UpdateRolePermissionsDto) {
    return this.access.updateRolePermissions(dto, { actorEmail: dto.actorEmail });
  }

  @Get('audit-logs')
  listAuditLogs() {
    return this.access.listAuditLogs();
  }
}
