import { http } from '../../shared/api/http';
import type {
  AnalysisCriteria,
  AnalyticsResult,
  ParkOption,
} from '../../../../server/src/modules/analytics/contract';
import { criteriaParams } from './criteria';
import {
  reportFilename,
  REPORT_CONTENT_TYPES,
  REPORT_EXPORT_FORMATS,
  type ReportExportFormat,
} from '../../../../server/src/modules/analytics/reportContract';
import { isValidAnalysisId } from '../../../../server/src/modules/analytics/contract';
import type {
  CreateStatisticalReport,
  ReportHistory,
  ReportMetadataUpdate,
  SavedStatisticalReport,
  StatisticalReportSummary,
} from '../../../../server/src/modules/analytics/savedReportContract';

const managerHeaders = { 'x-user-role': 'MANAGER' };
type ApiResponse<T> = { success: true; data: T };
export const analyticsApi = {
  async listParks(signal: AbortSignal): Promise<ParkOption[]> {
    const response = await http.get<ApiResponse<ParkOption[]>>('/parks', {
      signal,
    });
    return response.data.data;
  },
  async analyze(
    criteria: AnalysisCriteria,
    signal: AbortSignal,
  ): Promise<AnalyticsResult> {
    const response = await http.get<ApiResponse<AnalyticsResult>>(
      '/analytics',
      {
        params: criteriaParams(criteria),
        headers: managerHeaders,
        signal,
        paramsSerializer: { indexes: false },
      },
    );
    return response.data.data;
  },
  async generateReport(
    input: CreateStatisticalReport,
    signal: AbortSignal,
  ): Promise<SavedStatisticalReport> {
    // Only criteria/metadata cross this boundary; analytical findings belong to the server.
    const response = await http.post<ApiResponse<SavedStatisticalReport>>(
      '/analytics/reports',
      input,
      { headers: managerHeaders, signal },
    );
    return response.data.data;
  },
  async listReports(
    signal: AbortSignal,
    cursor?: string,
  ): Promise<ReportHistory> {
    const response = await http.get<ApiResponse<ReportHistory>>(
      '/analytics/reports',
      { headers: managerHeaders, signal, params: cursor ? { cursor } : {} },
    );
    return response.data.data;
  },
  async getReport(
    id: string,
    signal: AbortSignal,
  ): Promise<SavedStatisticalReport> {
    const response = await http.get<ApiResponse<SavedStatisticalReport>>(
      `/analytics/reports/${id}`,
      { headers: managerHeaders, signal },
    );
    return response.data.data;
  },
  async updateReport(
    id: string,
    metadata: ReportMetadataUpdate,
    signal: AbortSignal,
  ): Promise<SavedStatisticalReport> {
    const response = await http.patch<ApiResponse<SavedStatisticalReport>>(
      `/analytics/reports/${id}`,
      metadata,
      { headers: managerHeaders, signal },
    );
    return response.data.data;
  },
  async archiveReport(id: string, signal: AbortSignal): Promise<void> {
    await http.delete(`/analytics/reports/${id}`, {
      headers: managerHeaders,
      signal,
    });
  },
  async regenerateReport(
    id: string,
    signal: AbortSignal,
  ): Promise<SavedStatisticalReport> {
    const response = await http.post<ApiResponse<SavedStatisticalReport>>(
      `/analytics/reports/${id}/regenerate`,
      {},
      { headers: managerHeaders, signal },
    );
    return response.data.data;
  },
  async exportReport(
    report: StatisticalReportSummary,
    signal: AbortSignal,
    format: ReportExportFormat = 'pdf',
  ): Promise<string> {
    if (
      !isValidAnalysisId(report.id) ||
      !REPORT_EXPORT_FORMATS.includes(format)
    )
      throw new Error('Invalid report ID or export format');
    // Send only the ID/format. The server owns content and filenames; it never
    // accepts browser findings or recalculates current analytics during export.
    const response = await http.get<Blob>(
      format === 'pdf'
        ? `/analytics/reports/${report.id}/pdf`
        : `/analytics/reports/${report.id}/export`,
      {
        headers: managerHeaders,
        responseType: 'blob',
        signal,
        ...(format !== 'pdf' ? { params: { format } } : {}),
      },
    );
    if (
      signal.aborted ||
      !response.data.size ||
      !response.data.type.includes(REPORT_CONTENT_TYPES[format])
    )
      throw new Error('Invalid or cancelled export response');
    const disposition = response.headers?.['content-disposition'];
    const issuedName =
      typeof disposition === 'string'
        ? /filename="([a-z0-9_-]+\.[a-z]+)"/.exec(disposition)?.[1]
        : undefined;
    const filename = issuedName?.endsWith(`.${format}`)
      ? issuedName
      : reportFilename(report, format);
    const url = URL.createObjectURL(response.data);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    try {
      anchor.click();
    } finally {
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    return filename;
  },
};
