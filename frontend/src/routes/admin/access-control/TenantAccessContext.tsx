import { PropsWithChildren, createContext, useContext, useMemo, useState } from 'react';

/**
 * The tenant scope shared by all access-control pages.
 */
type TenantAccessScope = {
  tenantId: string;
  setTenantId: (tenantId: string) => void;
};

const TenantAccessScopeContext = createContext<TenantAccessScope | null>(null);

/**
 * Provides the tenant scope for all nested admin pages so that
 * every API call can include the same tenant identifier.
 */
export function TenantAccessProvider({ children }: PropsWithChildren) {
  const defaultTenantId = import.meta.env.VITE_TENANT_ID ?? 'demo-tenant';
  const [tenantId, setTenantId] = useState(defaultTenantId);

  const value = useMemo(() => ({ tenantId, setTenantId }), [tenantId]);

  return <TenantAccessScopeContext.Provider value={value}>{children}</TenantAccessScopeContext.Provider>;
}

/**
 * Returns the current tenant scope. Throws when used outside of the provider
 * to avoid silent failures.
 */
export function useTenantAccessScope() {
  const context = useContext(TenantAccessScopeContext);
  if (!context) {
    throw new Error('useTenantAccessScope must be used inside a TenantAccessProvider');
  }
  return context;
}
