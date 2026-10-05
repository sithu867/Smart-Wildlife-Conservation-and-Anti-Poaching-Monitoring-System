import type { RequestHandler } from 'express';
import { z } from 'zod';
import { analyticsService } from './service.js';
import { analysisCriteriaSchema } from './validation.js';
import { AnalyticsCriteriaError } from './criteriaService.js';
const query = z.object({ start: z.coerce.date().optional(), end: z.coerce.date().optional(), rangerId: z.string().min(1).optional(), incidentType: z.string().optional(), incidentStatus: z.string().optional(), severity: z.string().optional(), conflictStatus: z.string().optional(), conflictSource: z.string().optional(), conflictType: z.string().optional() });
const managerOnly: RequestHandler = (req, _res, next) => { if (req.header('x-user-role') !== 'MANAGER') throw new Error('Unauthorized: manager access required'); next(); };
const pdfEscape = (value: string) => value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)').replace(/[^\x20-\x7E]/g, '?');
type ReportData = Pick<Awaited<ReturnType<typeof analyticsService.getLegacyAnalytics>>, 'summary' | 'incidents' | 'conflicts' | 'generatedAt'> & { filters: object };
const toPdf = (data: ReportData) => { const s = data.summary; const text = (x: string, y: number, size = 10, color = '0.12 0.18 0.16') => `${color} rg BT /F1 ${size} Tf 50 ${y} Td (${pdfEscape(x)}) Tj ET`; const section = (title: string, y: number) => `0.06 0.35 0.25 rg 45 ${y - 8} 522 24 re f ${text(title, y, 12, '1 1 1')}`; const rows = (items: string[], start: number) => items.map((line, i) => text(line, start - i * 17)).join('\n'); const filters = Object.entries(data.filters).filter(([, value]) => value).map(([key, value]) => `${key}: ${String(value)}`).join(' | ') || 'All available records'; const stream = ['0.94 0.98 0.96 rg 0 0 612 792 re f', '0.04 0.22 0.15 rg 0 680 612 112 re f', text('WILDLIFE CONSERVATION', 750, 11, '0.65 1 0.82'), text('Analytics & Management Report', 715, 26, '1 1 1'), text(`Generated ${data.generatedAt}`, 692, 9, '0.82 0.92 0.87'), section('REPORT SCOPE', 650), rows([`Applied filters: ${filters}`], 625), section('EXECUTIVE SUMMARY', 585), rows([`Patrols: ${s.patrols.total}    Completed: ${s.patrols.completed}    Active: ${s.patrols.active}`, `Incidents reported: ${s.incidents.total}`, `Conflict alerts: ${s.conflicts.total}    Open: ${s.conflicts.open}    Resolved: ${s.conflicts.resolved}`, `Responses recorded: ${s.responses.total}`], 555), section('INCIDENTS BY TYPE', 475), rows(data.incidents.byType.length ? data.incidents.byType.map(x => `${x.name}: ${x.count}`) : ['No incidents match the selected filters.'], 445), section('CONFLICT ALERTS BY SEVERITY', 350), rows(data.conflicts.bySeverity.length ? data.conflicts.bySeverity.map(x => `${x.name}: ${x.count}`) : ['No conflict alerts match the selected filters.'], 320), '0.04 0.22 0.15 rg 0 0 612 34 re f', text('WildlifeGuard  |  Confidential management report', 12, 8, '0.85 1 0.9')].join('\n'); const objects = [`<< /Type /Catalog /Pages 2 0 R >>`, `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`, `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`, `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`]; let pdf = '%PDF-1.4\n'; const offsets = [0]; objects.forEach((obj, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`; }); const start = pdf.length; pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(x => `${String(x).padStart(10, '0')} 00000 n `).join('\n')}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`; return Buffer.from(pdf, 'binary'); };

function respondToAnalyticsError(error: unknown, res: Parameters<RequestHandler>[1]) {
  if (error instanceof z.ZodError) {
    res.status(400).json({ success: false, error: { message: error.issues.map(issue => issue.message).join(' ') } });
  } else if (error instanceof AnalyticsCriteriaError) {
    res.status(400).json({ success: false, error: { message: error.message } });
  } else {
    // Database and internal failures must not expose connection strings or raw errors.
    res.status(500).json({ success: false, error: { message: 'Unable to analyze conservation data. Please try again.' } });
  }
}

const get: RequestHandler = async (req, res) => {
  try {
    const criteria = analysisCriteriaSchema.parse(req.query);
    const data = await analyticsService.getAnalytics(criteria);
    res.json({ success: true, data });
  } catch (error) { respondToAnalyticsError(error, res); }
};

const listParks: RequestHandler = async (_req, res) => {
  try {
    res.json({ success: true, data: await analyticsService.listParks() });
  } catch {
    res.status(500).json({ success: false, error: { message: 'Unable to load parks. Please try again.' } });
  }
};

// Retain the existing PDF endpoint; Batch 1 adds no report generation features.
// Scoped callers use the same applied contract as Analyze. Legacy report callers
// keep their existing optional filters and inclusive calendar end-date behavior.
const report: RequestHandler = async (req, res) => {
  try {
    let data: ReportData;
    if (req.query.parkId !== undefined || req.query.categories !== undefined) {
      const { format: _format, ...criteriaQuery } = req.query;
      data = await analyticsService.getAnalytics(analysisCriteriaSchema.parse(criteriaQuery));
    } else {
      const filters = query.parse(req.query);
      if (filters.start && filters.end && filters.start > filters.end) {
        res.status(400).json({ success: false, error: { message: 'Start Date must be on or before End Date.' } });
        return;
      }
      if (filters.end && typeof req.query.end === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.end)) {
        filters.end = new Date(filters.end.getTime() + 86_400_000 - 1);
      }
      data = await analyticsService.getLegacyAnalytics(filters);
    }
    res.type('application/pdf').set('Content-Disposition', 'attachment; filename="conservation-report.pdf"').send(toPdf(data));
  } catch (error) { respondToAnalyticsError(error, res); }
};

// Preserve the old ?format=pdf entry point as well as /report.
const handler: RequestHandler = (req, res, next) => req.query.format === 'pdf' ? report(req, res, next) : get(req, res, next);
export const analyticsController = { managerOnly, get: handler, report, listParks };
