import { jest } from '@jest/globals';
import request from 'supertest';
import type { Prisma } from '@prisma/client';

const parkA = 'c67a000000000000000000001';
const parkB = 'c67a000000000000000000099';
const storedAlerts = new Map<string, Record<string, unknown>>();
const prisma = {
  park: {
    findUnique:
      jest.fn<
        (args: Prisma.ParkFindUniqueArgs) => Promise<{ id: string } | null>
      >(),
  },
  patrolSession: {
    findUnique: jest.fn<
      (args: Prisma.PatrolSessionFindUniqueArgs) => Promise<{
        id: string;
        rangerId: string;
        patrolRoute: { parkId: string };
      } | null>
    >(),
    // Incident creation resolves the attached (or covering) patrol before deriving its park.
    findFirst: jest.fn<
      (args: Prisma.PatrolSessionFindFirstArgs) => Promise<{
        id: string;
        rangerId: string;
        startTime: Date;
      } | null>
    >(),
  },
  conflictAuditEntry: {
    // Alert create/acknowledge/respond/resolve record an audit entry.
    create:
      jest.fn<
        (args: Prisma.ConflictAuditEntryCreateArgs) => Promise<Record<string, unknown>>
      >(),
  },
  conservationIncident: {
    findFirst:
      jest.fn<
        (
          args: Prisma.ConservationIncidentFindFirstArgs,
        ) => Promise<Record<string, unknown> | null>
      >(),
    create:
      jest.fn<
        (
          args: Prisma.ConservationIncidentCreateArgs,
        ) => Promise<Record<string, unknown>>
      >(),
    findMany:
      jest.fn<
        (
          args: Prisma.ConservationIncidentFindManyArgs,
        ) => Promise<Record<string, unknown>[]>
      >(),
    findUnique:
      jest.fn<
        (
          args: Prisma.ConservationIncidentFindUniqueArgs,
        ) => Promise<Record<string, unknown> | null>
      >(),
  },
  wildlifeConflictAlert: {
    findFirst:
      jest.fn<
        (
          args: Prisma.WildlifeConflictAlertFindFirstArgs,
        ) => Promise<Record<string, unknown> | null>
      >(),
    create:
      jest.fn<
        (
          args: Prisma.WildlifeConflictAlertCreateArgs,
        ) => Promise<Record<string, unknown>>
      >(),
    update:
      jest.fn<
        (
          args: Prisma.WildlifeConflictAlertUpdateArgs,
        ) => Promise<Record<string, unknown>>
      >(),
    findMany:
      jest.fn<
        (
          args: Prisma.WildlifeConflictAlertFindManyArgs,
        ) => Promise<Record<string, unknown>[]>
      >(),
  },
};
jest.unstable_mockModule('../src/config/prisma.js', () => ({ prisma }));
const { createApp } = await import('../src/app.js');
const app = createApp();
const incident = {
  incidentType: 'SNARE',
  description: 'Recorded snare',
  latitude: -2.152,
  longitude: 34.822,
  // Evidence must be a JPEG/PNG/WebP data URL (see incidents/validation.ts).
  evidence: [{ imageUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD' }],
};
const alert = {
  source: 'COLLAR',
  alertType: 'CROP_RAID',
  severity: 'HIGH',
  latitude: -2.1523,
  longitude: 34.8214,
  description: 'Recorded wildlife conflict',
};

beforeEach(() => {
  for (const model of Object.values(prisma))
    for (const method of Object.values(model)) method.mockReset();
  storedAlerts.clear();
  prisma.park.findUnique.mockImplementation(async (args) =>
    args.where.id === parkA || args.where.id === parkB
      ? { id: String(args.where.id) }
      : null,
  );
  prisma.patrolSession.findUnique.mockResolvedValue({
    id: 'session-a',
    rangerId: 'R-101',
    patrolRoute: { parkId: parkA },
  });
  // Only an explicitly requested 'session-a' resolves; no patrol covers standalone reports.
  prisma.patrolSession.findFirst.mockImplementation(async (args) =>
    args.where?.OR?.some((clause) => clause.id === 'session-a')
      ? { id: 'session-a', rangerId: 'R-101', startTime: new Date(0) }
      : null,
  );
  prisma.conflictAuditEntry.create.mockResolvedValue({});
  prisma.conservationIncident.findFirst.mockResolvedValue(null);
  prisma.conservationIncident.create.mockImplementation(async (args) => ({
    id: 'incident-a',
    ...args.data,
    evidence: [{ evidenceId: 'evidence-a' }],
  }));
  prisma.wildlifeConflictAlert.findFirst.mockImplementation(async (args) => {
    const where = args.where;
    return (
      [...storedAlerts.values()].find((row) =>
        where?.OR
          ? where.OR.some(
              (clause) =>
                clause.id === row.id ||
                (clause.clientAlertId &&
                  clause.clientAlertId === row.clientAlertId),
            )
          : where?.sourceEventId
            ? where.sourceEventId === row.sourceEventId
            : where?.clientAlertId === row.clientAlertId,
      ) ?? null
    );
  });
  prisma.wildlifeConflictAlert.create.mockImplementation(async (args) => {
    const row = {
      id: `alert-${storedAlerts.size}`,
      createdAt: new Date(),
      ...args.data,
      responses: [],
    };
    storedAlerts.set(row.id, row);
    return row;
  });
  // getAlerts queries active and historical statuses separately.
  prisma.wildlifeConflictAlert.findMany.mockImplementation(async (args) => {
    const status = args.where?.status;
    const matches = (value: unknown) =>
      status === undefined ||
      (typeof status === 'object' && status !== null && 'in' in status
        ? (status.in as unknown[]).includes(value)
        : status === value);
    return [...storedAlerts.values()].filter((row) => matches(row.status));
  });
  prisma.wildlifeConflictAlert.update.mockImplementation(async (args) => {
    const row = storedAlerts.get(String(args.where.id))!;
    const { responses, ...values } = args.data;
    const existing = row.responses as Record<string, unknown>[];
    const updated = {
      ...row,
      ...values,
      responses: responses?.create ? [...existing, responses.create] : existing,
    };
    storedAlerts.set(String(row.id), updated);
    return updated;
  });
});

test.each([undefined, parkA])(
  'standalone incident creation remains compatible and accepts explicit park %s',
  async (parkId) => {
    const response = await request(app)
      .post('/api/incidents')
      .send({ ...incident, parkId });
    expect(response.status).toBe(201);
    expect(response.body.data._id).toBe('incident-a');
    expect(
      prisma.conservationIncident.create.mock.calls[0][0].data.parkId,
    ).toBe(parkId);
    expect(response.body.data.evidence).toHaveLength(1);
  },
);
test('patrol incident derives and persists the route park; rejects conflicting explicit park and another ranger', async () => {
  const good = await request(app)
    .post('/api/incidents')
    .send({ ...incident, patrolSessionId: 'session-a' });
  expect(good.status).toBe(201);
  expect(good.body.data).toMatchObject({
    parkId: parkA,
    patrolSessionId: 'session-a',
  });
  const conflict = await request(app)
    .post('/api/incidents')
    .send({ ...incident, patrolSessionId: 'session-a', parkId: parkB });
  expect(conflict.status).toBe(400);
  const unauthorized = await request(app)
    .post('/api/incidents')
    .set('x-ranger-id', 'other')
    .send({ ...incident, patrolSessionId: 'session-a' });
  expect(unauthorized.status).toBe(403);
  expect(prisma.conservationIncident.create).toHaveBeenCalledTimes(1);
});
test.each([
  '/api/incidents',
  '/api/conflict-alerts',
  '/api/conflict-alerts/community-report',
  '/api/conflict-alerts/simulate-collar',
])(
  '%s rejects nonexistent and malformed parks before writing',
  async (endpoint) => {
    const input =
      endpoint === '/api/incidents'
        ? incident
        : { ...alert, reportType: 'CROP_RAID', animalId: 'ELEPHANT-001' };
    for (const parkId of ['bad-id', 'c67a000000000000000000088']) {
      const response = await request(app)
        .post(endpoint)
        .send({ ...input, parkId });
      expect(response.status).toBe(400);
    }
    expect(prisma.conservationIncident.create).not.toHaveBeenCalled();
    expect(prisma.wildlifeConflictAlert.create).not.toHaveBeenCalled();
  },
);
test.each([undefined, parkA])(
  'API/collar/community creation preserve optional park context %s',
  async (parkId) => {
    const direct = await request(app)
      .post('/api/conflict-alerts')
      .send({ ...alert, parkId });
    const collar = await request(app)
      .post('/api/conflict-alerts/simulate-collar')
      .send({ ...alert, parkId, animalId: 'ELEPHANT-001' });
    const community = await request(app)
      .post('/api/conflict-alerts/community-report')
      .send({ ...alert, parkId, reportType: 'CROP_RAID' });
    for (const response of [direct, collar, community]) {
      expect(response.status).toBe(201);
      expect(response.body.data.parkId).toBe(parkId);
    }
    expect(collar.body.data.alertCreated).toBe(true);
    expect(community.body.data.source).toBe('COMMUNITY_REPORT');
  },
);
test('collar outside risk zones remains telemetry-only, without creating an alert', async () => {
  const response = await request(app)
    .post('/api/conflict-alerts/simulate-collar')
    .send({
      ...alert,
      animalId: 'ELEPHANT-001',
      latitude: 0,
      longitude: 0,
      parkId: parkA,
    });
  expect(response.status).toBe(201);
  expect(response.body.data.alertCreated).toBe(false);
  expect(prisma.wildlifeConflictAlert.create).not.toHaveBeenCalled();
});
test('generated collar event keys retain same-park idempotency without swallowing another explicit park context', async () => {
  const input = { ...alert, animalId: 'ELEPHANT-001' };
  const a = await request(app)
    .post('/api/conflict-alerts/simulate-collar')
    .send({ ...input, parkId: parkA });
  const retry = await request(app)
    .post('/api/conflict-alerts/simulate-collar')
    .send({ ...input, parkId: parkA });
  const b = await request(app)
    .post('/api/conflict-alerts/simulate-collar')
    .send({ ...input, parkId: parkB });
  expect(a.body.data._id).toBe(retry.body.data._id);
  expect(a.body.data._id).not.toBe(b.body.data._id);
  expect(b.body.data.parkId).toBe(parkB);
  expect(prisma.wildlifeConflictAlert.create).toHaveBeenCalledTimes(2);
});
test('assigned alerts retain list/detail/acknowledge/respond/resolve/history and idempotent create behavior', async () => {
  const created = await request(app)
    .post('/api/conflict-alerts')
    .send({ ...alert, parkId: parkA, clientAlertId: 'stable-create' });
  const id = created.body.data._id;
  const repeated = await request(app)
    .post('/api/conflict-alerts')
    .send({ ...alert, parkId: parkB, clientAlertId: 'stable-create' });
  expect(repeated.body.data.parkId).toBe(parkA); // Retries never reassign existing records.
  expect(prisma.wildlifeConflictAlert.create).toHaveBeenCalledTimes(1);
  const ack = await request(app)
    .post(`/api/conflict-alerts/${id}/acknowledge`)
    .send({ clientAcknowledgementId: 'ack-a' });
  expect(ack.body.data).toMatchObject({
    parkId: parkA,
    status: 'ACKNOWLEDGED',
  });
  const response = await request(app)
    .post(`/api/conflict-alerts/${id}/responses`)
    .send({
      action: 'INVESTIGATED_AREA',
      notes: 'Investigated area',
      clientResponseId: 'response-a',
    });
  expect(response.body.data).toMatchObject({
    parkId: parkA,
    status: 'RESPONDING',
  });
  expect(response.body.data.responses).toHaveLength(1);
  const resolved = await request(app)
    .post(`/api/conflict-alerts/${id}/resolve`)
    .send({ resolutionNotes: 'Wildlife redirected' });
  expect(resolved.body.data).toMatchObject({
    parkId: parkA,
    status: 'RESOLVED',
  });
  const detail = await request(app).get(`/api/conflict-alerts/${id}`);
  expect(detail.status).toBe(200);
  expect(detail.body.data.responses).toHaveLength(1);
  const list = await request(app).get('/api/conflict-alerts');
  expect(list.body.data).toHaveLength(1);
  expect(list.body.data[0].parkId).toBe(parkA);
});
test('incident retry returns the existing record without changing its park or duplicating evidence', async () => {
  prisma.conservationIncident.findFirst.mockResolvedValueOnce({
    id: 'original',
    parkId: parkA,
    evidence: [{ evidenceId: 'original-photo' }],
  });
  const response = await request(app)
    .post('/api/incidents')
    .send({ ...incident, clientIncidentId: 'stable-id', parkId: parkB });
  expect(response.status).toBe(201);
  expect(response.body.data).toMatchObject({ _id: 'original', parkId: parkA });
  expect(prisma.conservationIncident.create).not.toHaveBeenCalled();
});
