import api from './client';

export type TssProfile = {
  id: string;
  serialNumber: string | null;
  description: string | null;
  state: string | null;
  certPath: string | null;
  tenantId: string;
  createdAt: string;
  updatedAt: string;
};

export type CashRegisterProfile = {
  id: string;
  label: string | null;
  location: string | null;
  tenantId: string;
  tssId: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TenantProfile = {
  id: string;
  name: string;
  isDefault: boolean;
  tsses: TssProfile[];
  cashRegisters: CashRegisterProfile[];
};

export async function listTenantProfiles() {
  const { data } = await api.get<TenantProfile[]>('/tenant-config/tenants');
  return data;
}

export async function createTss(tenantId: string, payload: { id: string; serialNumber?: string; description?: string; state?: string; certPath?: string }) {
  const { data } = await api.post<TssProfile>(`/tenant-config/${tenantId}/tss`, payload);
  return data;
}

export async function updateTss(tssId: string, payload: { serialNumber?: string; description?: string; state?: string; certPath?: string }) {
  const { data } = await api.put<TssProfile>(`/tenant-config/tss/${tssId}`, payload);
  return data;
}

export async function deleteTss(tssId: string) {
  await api.delete(`/tenant-config/tss/${tssId}`);
}

export async function createCashRegister(
  tenantId: string,
  payload: { id: string; label?: string; location?: string; tssId: string; isDefault?: boolean },
) {
  const { data } = await api.post<CashRegisterProfile>(`/tenant-config/${tenantId}/cash-registers`, payload);
  return data;
}

export async function updateCashRegister(
  registerId: string,
  payload: { label?: string; location?: string; tssId?: string; isDefault?: boolean },
) {
  const { data } = await api.put<CashRegisterProfile>(`/tenant-config/cash-registers/${registerId}`, payload);
  return data;
}

export async function deleteCashRegister(registerId: string) {
  await api.delete(`/tenant-config/cash-registers/${registerId}`);
}
