export type TenantInfo = {
  id: string;
  name: string;
  fiskalyApiKey: string;
  fiskalyApiSecret: string;
  fiskalyClientId: string;
};

export type TssInfo = {
  id: string;
  serialNumber?: string;
  description?: string;
  state?: string;
};

export type CashRegisterInfo = {
  id: string;
  label?: string;
};

export type FiscalContext = {
  tenant: TenantInfo;
  tss: TssInfo;
  cashRegister: CashRegisterInfo;
};

export type FiskalyTransactionStartRequest = {
  type: 'RECEIPT';
  client_id: string;
  cash_point_closing_id?: string;
  cash_register_id: string;
  schema?: Record<string, unknown>;
};

export type FiskalyTransactionUpdateRequest = {
  schema: Record<string, unknown>;
};

export type FiskalyTransactionFinishRequest = {
  signature?: {
    process_data: string;
    process_type: string;
  };
};

export type FiskalyTransactionResponse = {
  id: string;
  tss_id: string;
  client_id: string;
  cash_register_id?: string;
  number?: number;
  state?: string;
  time_start?: string;
  time_end?: string;
  signature?: {
    value?: string;
    serial_number?: string;
    algorithm?: string;
    public_key?: string;
  };
  _type?: string;
  [key: string]: unknown;
};
