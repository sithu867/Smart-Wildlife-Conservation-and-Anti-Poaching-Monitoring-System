import { http } from '../../shared/api/http';
import type {
  AnalysisCriteria,
  AnalyticsResult,
  ParkOption,
} from '../../../../server/src/modules/analytics/contract';
import { criteriaParams } from './criteria';

const managerHeaders = { 'x-user-role': 'MANAGER' };
type ApiResponse<T> = { success: true; data: T };

export const analyticsApi = {
  async listParks(signal: AbortSignal): Promise<ParkOption[]> {
    const response = await http.get<ApiResponse<ParkOption[]>>(
      '/analytics/parks',
      { headers: managerHeaders, signal },
    );
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
        // Brackets preserve an array even when exactly one box is checked.
        paramsSerializer: { indexes: false },
      },
    );
    return response.data.data;
  },
  async downloadExistingReport(criteria: AnalysisCriteria): Promise<void> {
    const response = await http.get<Blob>('/analytics/report', {
      params: criteriaParams(criteria),
      paramsSerializer: { indexes: false },
      headers: managerHeaders,
      responseType: 'blob',
    });
    const url = URL.createObjectURL(response.data);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'conservation-report.pdf';
    try {
      anchor.click();
    } finally {
      URL.revokeObjectURL(url);
    }
  },
};
