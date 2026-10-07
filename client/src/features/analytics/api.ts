import { http } from '../../shared/api/http';
import type {
  AnalysisCriteria,
  AnalyticsResult,
  ParkOption,
} from '../../../../server/src/modules/analytics/contract';
import { criteriaParams } from './criteria';
import { reportFilename } from '../../../../server/src/modules/analytics/reportContract';
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
  ): Promise<string> {
    // Export by database ID. Sending edited JSON cannot change the saved PDF.
    const response = await http.get<Blob>(
      `/analytics/reports/${report.id}/pdf`,
      {
        headers: managerHeaders,
        responseType: 'blob',
        signal,
      },
    );
    if (!response.data.size || !response.data.type.includes('application/pdf'))
      throw new Error('Invalid PDF response');
    const filename = reportFilename(report);
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
