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

/**
 * Service for handling access control logic.
 *
 * This service manages users, roles, permissions, and audit logs.
 * It interacts with the PrismaService to perform database operations.
 */
@Injectable()
export class AccessControlService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lists all users with their assigned roles.
   * @returns A promise that resolves to a list of users.
   */
  async listUsers(tenantId: string) {
    return this.prisma.user.findMany({
      where: { tenantId },
      include: {
        roles: {
          include: { role: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Lists all roles with their assigned permissions.
   * @returns A promise that resolves to a list of roles.
   */
  async listRoles(tenantId: string) {
    return this.prisma.role.findMany({
      where: { tenantId },
      include: {
        permissions: {
          include: { permission: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Lists audit logs.
   * @param limit - The maximum number of audit logs to return.
   * @returns A promise that resolves to a list of audit logs.
   */
  async listAuditLogs(tenantId: string, limit = 100) {
    return this.prisma.auditLog.findMany({
      where: { tenantId },
      take: limit,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Creates a new user.
   * @param dto - The data for creating the user.
   * @param actor - The context of the user performing the action.
   * @returns A promise that resolves to the newly created user.
   */
  async createUser(dto: CreateUserDto, actor: AuditContext & { tenantId: string }) {
    const tenantId = actor.tenantId;
    const hashed = this.hashPassword(dto.password);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        tenantId,
        hashedPassword: hashed,
      },
    });

    await this.writeAuditLog({
      action: 'user.created',
      entity: 'user',
      entityId: String(user.id),
      userId: actor?.userId,
      actorEmail: actor?.actorEmail ?? dto.email,
      tenantId,
      metadata: { email: dto.email, name: dto.name },
    });

    return user;
  }

  /**
   * Updates the status of a user (active/inactive).
   * @param dto - The data for updating the user's status.
   * @param actor - The context of the user performing the action.
   * @returns A promise that resolves to the updated user.
   */
  async updateUserStatus(dto: UpdateUserStatusDto, actor: AuditContext & { tenantId: string }) {
    const existing = await this.ensureUserExists(dto.userId, actor.tenantId);
    const user = await this.prisma.user.update({
      where: { id: existing.id },
      data: { isActive: dto.isActive },
    });

    await this.writeAuditLog({
      action: dto.isActive ? 'user.activated' : 'user.deactivated',
      entity: 'user',
      entityId: String(dto.userId),
      userId: actor?.userId,
      actorEmail: actor?.actorEmail,
      tenantId: actor.tenantId,
      metadata: { reason: dto.reason },
    });

    return user;
  }

  /**
   * Creates a new role.
   * @param dto - The data for creating the role.
   * @param actor - The context of the user performing the action.
   * @returns A promise that resolves to the newly created role.
   */
  async createRole(dto: CreateRoleDto, actor: AuditContext & { tenantId: string }) {
    const tenantId = actor.tenantId;
    const existingPermissions = await this.ensurePermissions(dto.permissions);
    const role = await this.prisma.role.create({
      data: {
        name: dto.name,
        description: dto.description,
        tenantId,
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
      tenantId,
      metadata: { permissions: dto.permissions },
    });

    return role;
  }

  /**
   * Assigns a role to a user.
   * @param dto - The data for assigning the role.
   * @param actor - The context of the user performing the action.
   * @returns A promise that resolves to the updated user with their roles.
   */
  async assignRole(dto: AssignRoleDto, actor: AuditContext & { tenantId: string }) {
    const tenantId = actor.tenantId;
    await this.ensureRoleExists(dto.roleId, tenantId);
    await this.ensureUserExists(dto.userId, tenantId);

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
      tenantId,
      metadata: { userId: dto.userId, roleId: dto.roleId },
    });

    return this.prisma.user.findUnique({
      where: { id: dto.userId },
      include: {
        roles: { include: { role: true } },
      },
    });
  }

  /**
   * Updates the permissions for a role.
   * @param dto - The data for updating the role's permissions.
   * @param actor - The context of the user performing the action.
   * @returns A promise that resolves to the updated role with its permissions.
   */
  async updateRolePermissions(dto: UpdateRolePermissionsDto, actor: AuditContext & { tenantId: string }) {
    const role = await this.ensureRoleExists(dto.roleId, actor.tenantId);
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
      tenantId: actor.tenantId,
      metadata: { permissions: dto.permissions },
    });

    return this.prisma.role.findUnique({
      where: { id: dto.roleId },
      include: {
        permissions: { include: { permission: true } },
      },
    });
  }

  /**
   * Ensures that a list of permissions exist in the database, creating them if they don't.
   * @param keys - A list of permission keys.
   * @returns A promise that resolves to a list of permission objects.
   */
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

  /**
   * Ensures that a role exists in the database.
   * @param roleId - The ID of the role.
   * @returns A promise that resolves to the role object.
   * @throws NotFoundException if the role does not exist.
   */
  private async ensureRoleExists(roleId: number, tenantId?: string) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role || (tenantId && role.tenantId !== tenantId)) {
      throw new NotFoundException(`Role ${roleId} not found`);
    }
    return role;
  }

  /**
   * Ensures that a user exists in the database.
   * @param userId - The ID of the user.
   * @returns A promise that resolves to the user object.
   * @throws NotFoundException if the user does not exist.
   */
  private async ensureUserExists(userId: number, tenantId?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || (tenantId && user.tenantId !== tenantId)) {
      throw new NotFoundException(`User ${userId} not found`);
    }
    return user;
  }

  /**
   * Hashes a password using a random salt.
   * @param password - The password to hash.
   * @returns The hashed password in the format `salt:hash`.
   */
  private hashPassword(password: string) {
    const salt = randomBytes(8).toString('hex');
    const hash = createHash('sha256').update(password + salt).digest('hex');
    return `${salt}:${hash}`;
  }

  /**
   * Writes an entry to the audit log.
   * @param entry - The audit log entry to write.
   */
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
