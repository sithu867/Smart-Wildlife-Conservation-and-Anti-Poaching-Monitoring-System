import type { RequestHandler } from 'express';
import { z } from 'zod';
import { analyticsService } from './service.js';
import { analysisCriteriaSchema } from './validation.js';
import { generateLegacyReportPdf } from './legacyReportPdf.js';
import { AnalyticsCriteriaError } from './criteriaService.js';
const query = z.object({
  start: z.coerce.date().optional(),
  end: z.coerce.date().optional(),
  rangerId: z.string().min(1).optional(),
  incidentType: z.string().optional(),
  incidentStatus: z.string().optional(),
  severity: z.string().optional(),
  conflictStatus: z.string().optional(),
  conflictSource: z.string().optional(),
  conflictType: z.string().optional(),
});
const managerOnly: RequestHandler = (req, _res, next) => {
  if (req.header('x-user-role') !== 'MANAGER')
    throw new Error('Unauthorized: manager access required');
  next();
};

function respondToAnalyticsError(
  error: unknown,
  res: Parameters<RequestHandler>[1],
) {
  if (error instanceof z.ZodError) {
    res
      .status(400)
      .json({
        success: false,
        error: {
          message: error.issues.map((issue) => issue.message).join(' '),
        },
      });
  } else if (error instanceof AnalyticsCriteriaError) {
    res.status(400).json({ success: false, error: { message: error.message } });
  } else {
    // Database and internal failures must not expose connection strings or raw errors.
    res
      .status(500)
      .json({
        success: false,
        error: {
          message: 'Unable to analyze conservation data. Please try again.',
        },
      });
  }
}

const get: RequestHandler = async (req, res) => {
  try {
    const criteria = analysisCriteriaSchema.parse(req.query);
    const data = await analyticsService.getAnalytics(criteria);
    res.json({ success: true, data });
  } catch (error) {
    respondToAnalyticsError(error, res);
  }
};

const listParks: RequestHandler = async (_req, res) => {
  try {
    res.json({ success: true, data: await analyticsService.listParks() });
  } catch {
    res
      .status(500)
      .json({
        success: false,
        error: { message: 'Unable to load parks. Please try again.' },
      });
  }
};

// Preserve the legacy download endpoint for existing callers. The UC-D report
// preview uses the separate snapshot-based generation/export endpoints.
// Scoped callers use the same applied contract as Analyze. Legacy report callers
// keep their existing optional filters and inclusive calendar end-date behavior.
const report: RequestHandler = async (req, res) => {
  try {
    let data: Parameters<typeof generateLegacyReportPdf>[0];
    if (req.query.parkId !== undefined || req.query.categories !== undefined) {
      const { format: _format, ...criteriaQuery } = req.query;
      const scopedData = await analyticsService.getAnalytics(
        analysisCriteriaSchema.parse(criteriaQuery),
      );
      // Neglected-route findings are DATA even without field activity. They
      // must not bypass the existing basic PDF's matching-source-record guard.
      const hasMatchingRecords = Object.values(scopedData.matchedRecords).some(
        (count) => (count ?? 0) > 0,
      );
      if (scopedData.status === 'NO_MATCHING_DATA' || !hasMatchingRecords) {
        res
          .status(400)
          .json({
            success: false,
            error: {
              message:
                'Download Report requires matching conservation data. Refine the criteria and Analyze again.',
            },
          });
        return;
      }
      data = scopedData;
    } else {
      const filters = query.parse(req.query);
      if (filters.start && filters.end && filters.start > filters.end) {
        res
          .status(400)
          .json({
            success: false,
            error: { message: 'Start Date must be on or before End Date.' },
          });
        return;
      }
      if (
        filters.end &&
        typeof req.query.end === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(req.query.end)
      ) {
        filters.end = new Date(filters.end.getTime() + 86_400_000 - 1);
      }
      data = await analyticsService.getLegacyAnalytics(filters);
    }
    res
      .type('application/pdf')
      .set(
        'Content-Disposition',
        'attachment; filename="conservation-report.pdf"',
      )
      .send(generateLegacyReportPdf(data));
  } catch (error) {
    respondToAnalyticsError(error, res);
  }
};

// Preserve the old ?format=pdf entry point as well as /report.
const handler: RequestHandler = (req, res, next) =>
  req.query.format === 'pdf' ? report(req, res, next) : get(req, res, next);
export const analyticsController = {
  managerOnly,
  get: handler,
  report,
  listParks,
};
