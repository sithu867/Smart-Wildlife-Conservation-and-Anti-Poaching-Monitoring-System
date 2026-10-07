import { jest } from '@jest/globals';
import request from 'supertest';
import { Prisma, type StatisticalReport } from '@prisma/client';
import { prisma, resetAnalyticsPrisma } from './analyticsPrismaMock.js';
const { createApp } = await import('../src/app.js');
const { analyticsService } =
  await import('../src/modules/analytics/service.js');
const app = createApp();
const park = {
  id: 'c67a000000000000000000001',
  name: 'Snapshot Park',
  code: 'SNAP',
};
const criteria = {
  parkId: park.id,
  start: '2026-10-06',
  end: '2026-10-07',
  categories: ['INCIDENT_STATISTICS'],
};
const store = new Map<string, StatisticalReport>();
let sequence = 0;
let source: Array<{
  incidentType: string;
  status: string;
  reportedAt: Date;
  location: object;
}>;
const clone = <T>(value: T): T => structuredClone(value);
function endpoint(method: 'get' | 'post' | 'patch' | 'delete', path = '') {
  return request(app)
    [method](`/api/analytics/reports${path}`)
    .set('x-user-role', 'MANAGER');
}
async function create() {
  const response = await endpoint('post').send({
    criteria,
    title: 'Conservation review',
    notes: 'Reviewed by manager',
  });
  expect(response.status).toBe(201);
  return response.body.data as {
    id: string;
    version: number;
    parentReportId: string | null;
    analyticsResult: { incidentStatistics: { total: number } };
    appliedCriteria: typeof criteria;
    title: string;
    notes: string;
  };
}

beforeEach(() => {
  resetAnalyticsPrisma();
  store.clear();
  sequence = 0;
  source = [
    {
      incidentType: 'SNARE',
      status: 'REPORTED',
      reportedAt: new Date('2026-10-06T10:00:00Z'),
      location: { latitude: -2, longitude: 34 },
    },
  ];
  prisma.park.findUnique.mockResolvedValue(park);
  prisma.patrolRoute.findMany.mockResolvedValue([]);
  prisma.patrolSession.findMany.mockResolvedValue([]);
  prisma.conservationIncident.findMany.mockImplementation(async () => source);
  prisma.wildlifeConflictAlert.findMany.mockResolvedValue([]);
  // Mock only persistence. HTTP validation, park verification, analytics and report
  // rendering stay real; changing source rows therefore changes new snapshots only.
  prisma.statisticalReport.create.mockImplementation(async ({ data }) => {
    if (
      data.parentReportId &&
      [...store.values()].some(
        (row) =>
          row.parentReportId === data.parentReportId &&
          row.version === data.version,
      )
    )
      throw new Prisma.PrismaClientKnownRequestError('unique constraint', {
        code: 'P2002',
        clientVersion: '7.10.0',
      });
    const now = new Date(Date.UTC(2026, 9, 7, 0, 0, ++sequence));
    const row: StatisticalReport = {
      id: `c${String(sequence).padStart(24, '0')}`,
      title: data.title,
      notes: data.notes ?? null,
      parkId: data.parkId as string,
      startDate: new Date(data.startDate),
      endDate: new Date(data.endDate),
      criteria: data.criteria as Prisma.JsonValue,
      snapshot: data.snapshot as Prisma.JsonValue,
      generatedAt: new Date(data.generatedAt),
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
      creatorId: data.creatorId ?? null,
      version: data.version ?? 1,
      parentReportId: data.parentReportId ?? null,
    };
    store.set(row.id, clone(row));
    return clone(row);
  });
  prisma.statisticalReport.findUnique.mockImplementation(async ({ where }) =>
    clone(store.get(where.id!) ?? null),
  );
  prisma.statisticalReport.findMany.mockImplementation(async (args) => {
    expect(args.where).toEqual({ archivedAt: null });
    expect(args.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
    const rows = [...store.values()]
      .filter((row) => !row.archivedAt)
      .sort(
        (a, b) =>
          b.createdAt.getTime() - a.createdAt.getTime() ||
          b.id.localeCompare(a.id),
      );
    const offset = args.cursor
      ? rows.findIndex((row) => row.id === args.cursor?.id) + 1
      : 0;
    return clone(rows.slice(offset, offset + (args.take ?? rows.length)));
  });
  prisma.statisticalReport.updateMany.mockImplementation(
    async ({ where, data }) => {
      const row = store.get(where?.id as string);
      if (!row || (where?.archivedAt === null && row.archivedAt))
        return { count: 0 };
      if (typeof data.title === 'string') row.title = data.title;
      if (typeof data.notes === 'string' || data.notes === null)
        row.notes = data.notes;
      if (data.archivedAt instanceof Date) row.archivedAt = data.archivedAt;
      row.updatedAt = new Date();
      return { count: 1 };
    },
  );
});
afterEach(() => jest.restoreAllMocks());

test('CREATE persists server analysis and gives a real ID with scope, filters and findings', async () => {
  const analyze = jest.spyOn(analyticsService, 'getAnalytics');
  const report = await create();
  expect(report.id).toMatch(/^c[a-z0-9]{24}$/);
  expect(analyze).toHaveBeenCalledWith(criteria);
  expect(store.size).toBe(1);
  expect(report.analyticsResult.incidentStatistics.total).toBe(1);
  expect(report.appliedCriteria).toEqual(criteria);
  expect(store.get(report.id)?.criteria).toEqual(criteria);
  expect(store.get(report.id)?.creatorId).toBeNull();
});
test.each([
  ['missing park', { parkId: undefined }],
  ['old ObjectID', { parkId: '67a000000000000000000001' }],
  ['missing start', { start: undefined }],
  ['bad start', { start: '2026-02-30' }],
  ['reversed range', { start: '2026-10-08' }],
  ['no categories', { categories: [] }],
  ['invalid category', { categories: ['FAKE'] }],
  ['invalid filter', { severity: 'FAKE' }],
  ['unknown filter', { routeCount: 999 }],
])('CREATE rejects %s before persistence', async (_label, override) => {
  const response = await endpoint('post').send({
    criteria: { ...criteria, ...override },
  });
  expect(response.status).toBe(400);
  expect(store.size).toBe(0);
});
test.each([
  { title: '' },
  { title: 'a'.repeat(201) },
  { notes: 'a'.repeat(5001) },
  { notes: 10 },
  { title: null },
])('CREATE validates metadata %p', async (metadata) => {
  expect((await endpoint('post').send({ criteria, ...metadata })).status).toBe(
    400,
  );
  expect(prisma.statisticalReport.create).not.toHaveBeenCalled();
});
test('CREATE verifies park existence and rejects no matching conservation data', async () => {
  prisma.park.findUnique.mockResolvedValueOnce(null);
  expect((await endpoint('post').send({ criteria })).status).toBe(400);
  source = [];
  expect((await endpoint('post').send({ criteria })).status).toBe(400);
  expect(store.size).toBe(0);
});
test.each([
  'analyticsResult',
  'incidentTotals',
  'snapshot',
  'park',
  'generatedAt',
])('CREATE rejects forged %s', async (field) => {
  const response = await endpoint('post').send({
    criteria,
    [field]: { total: 999 },
  });
  expect(response.status).toBe(400);
  expect(store.size).toBe(0);
});
test('old client-owned generation and PDF submission cannot issue authoritative reports', async () => {
  expect(
    (
      await endpoint('post').send({
        appliedCriteria: criteria,
        analyticsResult: { total: 999 },
      })
    ).status,
  ).toBe(400);
  expect(
    (await endpoint('post', '/pdf').send({ snapshot: { total: 999 } })).status,
  ).toBe(404);
});
test('malformed JSON produces a controlled 400 without echoing request content', async () => {
  const response = await endpoint('post').type('json').send('{"secretBroken":');
  expect(response.status).toBe(400);
  expect(response.body.error.message).toBe('Request must contain valid JSON.');
});
test('READ history supports empty, newest first, summaries and pagination', async () => {
  expect((await endpoint('get')).body.data).toEqual({
    items: [],
    nextCursor: null,
  });
  const first = await create();
  const last = await create();
  const list = (await endpoint('get')).body.data;
  expect(list.items.map((row: { id: string }) => row.id)).toEqual([
    last.id,
    first.id,
  ]);
  expect(list.items[0]).not.toHaveProperty('analyticsResult');
  expect(
    (await endpoint('get').query({ cursor: last.id })).body.data.items[0].id,
  ).toBe(first.id);
});
test('READ detail and PDF retain saved evidence when source data and park labels change', async () => {
  const original = await create();
  source.push(clone(source[0]));
  prisma.park.findUnique.mockResolvedValue({ ...park, name: 'Renamed park' });
  const analyze = jest.spyOn(analyticsService, 'getAnalytics');
  const detail = await endpoint('get', `/${original.id}`);
  expect(detail.body.data).toEqual(original);
  const pdf = await endpoint('get', `/${original.id}/pdf`);
  expect(pdf.status).toBe(200);
  expect(pdf.headers['content-type']).toContain('application/pdf');
  expect(pdf.headers['content-disposition']).toMatch(
    /^attachment; filename="conservation-report-snap-\d{4}-\d{2}-\d{2}\.pdf"$/,
  );
  expect((pdf.body as Buffer).toString()).toContain('Total incidents: 1');
  expect((pdf.body as Buffer).toString()).toContain('Snapshot Park');
  expect((pdf.body as Buffer).toString()).not.toContain('Renamed park');
  expect(analyze).not.toHaveBeenCalled();
});
test.each(['get', 'patch', 'delete'] as const)(
  '%s missing and malformed IDs fail safely',
  async (method) => {
    expect(
      (
        await endpoint(method, '/c000000000000000000000099').send({
          title: 'Valid',
        })
      ).status,
    ).toBe(404);
    expect(
      (await endpoint(method, '/bad-id').send({ title: 'Valid' })).status,
    ).toBe(400);
  },
);
test('UPDATE title and notes preserves criteria, findings and generated timestamp', async () => {
  const original = await create();
  const stored = clone(store.get(original.id)!);
  const changed = await endpoint('patch', `/${original.id}`).send({
    title: ' Revised title ',
    notes: 'New review notes',
  });
  expect(changed.status).toBe(200);
  expect(changed.body.data.title).toBe('Revised title');
  expect(changed.body.data.notes).toBe('New review notes');
  const pdf = await endpoint('get', `/${original.id}/pdf`);
  expect((pdf.body as Buffer).toString()).toContain('Revised title');
  expect((pdf.body as Buffer).toString()).toContain('New review notes');

  expect(store.get(original.id)?.snapshot).toEqual(stored.snapshot);
  expect(store.get(original.id)?.criteria).toEqual(stored.criteria);
  expect(store.get(original.id)?.generatedAt).toEqual(stored.generatedAt);
  expect(
    (await endpoint('patch', `/${original.id}`).send({ notes: null })).body.data
      .notes,
  ).toBeNull();
});
test.each([
  {},
  { title: ' ' },
  { title: 'a'.repeat(201) },
  { notes: 'a'.repeat(5001) },
  { snapshot: {} },
  { criteria: {} },
  { parkId: park.id },
  { analyticsResult: { total: 999 } },
  { version: 99 },
  { archivedAt: null },
])('UPDATE rejects invalid or analytical fields %p', async (input) => {
  const original = await create();
  const before = clone(store.get(original.id));
  expect((await endpoint('patch', `/${original.id}`).send(input)).status).toBe(
    400,
  );
  expect(store.get(original.id)).toEqual(before);
});
test('REGENERATION creates next version with new evidence, keeping original unchanged; duplicate regeneration is controlled', async () => {
  const original = await create();
  const before = clone(store.get(original.id));
  source.push(clone(source[0]));
  const next = await endpoint('post', `/${original.id}/regenerate`).send({});
  expect(next.status).toBe(201);
  expect(next.body.data.version).toBe(2);
  expect(next.body.data.parentReportId).toBe(original.id);
  expect(next.body.data.id).not.toBe(original.id);
  expect(next.body.data.analyticsResult.incidentStatistics.total).toBe(2);
  expect(store.get(original.id)).toEqual(before);
  expect(
    (await endpoint('post', `/${original.id}/regenerate`).send({})).status,
  ).toBe(409);
  expect(
    (await endpoint('post', `/${next.body.data.id}/regenerate`).send({})).body
      .data.version,
  ).toBe(3);
  expect(
    (
      await endpoint('post', `/${next.body.data.id}/regenerate`).send({
        criteria,
      })
    ).status,
  ).toBe(400);
});
test('ARCHIVE is idempotent, hides history, blocks detail/edit/export/regenerate, and preserves sources', async () => {
  const report = await create();
  const beforeSource = clone(source);
  const beforeSnapshot = clone(store.get(report.id)?.snapshot);
  expect((await endpoint('delete', `/${report.id}`)).status).toBe(200);
  const archivedAt = store.get(report.id)?.archivedAt;
  expect((await endpoint('delete', `/${report.id}`)).status).toBe(200);
  expect(store.get(report.id)?.archivedAt).toEqual(archivedAt);
  expect((await endpoint('get')).body.data.items).toHaveLength(0);
  expect((await endpoint('get', `/${report.id}`)).status).toBe(410);
  expect((await endpoint('get', `/${report.id}/pdf`)).status).toBe(410);
  expect(
    (await endpoint('patch', `/${report.id}`).send({ title: 'New' })).status,
  ).toBe(410);
  expect(
    (await endpoint('post', `/${report.id}/regenerate`).send({})).status,
  ).toBe(410);
  expect(store.get(report.id)?.snapshot).toEqual(beforeSnapshot);
  expect(source).toEqual(beforeSource);
  expect(prisma.statisticalReport.updateMany).toHaveBeenCalledWith(
    expect.objectContaining({ data: { archivedAt: expect.any(Date) } }),
  );
});
test.each([
  ['post', ''],
  ['get', ''],
  ['get', '/c000000000000000000000001'],
  ['patch', '/c000000000000000000000001'],
  ['delete', '/c000000000000000000000001'],
  ['get', '/c000000000000000000000001/pdf'],
  ['post', '/c000000000000000000000001/regenerate'],
] as const)('manager boundary protects %s %s', async (method, path) => {
  const response = await request(app)
    [method](`/api/analytics/reports${path}`)
    .send({ criteria });
  expect(response.status).toBe(403);
  expect(prisma.statisticalReport.findMany).not.toHaveBeenCalled();
  expect(store.size).toBe(0);
});
test.each([
  'create',
  'list',
  'detail',
  'update',
  'archive',
  'pdf',
  'regenerate',
])('%s database failure hides internals and permits retry', async (action) => {
  const report = await create();
  const secret = new Error('SQL Prisma DATABASE_URL secret stack');
  let response;
  if (action === 'create' || action === 'regenerate') {
    prisma.statisticalReport.create.mockRejectedValueOnce(secret);
    response = await endpoint(
      'post',
      action === 'create' ? '' : `/${report.id}/regenerate`,
    ).send(action === 'create' ? { criteria } : {});
  } else if (action === 'list') {
    prisma.statisticalReport.findMany.mockRejectedValueOnce(secret);
    response = await endpoint('get');
  } else if (action === 'update') {
    prisma.statisticalReport.updateMany.mockRejectedValueOnce(secret);
    response = await endpoint('patch', `/${report.id}`).send({ title: 'New' });
  } else {
    prisma.statisticalReport.findUnique.mockRejectedValueOnce(secret);
    response = await endpoint(
      action === 'archive' ? 'delete' : 'get',
      `/${report.id}${action === 'pdf' ? '/pdf' : ''}`,
    );
  }
  expect(response.status).toBe(500);
  expect(JSON.stringify(response.body)).not.toMatch(
    /SQL|Prisma|DATABASE_URL|stack/,
  );
  expect((await endpoint('get', `/${report.id}`)).status).toBe(200);
});

test('invalid persisted evidence returns a safe 500 and is never replaced by current analytics', async () => {
  const report = await create();
  store.get(report.id)!.snapshot = { broken: true };
  const analyze = jest.spyOn(analyticsService, 'getAnalytics');
  const response = await endpoint('get', `/${report.id}`);
  expect(response.status).toBe(500);
  expect(response.body.error.message).toBe(
    'Unable to complete the saved report request. Please try again.',
  );
  expect(analyze).not.toHaveBeenCalled();
  expect(store.get(report.id)!.snapshot).toEqual({ broken: true });
});
test('history limits pages to 50 and supplies a usable cursor for older saved reports', async () => {
  const first = await create();
  const template = clone(store.get(first.id)!);
  for (let index = 2; index <= 51; index++) {
    const id = `c${String(index).padStart(24, '0')}`;
    store.set(id, {
      ...clone(template),
      id,
      createdAt: new Date(template.createdAt.getTime() + index * 1000),
    });
  }
  const firstPage = (await endpoint('get')).body.data;
  expect(firstPage.items).toHaveLength(50);
  expect(firstPage.nextCursor).toBeTruthy();
  const older = (await endpoint('get').query({ cursor: firstPage.nextCursor }))
    .body.data;
  expect(older.items).toHaveLength(1);
  expect(older.items[0].id).toBe(first.id);
  expect(older.nextCursor).toBeNull();
});
test.each(['/pdf', '/regenerate'])(
  'missing and malformed report IDs are controlled on %s',
  async (suffix) => {
    const method = suffix === '/pdf' ? 'get' : 'post';
    expect(
      (await endpoint(method, `/c000000000000000000000099${suffix}`).send({}))
        .status,
    ).toBe(404);
    expect((await endpoint(method, `/bad-id${suffix}`).send({})).status).toBe(
      400,
    );
  },
);
