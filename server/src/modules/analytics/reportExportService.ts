import { savedReportService } from './savedReportService.js';
import {
  REPORT_CONTENT_TYPES,
  reportFilename,
  type ReportExportFormat,
} from './reportContract.js';
import { buildReportTables } from './reportTables.js';
import { generateReportPdf } from './reportPdf.js';
import { generateReportCsv } from './reportCsv.js';
import { generateReportXlsx } from './reportXlsx.js';

export async function exportSavedReport(
  id: string,
  format: ReportExportFormat,
) {
  // Export from the immutable saved snapshot so a historical report remains
  // identical even if source conservation records later change. This read also
  // validates existence, archive status and the complete persisted structure.
  const report = await savedReportService.detail(id);
  const content =
    format === 'pdf'
      ? generateReportPdf(report)
      : format === 'csv'
        ? generateReportCsv(buildReportTables(report))
        : await generateReportXlsx(buildReportTables(report));
  return {
    content,
    filename: reportFilename(report, format),
    contentType: REPORT_CONTENT_TYPES[format],
  };
}
