import type { AnalysisCriteria } from './contract.js';
import type { ConservationReportSnapshot } from './reportContract.js';

export interface CreateStatisticalReport {
  criteria: AnalysisCriteria;
  title?: string;
  notes?: string | null;
}
export interface ReportMetadataUpdate {
  title?: string;
  notes?: string | null;
}
export type SavedStatisticalReport = ConservationReportSnapshot & {
  id: string;
  title: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  creatorId: string | null;
  version: number;
  parentReportId: string | null;
};
export type StatisticalReportSummary = Omit<
  SavedStatisticalReport,
  'analyticsResult'
>;
export interface ReportHistory {
  items: StatisticalReportSummary[];
  nextCursor: string | null;
}
