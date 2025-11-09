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

/**
 * Fetches the main dashboard data based on the provided filters.
 * @param {ReportingFilters} filters - The filters to apply to the dashboard data query.
 * @returns {Promise<DashboardResponse>} A promise that resolves to the dashboard data.
 */
export async function fetchDashboard(filters: ReportingFilters) {
  const params = buildParams(filters);
  const { data } = await api.get<DashboardResponse>('/reporting/dashboard', { params });
  return data;
}

/**
 * Fetches a list of previously generated report exports.
 * @param {Partial<ExportListFilters>} [filters={}] - Optional filters to apply to the export list query.
 * @returns {Promise<ReportExportSummary[]>} A promise that resolves to a list of export summaries.
 */
export async function fetchExports(filters: Partial<ExportListFilters> = {}) {
  const params = buildParams(filters as ExportListFilters);
  const { data } = await api.get<ReportExportSummary[]>('/reporting/exports', { params });
  return data;
}

/**
 * Initiates a request to generate a new report export.
 * @param {ReportExportRequestPayload} payload - The configuration for the export request.
 * @returns {Promise<ReportExportSummary>} A promise that resolves to the summary of the newly created export job.
 */
export async function requestExport(payload: ReportExportRequestPayload) {
  const { data } = await api.post<ReportExportSummary>('/reporting/exports', payload);
  return data;
}

/**
 * Fetches a list of available locations that can be used for filtering reports.
 * @returns {Promise<LocationOption[]>} A promise that resolves to a list of location options.
 */
export async function fetchLocations() {
  const { data } = await api.get<LocationOption[]>('/reporting/locations');
  return data;
}

/**
 * Constructs a full download URL for a given report export path.
 * It prepends the API base URL to the path.
 * @param {string | null | undefined} path - The relative path to the downloadable file.
 * @returns {string} The full URL for downloading the file, or '#' if the path is invalid.
 */
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
