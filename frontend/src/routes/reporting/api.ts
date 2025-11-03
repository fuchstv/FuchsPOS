import api from '../../api/client';
import type {
  DashboardResponse,
  LocationOption,
  ReportExportFormat,
  ReportExportRequestPayload,
  ReportExportSummary,
  ReportExportType,
  ReportingFilters,
} from './types';

type ExportListFilters = ReportingFilters & {
  type?: ReportExportType;
  format?: ReportExportFormat;
  limit?: number;
};

const API_BASE = (api.defaults.baseURL ?? '').replace(/\/$/, '');

const buildParams = (filters: Partial<ReportingFilters> & Record<string, any>) => {
  const params: Record<string, string> = {};

  if (filters.startDate) {
    params.startDate = filters.startDate;
  }
  if (filters.endDate) {
    params.endDate = filters.endDate;
  }
  if (filters.granularity) {
    params.granularity = filters.granularity;
  }
  if (filters.locationId) {
    params.locationId = filters.locationId;
  }
  if (typeof filters.limit === 'number') {
    params.limit = String(filters.limit);
  }
  if (filters.type) {
    params.type = filters.type;
  }
  if (filters.format) {
    params.format = filters.format;
  }

  return params;
};

export async function fetchDashboard(filters: ReportingFilters) {
  const params = buildParams(filters);
  const { data } = await api.get<DashboardResponse>('/reporting/dashboard', { params });
  return data;
}

export async function fetchExports(filters: Partial<ExportListFilters> = {}) {
  const params = buildParams(filters as ExportListFilters);
  const { data } = await api.get<ReportExportSummary[]>('/reporting/exports', { params });
  return data;
}

export async function requestExport(payload: ReportExportRequestPayload) {
  const { data } = await api.post<ReportExportSummary>('/reporting/exports', payload);
  return data;
}

export async function fetchLocations() {
  const { data } = await api.get<LocationOption[]>('/reporting/locations');
  return data;
}

export const buildDownloadUrl = (path: string | null | undefined) => {
  if (!path) {
    return '#';
  }
  const normalisedPath = path.startsWith('/') ? path.slice(1) : path;
  if (!API_BASE) {
    return `/${normalisedPath}`;
  }
  return `${API_BASE}/${normalisedPath}`;
};
