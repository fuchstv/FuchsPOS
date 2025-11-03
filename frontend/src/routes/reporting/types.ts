export type Granularity = 'day' | 'week' | 'month' | 'quarter' | 'year';

export interface SalesBucket {
  period: string;
  total: number;
  transactions: number;
  paymentMethods: Record<string, { count: number; total: number }>;
}

export interface EmployeePerformanceRow {
  employeeId: string;
  revenue: number;
  tickets: number;
  avgBasket: number;
}

export interface CategoryPerformanceRow {
  category: string;
  revenue: number;
  units: number;
  items: number;
  shareOfRevenue: number;
}

export interface ExpiryOverviewRow {
  batchId: number;
  lotNumber?: string | null;
  product: { id: number; name: string; sku?: string | null };
  storageLocation?: { id: number; code?: string | null } | null;
  expirationDate?: string | null;
  quantity: number;
  daysRemaining: number | null;
  status: string;
}

export interface DashboardResponse {
  sales: SalesBucket[];
  employees: EmployeePerformanceRow[];
  categories: CategoryPerformanceRow[];
  expiry: ExpiryOverviewRow[];
}

export interface ReportingFilters {
  startDate?: string;
  endDate?: string;
  granularity?: Granularity;
  locationId?: string;
}

export type ReportExportType =
  | 'SALES_SUMMARY'
  | 'EMPLOYEE_PERFORMANCE'
  | 'CATEGORY_PERFORMANCE';

export type ReportExportFormat = 'CSV' | 'XLSX';

export type ReportExportStatus = 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED';

export interface ReportExportFilters {
  startDate?: string;
  endDate?: string;
  granularity?: string;
  locationId?: string;
}

export interface ReportExportSummary {
  id: number;
  type: ReportExportType;
  format: ReportExportFormat;
  status: ReportExportStatus;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  downloadPath?: string | null;
  filters: ReportExportFilters;
  notificationEmail?: string | null;
  error?: string | null;
}

export interface ReportExportRequestPayload extends ReportingFilters {
  type: ReportExportType;
  format: ReportExportFormat;
  notificationEmail?: string;
}

export interface LocationOption {
  id: string;
  label: string;
}
