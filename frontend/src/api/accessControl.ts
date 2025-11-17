import api from './client';

const tenantAdminApiKey = import.meta.env.VITE_TENANT_ADMIN_API_KEY ?? 'demo-tenant-admin-key';

function withTenantAdminHeaders(tenantId: string) {
  const normalized = tenantId.trim();
  if (!normalized) {
    throw new Error('Eine Tenant-ID ist für Zugriffskontroll-Aufrufe erforderlich.');
  }

  return {
    headers: {
      'x-tenant-admin-key': tenantAdminApiKey,
      'x-tenant-id': normalized,
    },
  };
}

/**
 * Represents the association between a role and a permission.
 */
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

/**
 * Represents an access control role.
 */
export interface AccessControlRole {
  id: number;
  name: string;
  description: string | null;
  tenantId: string | null;
  createdAt: string;
  updatedAt: string;
  permissions: RolePermission[];
}

/**
 * Represents the association between a user and a role.
 */
export interface UserRole {
  roleId: number;
  userId: number;
  assignedAt: string;
  assignedBy: number | null;
  role: AccessControlRole;
}

/**
 * Represents an access control user.
 */
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

/**
 * Normalizes a user response from the API, ensuring the `roles` array is always present.
 * @param user - The user response object.
 * @returns A normalized user object.
 */
function normalizeUser(user: AccessControlUserResponse): AccessControlUser {
  return {
    ...user,
    roles: user.roles ?? [],
  };
}

/**
 * Represents a single entry in the audit log.
 */
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

/**
 * Payload for creating a new user.
 */
export interface CreateUserPayload {
  email: string;
  name: string;
  password: string;
  tenantId?: string;
}

/**
 * Payload for updating a user's status.
 */
export interface UpdateUserStatusPayload {
  userId: number;
  isActive: boolean;
  reason?: string;
}

/**
 * Payload for creating a new role.
 */
export interface CreateRolePayload {
  name: string;
  description?: string;
  tenantId?: string;
  permissions: string[];
}

/**
 * Payload for assigning a role to a user.
 */
export interface AssignRolePayload {
  userId: number;
  roleId: number;
  actorEmail?: string;
}

/**
 * Payload for updating a role's permissions.
 */
export interface UpdateRolePermissionsPayload {
  roleId: number;
  permissions: string[];
  actorEmail?: string;
}

/**
 * Options for listing audit log entries.
 */
export interface ListAuditLogOptions {
  limit?: number;
}

/**
 * Fetches a list of all users.
 * @returns A promise that resolves to an array of users.
 */
export async function listUsers(tenantId: string) {
  const { data } = await api.get<AccessControlUserResponse[]>(
    '/access-control/users',
    withTenantAdminHeaders(tenantId),
  );
  return data.map(normalizeUser);
}

/**
 * Creates a new user.
 * @param payload - The data for the new user.
 * @returns A promise that resolves to the newly created user.
 */
export async function createUser(tenantId: string, payload: CreateUserPayload) {
  const body = { ...payload, tenantId } satisfies CreateUserPayload;
  const { data } = await api.post<AccessControlUserResponse>(
    '/access-control/users',
    body,
    withTenantAdminHeaders(tenantId),
  );
  return normalizeUser(data);
}

/**
 * Updates the status of a user.
 * @param payload - The data for updating the user's status.
 * @returns A promise that resolves to the updated user.
 */
export async function updateUserStatus(tenantId: string, payload: UpdateUserStatusPayload) {
  const { data } = await api.post<AccessControlUserResponse>(
    '/access-control/users/status',
    payload,
    withTenantAdminHeaders(tenantId),
  );
  return normalizeUser(data);
}

/**
 * Fetches a list of all roles.
 * @returns A promise that resolves to an array of roles.
 */
export async function listRoles(tenantId: string) {
  const { data } = await api.get<AccessControlRole[]>(
    '/access-control/roles',
    withTenantAdminHeaders(tenantId),
  );
  return data;
}

/**
 * Creates a new role.
 * @param payload - The data for the new role.
 * @returns A promise that resolves to the newly created role.
 */
export async function createRole(tenantId: string, payload: CreateRolePayload) {
  const body = { ...payload, tenantId } satisfies CreateRolePayload;
  const { data } = await api.post<AccessControlRole>(
    '/access-control/roles',
    body,
    withTenantAdminHeaders(tenantId),
  );
  return data;
}

/**
 * Assigns a role to a user.
 * @param payload - The data for the role assignment.
 * @returns A promise that resolves to the updated user.
 */
export async function assignRole(tenantId: string, payload: AssignRolePayload) {
  const { data } = await api.post<AccessControlUserResponse>(
    '/access-control/roles/assign',
    payload,
    withTenantAdminHeaders(tenantId),
  );
  return normalizeUser(data);
}

/**
 * Updates the permissions for a role.
 * @param payload - The data for updating the permissions.
 * @returns A promise that resolves to the updated role.
 */
export async function updateRolePermissions(
  tenantId: string,
  payload: UpdateRolePermissionsPayload,
) {
  const { data } = await api.post<AccessControlRole>(
    '/access-control/roles/permissions',
    payload,
    withTenantAdminHeaders(tenantId),
  );
  return data;
}

/**
 * Fetches a list of audit log entries.
 * @param options - Options for filtering the list.
 * @returns A promise that resolves to an array of audit log entries.
 */
export async function listAuditLogs(tenantId: string, options: ListAuditLogOptions = {}) {
  const { limit } = options;
  const config = {
    ...withTenantAdminHeaders(tenantId),
    params: limit ? { limit } : undefined,
  };
  const { data } = await api.get<AuditLogEntry[]>('/access-control/audit-logs', config);
  return data;
}
