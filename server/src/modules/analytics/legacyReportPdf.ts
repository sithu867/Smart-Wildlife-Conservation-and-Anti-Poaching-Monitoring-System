import type { analyticsService } from './service.js';
import type { ConflictTrendAnalysis } from './contract.js';
import { escapePdfText, serializePdfPages } from './pdfPrimitives.js';

type ReportData = Pick<
  Awaited<ReturnType<typeof analyticsService.getLegacyAnalytics>>,
  'summary' | 'incidents' | 'conflicts' | 'generatedAt'
> & { filters: object; conflictTrends?: ConflictTrendAnalysis };
export const generateLegacyReportPdf = (data: ReportData) => {
  const s = data.summary;
  const text = (x: string, y: number, size = 10, color = '0.12 0.18 0.16') =>
    `${color} rg BT /F1 ${size} Tf 50 ${y} Td (${escapePdfText(x)}) Tj ET`;
  const section = (title: string, y: number) =>
    `0.06 0.35 0.25 rg 45 ${y - 8} 522 24 re f ${text(title, y, 12, '1 1 1')}`;
  const rows = (items: string[], start: number) =>
    items.map((line, i) => text(line, start - i * 17)).join('\n');
  const filters =
    Object.entries(data.filters)
      .filter(([, value]) => value)
      .map(([key, value]) => `${key}: ${String(value)}`)
      .join(' | ') || 'All available records';
  const stream = [
    '0.94 0.98 0.96 rg 0 0 612 792 re f',
    '0.04 0.22 0.15 rg 0 680 612 112 re f',
    text('WILDLIFE CONSERVATION', 750, 11, '0.65 1 0.82'),
    text('Analytics & Management Report', 715, 26, '1 1 1'),
    text(`Generated ${data.generatedAt}`, 692, 9, '0.82 0.92 0.87'),
    section('REPORT SCOPE', 650),
    rows(
      [
        `Applied filters: ${filters}`,
        ...(data.conflictTrends
          ? ['Conflict scope: ALL PARKS / UNASSIGNED (not selected park)']
          : []),
      ],
      625,
    ),
    section('EXECUTIVE SUMMARY', 585),
    rows(
      [
        `Patrols: ${s.patrols.total}    Completed: ${s.patrols.completed}    Active: ${s.patrols.active}`,
        `Incidents reported: ${s.incidents.total}`,
        `Conflict alerts: ${s.conflicts.total}    Open: ${s.conflicts.open}    Resolved: ${s.conflicts.resolved}`,
        `Responses recorded: ${s.responses.total}`,
      ],
      555,
    ),
    section('INCIDENTS BY TYPE', 475),
    rows(
      data.incidents.byType.length
        ? data.incidents.byType.map((x) => `${x.name}: ${x.count}`)
        : [
            s.incidents.total
              ? 'Incident Statistics was not selected.'
              : 'No incidents match the selected filters.',
          ],
      445,
    ),
    section('CONFLICT ALERTS BY SEVERITY', 350),
    rows(
      data.conflicts.bySeverity.length
        ? data.conflicts.bySeverity.map((x) => `${x.name}: ${x.count}`)
        : ['No conflict alerts match the selected filters.'],
      320,
    ),
    '0.04 0.22 0.15 rg 0 0 612 34 re f',
    text(
      'WildlifeGuard  |  Confidential management report',
      12,
      8,
      '0.85 1 0.9',
    ),
  ].join('\n');
  return serializePdfPages([stream], 'Helvetica');
};
