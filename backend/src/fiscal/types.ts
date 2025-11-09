/**
 * Represents information about a fiscal tenant.
 */
export type TenantInfo = {
  id: string;
  name: string;
  fiskalyApiKey: string;
  fiskalyApiSecret: string;
  fiskalyClientId: string;
};

/**
 * Represents information about a Technical Security System (TSS).
 */
export type TssInfo = {
  id: string;
  serialNumber?: string;
  description?: string;
  state?: string;
};

/**
 * Represents information about a cash register.
 */
export type CashRegisterInfo = {
  id: string;
  label?: string;
};

/**
 * Represents the complete fiscal context, including tenant, TSS, and cash register information.
 */
export type FiscalContext = {
  tenant: TenantInfo;
  tss: TssInfo;
  cashRegister: CashRegisterInfo;
};

/**
 * Represents the request payload for starting a Fiskaly transaction.
 */
export type FiskalyTransactionStartRequest = {
  type: 'RECEIPT';
  client_id: string;
  cash_point_closing_id?: string;
  cash_register_id: string;
  schema?: Record<string, unknown>;
};

/**
 * Represents the request payload for updating a Fiskaly transaction.
 */
export type FiskalyTransactionUpdateRequest = {
  schema: Record<string, unknown>;
};

/**
 * Represents the request payload for finishing a Fiskaly transaction.
 */
export type FiskalyTransactionFinishRequest = {
  signature?: {
    process_data: string;
    process_type: string;
  };
};

/**
 * Represents the response from a Fiskaly transaction request.
 */
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
