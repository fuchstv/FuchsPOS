import { Navigate, Route, Routes } from 'react-router-dom';
import { AccessControlLayout, AuditLogPage, RolesPage, UsersPage } from './access-control';
import { TenantAccessProvider } from './access-control/TenantAccessContext';

/**
 * Top-level route component for the admin access-control area.
 *
 * It wires together the tenant scope provider and the nested routes
 * for users, roles and audit-log management.
 */
export default function AccessControl() {
  return (
    <TenantAccessProvider>
      <Routes>
        <Route element={<AccessControlLayout />}>
          <Route index element={<UsersPage />} />
          <Route path="roles" element={<RolesPage />} />
          <Route path="audit-log" element={<AuditLogPage />} />
          <Route path="*" element={<Navigate to="." replace />} />
        </Route>
      </Routes>
    </TenantAccessProvider>
  );
}
