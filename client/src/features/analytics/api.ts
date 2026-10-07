import { http } from '../../shared/api/http';
import type {
  AnalysisCriteria,
  AnalyticsResult,
  ParkOption,
} from '../../../../server/src/modules/analytics/contract';
import { criteriaParams } from './criteria';
import {
  reportFilename,
  type ConservationReportSnapshot,
} from '../../../../server/src/modules/analytics/reportContract';

const managerHeaders = { 'x-user-role': 'MANAGER' };
type ApiResponse<T> = { success: true; data: T };

export const analyticsApi = {
  async listParks(signal: AbortSignal): Promise<ParkOption[]> {
    const response = await http.get<ApiResponse<ParkOption[]>>(
      // Park metadata is shared; lookup must not impersonate a manager role.
      '/parks',
      { signal },
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
  async generateReport(
    snapshot: ConservationReportSnapshot,
    signal: AbortSignal,
  ): Promise<ConservationReportSnapshot> {
    const response = await http.post<ApiResponse<ConservationReportSnapshot>>(
      '/analytics/reports',
      snapshot,
      {
        headers: managerHeaders,
        signal,
      },
    );
    return response.data.data;
  },
  async exportReport(
    snapshot: ConservationReportSnapshot,
    signal: AbortSignal,
  ): Promise<string> {
    // Send exactly the previewed snapshot; no criteria query or analytics refresh.
    const response = await http.post<Blob>('/analytics/reports/pdf', snapshot, {
      headers: managerHeaders,
      responseType: 'blob',
      signal,
    });
    if (!response.data.size || !response.data.type.includes('application/pdf'))
      throw new Error('Invalid PDF response');
    const filename = reportFilename(snapshot);
    const url = URL.createObjectURL(response.data);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    try {
      anchor.click();
    } finally {
      anchor.remove();
      // Allow the browser to start consuming the download before revocation.
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    return filename;
  },
};
