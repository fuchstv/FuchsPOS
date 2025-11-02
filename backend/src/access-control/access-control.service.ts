import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Permission } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { AssignRoleDto } from './dto/assign-role.dto';
import { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto';

type AuditContext = {
  userId?: number;
  actorEmail?: string;
  tenantId?: string;
  metadata?: Prisma.InputJsonValue;
};

@Injectable()
export class AccessControlService {
  constructor(private readonly prisma: PrismaService) {}

  async listUsers() {
    return this.prisma.user.findMany({
      include: {
        roles: {
          include: { role: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listRoles() {
    return this.prisma.role.findMany({
      include: {
        permissions: {
          include: { permission: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async listAuditLogs(limit = 100) {
    return this.prisma.auditLog.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
    });
  }

  async createUser(dto: CreateUserDto, actor?: AuditContext) {
    const hashed = this.hashPassword(dto.password);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        tenantId: dto.tenantId,
        hashedPassword: hashed,
      },
    });

    await this.writeAuditLog({
      action: 'user.created',
      entity: 'user',
      entityId: String(user.id),
      userId: actor?.userId,
      actorEmail: actor?.actorEmail ?? dto.email,
      tenantId: dto.tenantId ?? actor?.tenantId,
      metadata: { email: dto.email, name: dto.name },
    });

    return user;
  }

  async updateUserStatus(dto: UpdateUserStatusDto, actor?: AuditContext) {
    const user = await this.prisma.user.update({
      where: { id: dto.userId },
      data: { isActive: dto.isActive },
    });

    await this.writeAuditLog({
      action: dto.isActive ? 'user.activated' : 'user.deactivated',
      entity: 'user',
      entityId: String(dto.userId),
      userId: actor?.userId,
      actorEmail: actor?.actorEmail,
      tenantId: actor?.tenantId ?? user.tenantId ?? undefined,
      metadata: { reason: dto.reason },
    });

    return user;
  }

  async createRole(dto: CreateRoleDto, actor?: AuditContext) {
    const existingPermissions = await this.ensurePermissions(dto.permissions);
    const role = await this.prisma.role.create({
      data: {
        name: dto.name,
        description: dto.description,
        tenantId: dto.tenantId,
        permissions: {
          create: existingPermissions.map((permission) => ({
            permissionId: permission.id,
            assignedBy: actor?.userId,
          })),
        },
      },
      include: {
        permissions: { include: { permission: true } },
      },
    });

    await this.writeAuditLog({
      action: 'role.created',
      entity: 'role',
      entityId: String(role.id),
      userId: actor?.userId,
      actorEmail: actor?.actorEmail,
      tenantId: dto.tenantId ?? actor?.tenantId,
      metadata: { permissions: dto.permissions },
    });

    return role;
  }

  async assignRole(dto: AssignRoleDto, actor?: AuditContext) {
    await this.ensureRoleExists(dto.roleId);
    await this.ensureUserExists(dto.userId);

    await this.prisma.userRole.upsert({
      where: { userId_roleId: { userId: dto.userId, roleId: dto.roleId } },
      update: { assignedBy: actor?.userId },
      create: { userId: dto.userId, roleId: dto.roleId, assignedBy: actor?.userId },
    });

    await this.writeAuditLog({
      action: 'role.assigned',
      entity: 'userRole',
      entityId: `${dto.userId}:${dto.roleId}`,
      userId: actor?.userId,
      actorEmail: actor?.actorEmail,
      tenantId: actor?.tenantId,
      metadata: { userId: dto.userId, roleId: dto.roleId },
    });

    return this.prisma.user.findUnique({
      where: { id: dto.userId },
      include: {
        roles: { include: { role: true } },
      },
    });
  }

  async updateRolePermissions(dto: UpdateRolePermissionsDto, actor?: AuditContext) {
    const role = await this.prisma.role.findUnique({ where: { id: dto.roleId } });
    if (!role) {
      throw new NotFoundException(`Role ${dto.roleId} not found`);
    }

    const permissions = await this.ensurePermissions(dto.permissions);

    await this.prisma.rolePermission.deleteMany({ where: { roleId: dto.roleId } });
    await this.prisma.rolePermission.createMany({
      data: permissions.map((permission) => ({
        roleId: dto.roleId,
        permissionId: permission.id,
        assignedBy: actor?.userId ?? null,
        assignedAt: new Date(),
      })),
    });

    await this.writeAuditLog({
      action: 'role.permissions.updated',
      entity: 'role',
      entityId: String(dto.roleId),
      userId: actor?.userId,
      actorEmail: actor?.actorEmail,
      tenantId: actor?.tenantId ?? role.tenantId ?? undefined,
      metadata: { permissions: dto.permissions },
    });

    return this.prisma.role.findUnique({
      where: { id: dto.roleId },
      include: {
        permissions: { include: { permission: true } },
      },
    });
  }

  private async ensurePermissions(keys: string[]): Promise<Permission[]> {
    if (!keys.length) {
      return [];
    }

    const permissions = await this.prisma.permission.findMany({
      where: { key: { in: keys } },
    });

    const missing = keys.filter((key) => !permissions.some((permission) => permission.key === key));

    if (missing.length) {
      const created = await this.prisma.$transaction(
        missing.map((key) =>
          this.prisma.permission.create({
            data: {
              key,
              description: `Auto-created permission for ${key}`,
            },
          }),
        ),
      );
      permissions.push(...created);
    }

    return permissions;
  }

  private async ensureRoleExists(roleId: number) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) {
      throw new NotFoundException(`Role ${roleId} not found`);
    }
    return role;
  }

  private async ensureUserExists(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }
    return user;
  }

  private hashPassword(password: string) {
    const salt = randomBytes(8).toString('hex');
    const hash = createHash('sha256').update(password + salt).digest('hex');
    return `${salt}:${hash}`;
  }

  private async writeAuditLog(entry: {
    action: string;
    entity?: string;
    entityId?: string;
    metadata?: Prisma.InputJsonValue;
    userId?: number;
    actorEmail?: string;
    tenantId?: string;
  }) {
    await this.prisma.auditLog.create({
      data: {
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        metadata: entry.metadata,
        userId: entry.userId,
        actorEmail: entry.actorEmail,
        tenantId: entry.tenantId,
      },
    });
  }
}
