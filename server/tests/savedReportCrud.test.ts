import { jest } from '@jest/globals';
import request from 'supertest';
import { Prisma, type StatisticalReport } from '@prisma/client';
import { unzipSync, strFromU8 } from 'fflate';
import { hasReportableFindings } from '../src/modules/analytics/reportEligibility.js';
import { reportFilename } from '../src/modules/analytics/reportContract.js';
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
function excel(id: string) {
  return endpoint('get', `/${id}/export`)
    .query({ format: 'xlsx' })
    .buffer(true)
    .parse((response, done) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => done(null, Buffer.concat(chunks)));
    });
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

describe('Batch 5 persisted report lifecycle', () => {
  test('neglected-only registered routes generate and save a valid report without fabricated activity', async () => {
    source = [];
    prisma.patrolRoute.findMany.mockResolvedValue([
      { id: 'route-1', name: 'North route', geometry: null },
      { id: 'route-2', name: 'River route', geometry: null },
      { id: 'route-3', name: 'Forest route', geometry: null },
    ]);
    const generated = await endpoint('post').send({
      criteria: { ...criteria, categories: ['PATROL_COVERAGE'] },
    });
    expect(generated.status).toBe(201);
    const report = generated.body.data;
    expect(report.analyticsResult.matchedRecords.patrols).toBe(0);
    expect(report.analyticsResult.patrolCoverage).toMatchObject({
      totalRoutes: 3,
      coveredRoutes: 0,
      limitedActivityRoutes: 0,
      neglectedRoutes: 3,
      coveragePercentage: 0,
      patrolSessionCount: 0,
    });
    expect(hasReportableFindings(report.analyticsResult)).toBe(true);
    for (const format of ['pdf', 'csv', 'xlsx']) {
      expect(
        (await endpoint('get', `/${report.id}/export`).query({ format }))
          .status,
      ).toBe(200);
    }
  });

  test('genuinely empty selected coverage stays no-data even when unrelated source incidents exist', async () => {
    expect(
      (
        await endpoint('post').send({
          criteria: { ...criteria, categories: ['PATROL_COVERAGE'] },
        })
      ).status,
    ).toBe(400);
    expect(store.size).toBe(0);
  });

  test.each(['pdf', 'csv', 'xlsx'])(
    '%s exports only saved values and never calls analytics',
    async (format) => {
      const report = await create();
      source.push(clone(source[0]));
      prisma.park.findUnique.mockResolvedValue({
        ...park,
        name: 'Current renamed park',
      });
      const analyze = jest.spyOn(analyticsService, 'getAnalytics');
      const response =
        format === 'xlsx'
          ? await excel(report.id)
          : await endpoint('get', `/${report.id}/export`).query({ format });
      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['content-disposition']).toMatch(
        new RegExp(
          `^attachment; filename="conservation-report-snap-\\d{4}-\\d{2}-\\d{2}\\.${format}"$`,
        ),
      );
      let content: string;
      if (format === 'xlsx') {
        expect(response.headers['content-type']).toContain(
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );
        const zip = unzipSync(response.body as Buffer);
        expect(Object.keys(zip)).toEqual(
          expect.arrayContaining([
            '[Content_Types].xml',
            'xl/workbook.xml',
            'xl/worksheets/sheet1.xml',
            'xl/worksheets/sheet2.xml',
          ]),
        );
        const workbook = strFromU8(zip['xl/workbook.xml']);
        expect(workbook).toContain('name="Summary"');
        expect(workbook).toContain('name="Incident Statistics"');
        expect(workbook).not.toMatch(
          /name="Patrol Coverage"|name="HWC Trends"|name="Incident Hotspots"/,
        );
        content = Object.entries(zip)
          .filter(([key]) => /\.xml$/.test(key))
          .map(([, value]) => strFromU8(value))
          .join('\n');
        expect(strFromU8(zip['xl/worksheets/sheet2.xml'])).toMatch(/<v>1<\/v>/);
        expect(content).toContain('Total incidents: 1');
      } else if (format === 'csv') {
        expect(response.headers['content-type']).toContain('text/csv');
        content = response.text;
        expect(content).toContain(
          '"Incident Statistics","Incidents by type","SNARE","1"',
        );
        expect(content).toContain('"Summary","Report metadata","Version","1"');
        expect(content).toContain(
          '"Summary","Executive Summary","Total incidents: 1"',
        );
        expect(content).not.toContain('"Patrol Coverage"');
        expect(content).not.toContain('{"');
      } else {
        expect(response.headers['content-type']).toContain('application/pdf');
        content = (response.body as Buffer).toString();
        expect(content).toContain('Version: 1');
        expect(content).toContain('Page 1 of');
        expect(content).toContain('Total incidents: 1');
      }
      expect(content).toContain(report.id);
      expect(content).toContain('Snapshot Park');
      expect(content).not.toContain('Current renamed park');
      expect(analyze).not.toHaveBeenCalled();
    },
  );

  test('all selected CSV sections and Excel sheets contain saved tables', async () => {
    const categories = [
      'INCIDENT_STATISTICS',
      'INCIDENT_HOTSPOTS',
      'PATROL_COVERAGE',
      'HWC_TRENDS',
    ];
    const response = await endpoint('post').send({
      criteria: { ...criteria, categories },
    });
    expect(response.status).toBe(201);
    const csv = await endpoint('get', `/${response.body.data.id}/export`).query(
      { format: 'csv' },
    );
    const workbookResponse = await excel(response.body.data.id);
    const zip = unzipSync(workbookResponse.body as Buffer);
    const workbook = strFromU8(zip['xl/workbook.xml']);
    for (const section of [
      'Summary',
      'Incident Statistics',
      'Incident Hotspots',
      'Patrol Coverage',
      'HWC Trends',
    ]) {
      expect(csv.text).toContain(`"${section}"`);
      expect(workbook).toContain(`name="${section}"`);
    }
    expect(csv.text).toContain('"End Date (inclusive UTC)","2026-10-07"');
    expect(csv.text).toContain('"HWC Trends","Findings","Total alerts","0"');
  });

  test.each(['pdf', 'csv', 'xlsx'])(
    '%s handles missing, malformed, archived and corrupt reports without recalculation',
    async (format) => {
      const analyze = jest.spyOn(analyticsService, 'getAnalytics');
      expect(
        (await endpoint('get', '/bad-id/export').query({ format })).status,
      ).toBe(400);
      expect(
        (
          await endpoint('get', '/c000000000000000000000099/export').query({
            format,
          })
        ).status,
      ).toBe(404);
      const report = await create();
      analyze.mockClear();
      const original = clone(store.get(report.id)!.snapshot);
      store.get(report.id)!.snapshot = { broken: true };
      expect(
        (await endpoint('get', `/${report.id}/export`).query({ format }))
          .status,
      ).toBe(500);
      store.get(report.id)!.snapshot = original;
      await endpoint('delete', `/${report.id}`);
      expect(
        (await endpoint('get', `/${report.id}/export`).query({ format }))
          .status,
      ).toBe(410);
      expect(analyze).not.toHaveBeenCalled();
    },
  );

  test.each([undefined, 'xml', 'PDF', '../xlsx', ['pdf', 'csv'], ''])(
    'rejects unsupported export format %p',
    async (format) => {
      const report = await create();
      const response = await endpoint('get', `/${report.id}/export`).query(
        format === undefined ? {} : { format },
      );
      expect(response.status).toBe(400);
    },
  );

  test('export rejects arbitrary query payload and manager guard still applies', async () => {
    const report = await create();
    expect(
      (
        await endpoint('get', `/${report.id}/export`).query({
          format: 'csv',
          filename: '../../private',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .get(`/api/analytics/reports/${report.id}/export`)
          .query({ format: 'csv' })
      ).status,
    ).toBe(403);
  });

  test('CSV quotes commas, quotes and line breaks, and spreadsheet formats protect text from formulas', async () => {
    const report = await create();
    await endpoint('patch', `/${report.id}`).send({
      title: '=SUM(1,2)',
      notes: 'Quoted "note",\nnext line',
    });
    const csv = await endpoint('get', `/${report.id}/export`).query({
      format: 'csv',
    });
    expect(csv.text).toContain('"\'=SUM(1,2)"');
    expect(csv.text).toContain('"Quoted ""note"",\nnext line"');
    const workbookResponse = await excel(report.id);
    const xml = Object.values(unzipSync(workbookResponse.body as Buffer))
      .map((value) => strFromU8(value))
      .join('\n');
    expect(xml).toContain('=SUM(1,2)');
    expect(xml).not.toContain('<f>');
  });

  test('filenames strip unsafe park characters and cannot contain path separators or header injection', () => {
    for (const format of ['pdf', 'csv', 'xlsx'] as const) {
      expect(
        reportFilename(
          {
            park: { ...park, code: '../../Unsafe\r\nPark"' },
            generatedAt: '2026-10-07T01:00:00.000Z',
          },
          format,
        ),
      ).toBe(`conservation-report-unsafe-park-2026-10-07.${format}`);
    }
  });
});
