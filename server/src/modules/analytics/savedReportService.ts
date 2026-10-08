import { Prisma, type StatisticalReport } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { analyticsService } from './service.js';
import { createReportSnapshot } from './reportContract.js';
import { validateReportSnapshot } from './reportValidation.js';
import { hasReportableFindings } from './reportEligibility.js';
import type {
  CreateStatisticalReport,
  ReportHistory,
  ReportMetadataUpdate,
  SavedStatisticalReport,
} from './savedReportContract.js';
import type { ConservationReportSnapshot } from './reportContract.js';

function validateIssuedSnapshot(value: unknown): ConservationReportSnapshot {
  try {
    return validateReportSnapshot(value);
  } catch {
    // Invalid server/storage evidence is an internal failure, not invalid client
    // criteria. Never repair a historical report by silently querying newer data.
    throw new Error('The server-issued report snapshot could not be read.');
  }
}

export class SavedReportError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function savedReport(row: StatisticalReport): SavedStatisticalReport {
  // READ: persisted findings, park labels and limitations survive later source edits.
  // Structural validation detects corrupt/unsupported storage without recalculating it.
  const snapshot = validateIssuedSnapshot(row.snapshot);
  return {
    ...snapshot,
    id: row.id,
    title: row.title,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    archivedAt: row.archivedAt?.toISOString() ?? null,
    creatorId: row.creatorId,
    version: row.version,
    parentReportId: row.parentReportId,
  };
}

async function findActive(id: string) {
  const row = await prisma.statisticalReport.findUnique({ where: { id } });
  if (!row) throw new SavedReportError(404, 'Saved report not found.');
  if (row.archivedAt)
    throw new SavedReportError(410, 'This report has been archived.');
  return row;
}

async function create(
  input: CreateStatisticalReport,
  parent?: StatisticalReport,
): Promise<SavedStatisticalReport> {
  // CREATE: recompute on the server so client totals can never become evidence.
  // The existing service validates park existence and preserves Batch 1–2 scoping.
  const result = await analyticsService.getAnalytics(input.criteria);
  if (!hasReportableFindings(result))
    throw new SavedReportError(
      400,
      'Report generation requires matching conservation data. Refine the criteria and Analyze again.',
    );
  const snapshot = validateIssuedSnapshot(
    createReportSnapshot(result.filters, result),
  );
  try {
    const row = await prisma.statisticalReport.create({
      data: {
        title:
          input.title ??
          `Statistical Conservation Report — ${result.park.name}`.slice(0, 200),
        notes: input.notes ?? null,
        parkId: result.park.id,
        startDate: new Date(`${result.filters.start}T00:00:00.000Z`),
        endDate: new Date(`${result.filters.end}T00:00:00.000Z`),
        criteria: JSON.parse(
          JSON.stringify(result.filters),
        ) as Prisma.InputJsonValue,
        snapshot: JSON.parse(JSON.stringify(snapshot)) as Prisma.InputJsonValue,
        generatedAt: new Date(snapshot.generatedAt),
        // A client-controlled role header is not proof of an individual manager.
        creatorId: null,
        version: parent ? parent.version + 1 : 1,
        parentReportId: parent?.id ?? null,
      },
    });
    return savedReport(row);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    )
      throw new SavedReportError(
        409,
        'A newer version already exists. Open it in Saved Reports to regenerate again.',
      );
    throw error;
  }
}

export const savedReportService = {
  create,
  async list(cursor?: string): Promise<ReportHistory> {
    const rows = await prisma.statisticalReport.findMany({
      where: { archivedAt: null },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 51,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, 50);
    return {
      items: page.map((row) => {
        const { analyticsResult: _findings, ...summary } = savedReport(row);
        return summary;
      }),
      nextCursor: rows.length > 50 ? page[49].id : null,
    };
  },
  async detail(id: string) {
    return savedReport(await findActive(id));
  },
  async update(id: string, metadata: ReportMetadataUpdate) {
    // UPDATE: analytical criteria and results never enter this write. The active
    // predicate also prevents a racing edit from changing an archived report.
    const changed = await prisma.statisticalReport.updateMany({
      where: { id, archivedAt: null },
      data: {
        ...(metadata.title !== undefined ? { title: metadata.title } : {}),
        ...(metadata.notes !== undefined ? { notes: metadata.notes } : {}),
      },
    });
    if (!changed.count) await findActive(id);
    return savedReport(await findActive(id));
  },
  async archive(id: string) {
    // DELETE: archive only the independent report; never touch incidents,
    // patrols, alerts, parks or earlier versions. Repeated archive is idempotent.
    const row = await prisma.statisticalReport.findUnique({ where: { id } });
    if (!row) throw new SavedReportError(404, 'Saved report not found.');
    await prisma.statisticalReport.updateMany({
      where: { id, archivedAt: null },
      data: { archivedAt: new Date() },
    });
  },
  async regenerate(id: string) {
    const parent = await findActive(id);
    const original = savedReport(parent);
    // Regeneration inserts a new snapshot/ID; rewriting the old findings would
    // destroy the historical state. One successor per parent keeps versions linear.
    return create(
      {
        criteria: JSON.parse(JSON.stringify(original.appliedCriteria)),
        title: original.title,
        notes: original.notes,
      },
      parent,
    );
  },
};
