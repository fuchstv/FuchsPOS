import api from './client';

export interface RolePermission {
  id: number;
  permissionId: number;
  assignedAt: string;
  assignedBy: number | null;
  permission: {
    id: number;
    key: string;
    description: string | null;
    createdAt: string;
    updatedAt: string;
  };
}

export interface AccessControlRole {
  id: number;
  name: string;
  description: string | null;
  tenantId: string | null;
  createdAt: string;
  updatedAt: string;
  permissions: RolePermission[];
}

export interface UserRole {
  roleId: number;
  userId: number;
  assignedAt: string;
  assignedBy: number | null;
  role: AccessControlRole;
}

export interface AccessControlUser {
  id: number;
  email: string;
  name: string | null;
  tenantId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  roles: UserRole[];
}

type AccessControlUserResponse = Omit<AccessControlUser, 'roles'> & { roles?: UserRole[] };

function normalizeUser(user: AccessControlUserResponse): AccessControlUser {
  return {
    ...user,
    roles: user.roles ?? [],
  };
}

export interface AuditLogEntry {
  id: number;
  action: string;
  entity: string | null;
  entityId: string | null;
  metadata: unknown;
  userId: number | null;
  actorEmail: string | null;
  tenantId: string | null;
  createdAt: string;
}

export interface CreateUserPayload {
  email: string;
  name: string;
  password: string;
  tenantId?: string;
}

export interface UpdateUserStatusPayload {
  userId: number;
  isActive: boolean;
  reason?: string;
}

export interface CreateRolePayload {
  name: string;
  description?: string;
  tenantId?: string;
  permissions: string[];
}

export interface AssignRolePayload {
  userId: number;
  roleId: number;
  actorEmail?: string;
}

export interface UpdateRolePermissionsPayload {
  roleId: number;
  permissions: string[];
  actorEmail?: string;
}

export interface ListAuditLogOptions {
  limit?: number;
}

export async function listUsers() {
  const { data } = await api.get<AccessControlUserResponse[]>('/access-control/users');
  return data.map(normalizeUser);
}

export async function createUser(payload: CreateUserPayload) {
  const { data } = await api.post<AccessControlUserResponse>('/access-control/users', payload);
  return normalizeUser(data);
}

export async function updateUserStatus(payload: UpdateUserStatusPayload) {
  const { data } = await api.post<AccessControlUserResponse>('/access-control/users/status', payload);
  return normalizeUser(data);
}

export async function listRoles() {
  const { data } = await api.get<AccessControlRole[]>('/access-control/roles');
  return data;
}

export async function createRole(payload: CreateRolePayload) {
  const { data } = await api.post<AccessControlRole>('/access-control/roles', payload);
  return data;
}

export async function assignRole(payload: AssignRolePayload) {
  const { data } = await api.post<AccessControlUserResponse>('/access-control/roles/assign', payload);
  return normalizeUser(data);
}

export async function updateRolePermissions(payload: UpdateRolePermissionsPayload) {
  const { data } = await api.post<AccessControlRole>('/access-control/roles/permissions', payload);
  return data;
}

export async function listAuditLogs(options: ListAuditLogOptions = {}) {
  const { limit } = options;
  const { data } = await api.get<AuditLogEntry[]>(
    '/access-control/audit-logs',
    limit ? { params: { limit } } : undefined,
  );
  return data;
}
