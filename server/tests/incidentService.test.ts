import { jest } from '@jest/globals';
import { ZodError } from 'zod';
import { prisma, resetIncidentPrisma } from './incidentPrismaMock.js';
import { IncidentDeletionReason, IncidentStatus, IncidentType, LocationSource, PatrolStatus, SyncStatus } from '../src/types/enums.js';

const { incidentService, getEditLockReason, STANDALONE_EDIT_WINDOW_MS } = await import('../src/modules/incidents/service.js');
const { reverseGeocoder } = await import('../src/modules/shared/reverseGeocoder.js');
const { placeNameBackfill } = await import('../src/modules/incidents/placeNames.js');

// UC-B incident service business rules with Prisma mocked (no database). The clock is fixed at NOW.
const NOW = new Date('2026-10-08T12:00:00.000Z');
const minutes = (n: number) => n * 60 * 1000;
const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs);
const RANGER = 'R-1';
const PARK = 'c67a000000000000000000001';
const UPDATED = new Date('2026-10-08T11:30:00.000Z');
const jpeg = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD';

const incidentRow = (overrides: Record<string, any> = {}) => ({
  id: 'inc-1',
  clientIncidentId: 'client-1',
  reportedBy: RANGER,
  rangerName: 'Ranger One',
  incidentType: IncidentType.SNARE,
  otherTypeDescription: null,
  description: 'Wire snare on the fence',
  location: { latitude: 6.475, longitude: 80.88, source: LocationSource.GPS, timestamp: at(-minutes(60)).toISOString() },
  reportedAt: at(-minutes(60)),
  updatedAt: UPDATED,
  status: IncidentStatus.REPORTED,
  syncStatus: SyncStatus.SYNCED,
  deletedAt: null,
  deletionReason: null,
  deletionNote: null,
  patrolSessionId: null,
  patrolSession: null,
  evidence: [{ evidenceId: 'evid-1', imageUrl: jpeg }],
  ...overrides
});
const createInput = (overrides: Record<string, any> = {}) => ({
  incidentType: IncidentType.SNARE,
  description: 'Wire snare on the fence',
  latitude: 6.475,
  longitude: 80.88,
  locationSource: LocationSource.GPS,
  evidence: [{ imageUrl: jpeg }],
  ...overrides
});
const editMeta = (overrides: Record<string, any> = {}) => ({
  expectedUpdatedAt: UPDATED.toISOString(),
  editedAt: NOW.toISOString(),
  clientEditId: 'edit-1',
  ...overrides
});
const withdrawal = (overrides: Record<string, any> = {}) => ({
  expectedUpdatedAt: UPDATED.toISOString(),
  deletedAt: NOW.toISOString(),
  clientDeleteId: 'delete-1',
  reason: IncidentDeletionReason.DUPLICATE,
  ...overrides
});
const appError = (statusCode: number, code: string) => expect.objectContaining({ statusCode, code });
/** Loads `existing` for the write, then `after` for the response read. */
const loadThen = (existing: object, after: object = existing) =>
  prisma.conservationIncident.findUnique.mockResolvedValueOnce(existing).mockResolvedValueOnce(after);
const echoCreate = () =>
  prisma.conservationIncident.create.mockImplementation(async (args?: any) => ({
    id: 'inc-new',
    ...args.data,
    deletedAt: null,
    patrolSession: null,
    evidence: args.data.evidence.create
  }));

beforeEach(() => {
  jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
  resetIncidentPrisma();
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('edit lock rules (getEditLockReason)', () => {
  test('a report under investigation or resolved is always locked', () => {
    expect(getEditLockReason(incidentRow({ status: IncidentStatus.INVESTIGATING }), NOW)).toBe('UNDER_INVESTIGATION');
    expect(getEditLockReason(incidentRow({ status: IncidentStatus.RESOLVED }), NOW)).toBe('INCIDENT_RESOLVED');
  });

  test.each([PatrolStatus.ACTIVE, PatrolStatus.PAUSED])('a report on a %s patrol is editable', status => {
    expect(getEditLockReason(incidentRow({ patrolSession: { status } }), NOW)).toBeNull();
  });

  test('a report on an ended patrol is editable only for changes made before it ended', () => {
    const completed = incidentRow({ patrolSession: { status: PatrolStatus.COMPLETED, endTime: at(-minutes(10)) } });
    expect(getEditLockReason(completed, at(-minutes(10)))).toBeNull();
    expect(getEditLockReason(completed, at(-minutes(9)))).toBe('PATROL_COMPLETED');
    expect(getEditLockReason(incidentRow({ patrolSession: { status: PatrolStatus.CANCELLED, endTime: at(-minutes(10)) } }), NOW)).toBe('PATROL_CANCELLED');
    expect(getEditLockReason(incidentRow({ patrolSession: { status: PatrolStatus.COMPLETED, endTime: null } }), NOW)).toBe('PATROL_COMPLETED');
  });

  test('a standalone report is editable for exactly 24 hours', () => {
    const reported = incidentRow({ reportedAt: NOW });
    expect(getEditLockReason(reported, at(STANDALONE_EDIT_WINDOW_MS))).toBeNull();
    expect(getEditLockReason(reported, at(STANDALONE_EDIT_WINDOW_MS + 1))).toBe('EDIT_WINDOW_EXPIRED');
  });
});

describe('create incident', () => {
  test('stores a GPS report with the ranger, type, description, location, photos and default statuses', async () => {
    echoCreate();

    const created = await incidentService.createIncident(RANGER, 'Ranger One', createInput({ evidence: [{ imageUrl: jpeg, fileSize: 2048, capturedAt: '2026-10-08T11:55:00.000Z' }, { imageUrl: jpeg }] }));

    const data = prisma.conservationIncident.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      reportedBy: RANGER,
      rangerName: 'Ranger One',
      incidentType: IncidentType.SNARE,
      otherTypeDescription: undefined,
      description: 'Wire snare on the fence',
      location: { latitude: 6.475, longitude: 80.88, timestamp: NOW.toISOString(), source: LocationSource.GPS },
      reportedAt: NOW,
      patrolSessionId: undefined,
      status: IncidentStatus.REPORTED,
      syncStatus: SyncStatus.SYNCED
    });
    // The lookup service is unavailable in tests, so no place name is stored yet.
    expect(data.location).not.toHaveProperty('placeName');
    expect(data.evidence.create).toEqual([
      { evidenceId: expect.stringMatching(/^evid-/), imageUrl: jpeg, capturedAt: new Date('2026-10-08T11:55:00.000Z'), fileSize: 2048, mimeType: 'image/jpeg' },
      { evidenceId: expect.stringMatching(/^evid-/), imageUrl: jpeg, capturedAt: NOW, fileSize: undefined, mimeType: 'image/jpeg' }
    ]);
    expect(created).toMatchObject({ _id: 'inc-new', canEdit: true, canDelete: true, canRestore: false, editLockedReason: null });
  });

  test('stores a manually pinned location as MANUAL', async () => {
    echoCreate();
    await incidentService.createIncident(RANGER, 'Ranger One', createInput({ locationSource: LocationSource.MANUAL, latitude: 0, longitude: 0 }));
    expect(prisma.conservationIncident.create.mock.calls[0][0].data.location).toMatchObject({ latitude: 0, longitude: 0, source: LocationSource.MANUAL });
  });

  test('keeps the "Other" threat name only for OTHER reports', async () => {
    echoCreate();
    await incidentService.createIncident(RANGER, 'R', createInput({ incidentType: IncidentType.OTHER, otherTypeDescription: 'Fence cut' }));
    await incidentService.createIncident(RANGER, 'R', createInput({ otherTypeDescription: 'ignored' }));
    expect(prisma.conservationIncident.create.mock.calls.map(call => call[0].data.otherTypeDescription)).toEqual(['Fence cut', undefined]);
  });

  test('an offline report keeps the device report time', async () => {
    echoCreate();
    await incidentService.createIncident(RANGER, 'R', createInput({ reportedAt: '2026-10-08T09:00:00.000Z' }));
    const data = prisma.conservationIncident.create.mock.calls[0][0].data;
    expect(data.reportedAt).toEqual(new Date('2026-10-08T09:00:00.000Z'));
    expect(data.location.timestamp).toBe('2026-10-08T09:00:00.000Z');
  });

  test('a report time up to 5 minutes ahead (clock skew) is accepted; later is rejected', async () => {
    echoCreate();
    await expect(incidentService.createIncident(RANGER, 'R', createInput({ reportedAt: at(minutes(5)).toISOString() }))).resolves.toBeTruthy();
    await expect(incidentService.createIncident(RANGER, 'R', createInput({ reportedAt: at(minutes(5) + 1).toISOString() }))).rejects.toEqual(
      appError(400, 'INVALID_REPORT_TIME')
    );
    expect(prisma.conservationIncident.create).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['a place name', 'Pannipitiya, Sri Lanka', { placeName: 'Pannipitiya, Sri Lanka' }],
    ['no named place', null, { placeName: null }]
  ])('stores %s from reverse geocoding', async (_label, lookup, expected) => {
    jest.spyOn(reverseGeocoder, 'lookup').mockResolvedValue(lookup);
    echoCreate();

    await incidentService.createIncident(RANGER, 'R', createInput());

    expect(reverseGeocoder.lookup).toHaveBeenCalledWith(6.475, 80.88, 3000);
    expect(prisma.conservationIncident.create.mock.calls[0][0].data.location).toMatchObject(expected);
  });

  test('links the patrol the ranger named and takes the park from its route', async () => {
    prisma.patrolSession.findFirst.mockResolvedValueOnce({ id: 'sess-1', rangerId: RANGER, startTime: at(-minutes(120)) });
    prisma.patrolSession.findUnique.mockResolvedValue({ id: 'sess-1', patrolRoute: { parkId: PARK } });
    prisma.park.findUnique.mockResolvedValue({ id: PARK });
    echoCreate();

    await incidentService.createIncident(RANGER, 'R', createInput({ patrolSessionId: 'sess-offline-7' }));

    expect(prisma.patrolSession.findFirst.mock.calls[0][0].where).toEqual({ OR: [{ id: 'sess-offline-7' }, { clientSessionId: 'sess-offline-7', rangerId: RANGER }] });
    expect(prisma.conservationIncident.create.mock.calls[0][0].data).toMatchObject({ patrolSessionId: 'sess-1', parkId: PARK });
  });

  test('a report made during a running patrol is linked to it automatically', async () => {
    prisma.patrolSession.findFirst.mockResolvedValueOnce({ id: 'covering' });
    prisma.patrolSession.findUnique.mockResolvedValue({ id: 'covering', patrolRoute: { parkId: PARK } });
    prisma.park.findUnique.mockResolvedValue({ id: PARK });
    echoCreate();

    await incidentService.createIncident(RANGER, 'R', createInput());

    expect(prisma.patrolSession.findFirst.mock.calls[0][0].where).toMatchObject({ rangerId: RANGER, status: { not: PatrolStatus.ASSIGNED } });
    expect(prisma.conservationIncident.create.mock.calls[0][0].data.patrolSessionId).toBe('covering');
  });

  test("rejects attaching another ranger's patrol", async () => {
    prisma.patrolSession.findFirst.mockResolvedValueOnce({ id: 'sess-x', rangerId: 'R-OTHER', startTime: at(-minutes(60)) });
    await expect(incidentService.createIncident(RANGER, 'R', createInput({ patrolSessionId: 'sess-x' }))).rejects.toEqual(appError(403, 'FORBIDDEN'));
    expect(prisma.conservationIncident.create).not.toHaveBeenCalled();
  });

  test('rejects a report dated before its patrol started', async () => {
    prisma.patrolSession.findFirst.mockResolvedValueOnce({ id: 'sess-1', rangerId: RANGER, startTime: at(-minutes(30)) });
    await expect(
      incidentService.createIncident(RANGER, 'R', createInput({ patrolSessionId: 'sess-1', reportedAt: at(-minutes(36)).toISOString() }))
    ).rejects.toEqual(appError(400, 'REPORT_BEFORE_PATROL'));
  });

  test('rejects a park that conflicts with the patrol or does not exist', async () => {
    prisma.patrolSession.findFirst.mockResolvedValueOnce({ id: 'sess-1', rangerId: RANGER, startTime: at(-minutes(60)) });
    prisma.patrolSession.findUnique.mockResolvedValue({ id: 'sess-1', patrolRoute: { parkId: 'c67a000000000000000000099' } });
    await expect(incidentService.createIncident(RANGER, 'R', createInput({ patrolSessionId: 'sess-1', parkId: PARK }))).rejects.toBeInstanceOf(ZodError);

    prisma.park.findUnique.mockResolvedValue(null);
    await expect(incidentService.createIncident(RANGER, 'R', createInput({ parkId: PARK }))).rejects.toBeInstanceOf(ZodError);
    expect(prisma.conservationIncident.create).not.toHaveBeenCalled();
  });

  test('a retried offline sync returns the existing report instead of a duplicate, even if withdrawn', async () => {
    prisma.conservationIncident.findFirst.mockResolvedValue(incidentRow({ deletedAt: at(-minutes(5)) }));

    const result = await incidentService.createIncident(RANGER, 'R', createInput({ clientIncidentId: 'client-1' }));

    expect(prisma.conservationIncident.findFirst.mock.calls[0][0].where).toEqual({ clientIncidentId: 'client-1', reportedBy: RANGER });
    expect(prisma.conservationIncident.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({ _id: 'inc-1', canEdit: false, canRestore: true });
  });

  test('propagates a database failure while saving', async () => {
    prisma.conservationIncident.create.mockRejectedValue(new Error('insert failed'));
    await expect(incidentService.createIncident(RANGER, 'R', createInput())).rejects.toThrow('insert failed');
  });

  test('a failed patrol lookup stops the report from being saved', async () => {
    prisma.patrolSession.findFirst.mockRejectedValue(new Error('connection reset'));
    await expect(incidentService.createIncident(RANGER, 'R', createInput())).rejects.toThrow('connection reset');
    expect(prisma.conservationIncident.create).not.toHaveBeenCalled();
  });
});

describe('read incidents', () => {
  test("lists the ranger's active reports newest first with edit permissions", async () => {
    const schedule = jest.spyOn(placeNameBackfill, 'schedule');
    const rows = [incidentRow(), incidentRow({ id: 'inc-2', status: IncidentStatus.INVESTIGATING })];
    prisma.conservationIncident.findMany.mockResolvedValue(rows);

    const list = await incidentService.getRangerIncidents(RANGER);

    expect(prisma.conservationIncident.findMany.mock.calls[0][0]).toMatchObject({ where: { reportedBy: RANGER, deletedAt: null }, orderBy: { reportedAt: 'desc' } });
    expect(list.map((item: { _id: string; canEdit: boolean; editLockedReason: string | null }) => [item._id, item.canEdit, item.editLockedReason])).toEqual([
      ['inc-1', true, null],
      ['inc-2', false, 'UNDER_INVESTIGATION']
    ]);
    // Reports without a place name are handed to the background lookup.
    expect(schedule).toHaveBeenCalledWith(rows);
  });

  test('returns one report and rejects missing, foreign and withdrawn reports', async () => {
    prisma.conservationIncident.findUnique
      .mockResolvedValueOnce(incidentRow())
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(incidentRow({ reportedBy: 'R-OTHER' }))
      .mockResolvedValueOnce(incidentRow({ deletedAt: at(-minutes(1)) }));

    await expect(incidentService.getIncidentById(RANGER, 'inc-1')).resolves.toMatchObject({ _id: 'inc-1', canEdit: true });
    await expect(incidentService.getIncidentById(RANGER, 'missing')).rejects.toEqual(appError(404, 'INCIDENT_NOT_FOUND'));
    await expect(incidentService.getIncidentById(RANGER, 'inc-1')).rejects.toEqual(appError(403, 'FORBIDDEN'));
    await expect(incidentService.getIncidentById(RANGER, 'inc-1')).rejects.toEqual(appError(410, 'INCIDENT_DELETED'));
  });
});

describe('edit incident', () => {
  test('saves a changed description atomically with an audit revision', async () => {
    loadThen(incidentRow(), incidentRow({ description: 'Two wire snares' }));

    const updated = await incidentService.updateIncident(RANGER, 'Ranger One', 'inc-1', editMeta({ description: 'Two wire snares' }));

    expect(prisma.conservationIncident.updateMany).toHaveBeenCalledWith({
      where: { id: 'inc-1', updatedAt: UPDATED },
      data: { description: 'Two wire snares', editCount: { increment: 1 }, lastEditedAt: NOW, updatedAt: NOW }
    });
    expect(prisma.incidentRevision.create).toHaveBeenCalledWith({
      data: {
        incidentId: 'inc-1',
        clientEditId: 'edit-1',
        editedBy: RANGER,
        editedByName: 'Ranger One',
        editedAt: NOW,
        changes: { description: { from: 'Wire snare on the fence', to: 'Two wire snares' } }
      }
    });
    expect(updated.description).toBe('Two wire snares');
  });

  test('a corrected location is stored as given, with the edit time and a fresh place name', async () => {
    jest.spyOn(reverseGeocoder, 'lookup').mockResolvedValue('Embilipitiya, Sri Lanka');
    loadThen(incidentRow());

    await incidentService.updateIncident(RANGER, 'R', 'inc-1', editMeta({ location: { latitude: 6.5, longitude: 80.9, source: LocationSource.MANUAL } }));

    expect(prisma.conservationIncident.updateMany.mock.calls[0][0].data.location).toEqual({
      latitude: 6.5,
      longitude: 80.9,
      timestamp: NOW.toISOString(),
      source: LocationSource.MANUAL,
      placeName: 'Embilipitiya, Sri Lanka'
    });
  });

  test('changing to OTHER requires a threat name, and leaving OTHER clears it', async () => {
    loadThen(incidentRow());
    await expect(incidentService.updateIncident(RANGER, 'R', 'inc-1', editMeta({ incidentType: IncidentType.OTHER }))).rejects.toEqual(
      appError(400, 'OTHER_DESCRIPTION_REQUIRED')
    );
    prisma.conservationIncident.findUnique.mockReset();

    loadThen(incidentRow({ incidentType: IncidentType.OTHER, otherTypeDescription: 'Fence cut' }));
    await incidentService.updateIncident(RANGER, 'R', 'inc-1', editMeta({ incidentType: IncidentType.SNARE }));
    expect(prisma.conservationIncident.updateMany.mock.calls[0][0].data).toMatchObject({ incidentType: IncidentType.SNARE, otherTypeDescription: null });
  });

  test('replaces photos: removed ones are soft-deleted and new ones added', async () => {
    loadThen(incidentRow({ evidence: [{ evidenceId: 'evid-1' }, { evidenceId: 'evid-2' }] }));

    await incidentService.updateIncident(RANGER, 'R', 'inc-1', editMeta({ removeEvidenceIds: ['evid-1', 'evid-1'], addEvidence: [{ imageUrl: jpeg, mimeType: 'image/jpeg' }] }));

    expect(prisma.incidentEvidence.updateMany).toHaveBeenCalledWith({
      where: { incidentId: 'inc-1', evidenceId: { in: ['evid-1'] }, removedAt: null },
      data: { removedAt: NOW }
    });
    const [added] = prisma.incidentEvidence.createMany.mock.calls[0][0].data;
    expect(added).toMatchObject({ incidentId: 'inc-1', imageUrl: jpeg, capturedAt: NOW, mimeType: 'image/jpeg' });
    expect(prisma.incidentRevision.create.mock.calls[0][0].data.changes.evidence).toEqual({ added: [added.evidenceId], removed: ['evid-1'] });
  });

  test.each([
    ['removing the last photo', { removeEvidenceIds: ['evid-1'] }, 'EVIDENCE_REQUIRED'],
    ["removing another report's photo", { removeEvidenceIds: ['evid-other'] }, 'EVIDENCE_NOT_FOUND'],
    ['sending the same values', { description: 'Wire snare on the fence' }, 'NO_CHANGES']
  ])('rejects %s', async (_label, change, code) => {
    loadThen(incidentRow());
    await expect(incidentService.updateIncident(RANGER, 'R', 'inc-1', editMeta(change))).rejects.toEqual(appError(400, code));
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  test('rejects more than five photos in total', async () => {
    loadThen(incidentRow({ evidence: [1, 2, 3, 4, 5].map(n => ({ evidenceId: `evid-${n}` })) }));
    await expect(incidentService.updateIncident(RANGER, 'R', 'inc-1', editMeta({ addEvidence: [{ imageUrl: jpeg }] }))).rejects.toEqual(
      appError(400, 'TOO_MANY_EVIDENCE')
    );
  });

  test('rejects missing, foreign and withdrawn reports', async () => {
    prisma.conservationIncident.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(incidentRow({ reportedBy: 'R-OTHER' }))
      .mockResolvedValueOnce(incidentRow({ deletedAt: at(-minutes(1)) }));
    const edit = editMeta({ description: 'Changed' });
    await expect(incidentService.updateIncident(RANGER, 'R', 'x', edit)).rejects.toEqual(appError(404, 'INCIDENT_NOT_FOUND'));
    await expect(incidentService.updateIncident(RANGER, 'R', 'inc-1', edit)).rejects.toEqual(appError(403, 'FORBIDDEN'));
    await expect(incidentService.updateIncident(RANGER, 'R', 'inc-1', edit)).rejects.toEqual(appError(410, 'INCIDENT_DELETED'));
  });

  test('a stale version is rejected with the current version for the client', async () => {
    loadThen(incidentRow());
    await expect(
      incidentService.updateIncident(RANGER, 'R', 'inc-1', editMeta({ description: 'Changed', expectedUpdatedAt: '2026-10-08T11:00:00.000Z' }))
    ).rejects.toEqual(expect.objectContaining({ statusCode: 409, code: 'EDIT_CONFLICT', details: { currentUpdatedAt: UPDATED.toISOString() } }));
  });

  test('a change saved by another device during the write is reported as a conflict', async () => {
    loadThen(incidentRow());
    prisma.conservationIncident.updateMany.mockResolvedValue({ count: 0 });
    await expect(incidentService.updateIncident(RANGER, 'R', 'inc-1', editMeta({ description: 'Changed' }))).rejects.toEqual(appError(409, 'EDIT_CONFLICT'));
    expect(prisma.incidentRevision.create).not.toHaveBeenCalled();
  });

  test('a retried edit is applied only once', async () => {
    prisma.incidentRevision.findUnique.mockResolvedValue({ id: 'rev-1' });
    loadThen(incidentRow(), incidentRow({ description: 'Changed' }));

    const result = await incidentService.updateIncident(RANGER, 'R', 'inc-1', editMeta({ description: 'Changed' }));

    expect(result.description).toBe('Changed');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  test('two identical retries racing: the unique-constraint loser returns the saved report', async () => {
    loadThen(incidentRow(), incidentRow({ description: 'Changed' }));
    prisma.incidentRevision.create.mockRejectedValue(Object.assign(new Error('Unique constraint'), { code: 'P2002' }));

    await expect(incidentService.updateIncident(RANGER, 'R', 'inc-1', editMeta({ description: 'Changed' }))).resolves.toMatchObject({ description: 'Changed' });
  });

  test('propagates any other database failure during the write', async () => {
    loadThen(incidentRow());
    prisma.$transaction.mockRejectedValue(new Error('deadlock'));
    await expect(incidentService.updateIncident(RANGER, 'R', 'inc-1', editMeta({ description: 'Changed' }))).rejects.toThrow('deadlock');
  });

  test.each([
    ['in the future', at(minutes(6))],
    ['before the report existed', at(-minutes(66))]
  ])('rejects an edit time %s', async (_label, editedAt) => {
    loadThen(incidentRow());
    await expect(incidentService.updateIncident(RANGER, 'R', 'inc-1', editMeta({ description: 'Changed', editedAt: editedAt.toISOString() }))).rejects.toEqual(
      appError(400, 'INVALID_EDIT_TIME')
    );
  });

  test('a standalone report can be edited at exactly 24 hours but not after', async () => {
    loadThen(incidentRow({ reportedAt: at(-STANDALONE_EDIT_WINDOW_MS) }));
    await expect(incidentService.updateIncident(RANGER, 'R', 'inc-1', editMeta({ description: 'Changed' }))).resolves.toBeTruthy();

    loadThen(incidentRow({ reportedAt: at(-STANDALONE_EDIT_WINDOW_MS - 1) }));
    await expect(incidentService.updateIncident(RANGER, 'R', 'inc-1', editMeta({ description: 'Changed' }))).rejects.toEqual(
      expect.objectContaining({ statusCode: 409, code: 'INCIDENT_LOCKED', details: { reason: 'EDIT_WINDOW_EXPIRED' } })
    );
  });

  test('a report under investigation cannot be edited', async () => {
    loadThen(incidentRow({ status: IncidentStatus.INVESTIGATING }));
    await expect(incidentService.updateIncident(RANGER, 'R', 'inc-1', editMeta({ description: 'Changed' }))).rejects.toEqual(
      expect.objectContaining({ code: 'INCIDENT_LOCKED', details: { reason: 'UNDER_INVESTIGATION' } })
    );
  });

  test('an offline edit made before the patrol ended is accepted when it syncs later', async () => {
    const patrolSession = { status: PatrolStatus.COMPLETED, endTime: at(-minutes(10)), waypoints: [], patrolRoute: null };
    loadThen(incidentRow({ patrolSessionId: 'sess-1', patrolSession }));

    await expect(
      incidentService.updateIncident(RANGER, 'R', 'inc-1', editMeta({ description: 'Changed', editedAt: at(-minutes(20)).toISOString() }))
    ).resolves.toBeTruthy();
  });

  describe('location rules for a patrol-linked report', () => {
    // Waypoint at (6.475, 80.88) and a route vertex at [80.95, 6.5] ([lng, lat]).
    const patrolSession = {
      status: PatrolStatus.ACTIVE,
      waypoints: [{ latitude: 6.475, longitude: 80.88 }],
      patrolRoute: { geometry: { coordinates: [[80.95, 6.5]] } }
    };

    test('a location within 5 km of the patrol track is accepted', async () => {
      loadThen(incidentRow({ patrolSessionId: 'sess-1', patrolSession }));
      await incidentService.updateIncident(RANGER, 'R', 'inc-1', editMeta({ location: { latitude: 6.5, longitude: 80.98, source: LocationSource.MANUAL } }));
      expect(prisma.conservationIncident.updateMany).toHaveBeenCalledTimes(1);
    });

    test('a location more than 5 km from the patrol track is rejected with the distance', async () => {
      loadThen(incidentRow({ patrolSessionId: 'sess-1', patrolSession }));
      await expect(
        incidentService.updateIncident(RANGER, 'R', 'inc-1', editMeta({ location: { latitude: 6.6, longitude: 80.88, source: LocationSource.MANUAL } }))
      ).rejects.toEqual(expect.objectContaining({ code: 'LOCATION_TOO_FAR_FROM_PATROL', message: expect.stringMatching(/^The new location is 13\.5 km from the patrol route/) }));
    });
  });

  describe('linking a standalone report to a patrol', () => {
    const openPatrol = { id: 'sess-1', rangerId: RANGER, status: PatrolStatus.ACTIVE, startTime: at(-minutes(120)), waypoints: [], patrolRoute: null };

    test("links the report to the ranger's open patrol", async () => {
      loadThen(incidentRow());
      prisma.patrolSession.findUnique.mockResolvedValue(openPatrol);

      await incidentService.updateIncident(RANGER, 'R', 'inc-1', editMeta({ patrolSessionId: 'sess-1' }));

      expect(prisma.conservationIncident.updateMany.mock.calls[0][0].data.patrolSessionId).toBe('sess-1');
    });

    test.each([
      ['an already linked report', { patrolSessionId: 'sess-0' }, null, 400, 'PATROL_LINK_IMMUTABLE'],
      ['an unknown patrol', {}, null, 404, 'PATROL_SESSION_NOT_FOUND'],
      ["another ranger's patrol", {}, { ...openPatrol, rangerId: 'R-OTHER' }, 403, 'FORBIDDEN'],
      ['a completed patrol', {}, { ...openPatrol, status: PatrolStatus.COMPLETED }, 409, 'PATROL_NOT_ACTIVE'],
      ['a patrol started after the report', {}, { ...openPatrol, startTime: at(-minutes(30)) }, 400, 'INCIDENT_BEFORE_PATROL']
    ])('rejects linking %s', async (_label, existingOverrides, session, status, code) => {
      const existing = incidentRow(existingOverrides);
      if (existing.patrolSessionId) existing.patrolSession = { status: PatrolStatus.ACTIVE, waypoints: [], patrolRoute: null } as never;
      loadThen(existing);
      prisma.patrolSession.findUnique.mockResolvedValue(session);

      await expect(incidentService.updateIncident(RANGER, 'R', 'inc-1', editMeta({ patrolSessionId: 'sess-1' }))).rejects.toEqual(appError(status, code));
    });
  });
});

describe('withdraw (delete) and restore', () => {
  test('withdraws a report with its reason and records a DELETE revision', async () => {
    const withdrawn = incidentRow({ deletedAt: NOW, deletionReason: IncidentDeletionReason.OTHER, deletionNote: 'Wrong park' });
    loadThen(incidentRow(), withdrawn);

    const result = await incidentService.deleteIncident(RANGER, 'inc-1', withdrawal({ reason: IncidentDeletionReason.OTHER, note: 'Wrong park' }));

    expect(prisma.conservationIncident.updateMany).toHaveBeenCalledWith({
      where: { id: 'inc-1', updatedAt: UPDATED, deletedAt: null },
      data: { deletedAt: NOW, deletedBy: RANGER, deletionReason: IncidentDeletionReason.OTHER, deletionNote: 'Wrong park', updatedAt: NOW }
    });
    expect(prisma.incidentRevision.create.mock.calls[0][0].data).toMatchObject({
      action: 'DELETE',
      clientEditId: 'delete-1',
      changes: { deletion: { reason: IncidentDeletionReason.OTHER, note: 'Wrong park' } }
    });
    // The withdrawn report is kept and can be restored while still editable.
    expect(result).toMatchObject({ _id: 'inc-1', canEdit: false, canDelete: false, canRestore: true });
  });

  test('a withdrawal without a note stores no note', async () => {
    loadThen(incidentRow());
    await incidentService.deleteIncident(RANGER, 'inc-1', withdrawal());
    expect(prisma.conservationIncident.updateMany.mock.calls[0][0].data.deletionNote).toBeNull();
  });

  test('a retried withdrawal returns the current report without writing again', async () => {
    prisma.incidentRevision.findUnique.mockResolvedValue({ id: 'rev-1' });
    loadThen(incidentRow({ deletedAt: NOW }));

    await expect(incidentService.deleteIncident(RANGER, 'inc-1', withdrawal())).resolves.toMatchObject({ canRestore: true });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  test('a second, different withdrawal of the same report is rejected as gone', async () => {
    loadThen(incidentRow({ deletedAt: at(-minutes(1)) }));
    await expect(incidentService.deleteIncident(RANGER, 'inc-1', withdrawal())).rejects.toEqual(appError(410, 'INCIDENT_DELETED'));
  });

  test.each([
    ['a missing report', null, withdrawal(), 404, 'INCIDENT_NOT_FOUND'],
    ["another ranger's report", incidentRow({ reportedBy: 'R-OTHER' }), withdrawal(), 403, 'FORBIDDEN'],
    ['a stale version', incidentRow(), withdrawal({ expectedUpdatedAt: '2026-10-08T10:00:00.000Z' }), 409, 'EDIT_CONFLICT'],
    ['a locked report', incidentRow({ status: IncidentStatus.RESOLVED }), withdrawal(), 409, 'INCIDENT_LOCKED'],
    ['a delete time in the future', incidentRow(), withdrawal({ deletedAt: at(minutes(10)).toISOString() }), 400, 'INVALID_EDIT_TIME']
  ])('rejects withdrawing %s', async (_label, existing, input, status, code) => {
    prisma.conservationIncident.findUnique.mockResolvedValue(existing);
    await expect(incidentService.deleteIncident(RANGER, 'inc-1', input)).rejects.toEqual(appError(status, code));
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  test('a report changed during the withdrawal is a conflict; a racing retry is accepted', async () => {
    loadThen(incidentRow());
    prisma.conservationIncident.updateMany.mockResolvedValue({ count: 0 });
    await expect(incidentService.deleteIncident(RANGER, 'inc-1', withdrawal())).rejects.toEqual(appError(409, 'EDIT_CONFLICT'));

    prisma.conservationIncident.findUnique.mockReset();
    loadThen(incidentRow(), incidentRow({ deletedAt: NOW }));
    prisma.conservationIncident.updateMany.mockResolvedValue({ count: 1 });
    prisma.incidentRevision.create.mockRejectedValue(Object.assign(new Error('dup'), { code: 'P2002' }));
    await expect(incidentService.deleteIncident(RANGER, 'inc-1', withdrawal())).resolves.toMatchObject({ canRestore: true });
  });

  test('propagates a database failure during the withdrawal', async () => {
    loadThen(incidentRow());
    prisma.$transaction.mockRejectedValue(new Error('disk full'));
    await expect(incidentService.deleteIncident(RANGER, 'inc-1', withdrawal())).rejects.toThrow('disk full');
  });

  const restore = (overrides: Record<string, any> = {}) => ({ restoredAt: NOW.toISOString(), clientRestoreId: 'restore-1', ...overrides });
  const withdrawnRow = (overrides: Record<string, any> = {}) =>
    incidentRow({ deletedAt: at(-minutes(5)), deletionReason: IncidentDeletionReason.DUPLICATE, deletionNote: null, ...overrides });

  test('restores a withdrawn report and records what the withdrawal was', async () => {
    loadThen(withdrawnRow(), incidentRow());

    const restored = await incidentService.restoreIncident(RANGER, 'inc-1', restore());

    expect(prisma.conservationIncident.updateMany).toHaveBeenCalledWith({
      where: { id: 'inc-1', deletedAt: at(-minutes(5)) },
      data: { deletedAt: null, deletedBy: null, deletionReason: null, deletionNote: null, updatedAt: NOW }
    });
    expect(prisma.incidentRevision.create.mock.calls[0][0].data).toMatchObject({
      action: 'RESTORE',
      changes: { restoredDeletion: { reason: IncidentDeletionReason.DUPLICATE, note: null, deletedAt: at(-minutes(5)) } }
    });
    expect(restored).toMatchObject({ _id: 'inc-1', canEdit: true });
  });

  test('restoring a report that is not withdrawn is rejected', async () => {
    loadThen(incidentRow());
    await expect(incidentService.restoreIncident(RANGER, 'inc-1', restore())).rejects.toEqual(appError(409, 'INCIDENT_NOT_DELETED'));
  });

  test('a withdrawn report can no longer be restored once its edit window has passed', async () => {
    loadThen(withdrawnRow({ reportedAt: at(-STANDALONE_EDIT_WINDOW_MS - 1) }));
    await expect(incidentService.restoreIncident(RANGER, 'inc-1', restore())).rejects.toEqual(
      expect.objectContaining({ code: 'INCIDENT_LOCKED', message: expect.stringContaining('can no longer be restored') })
    );
  });

  test('a retried restore returns the report without writing again', async () => {
    prisma.incidentRevision.findUnique.mockResolvedValue({ id: 'rev-2' });
    loadThen(incidentRow(), incidentRow());
    await expect(incidentService.restoreIncident(RANGER, 'inc-1', restore())).resolves.toMatchObject({ _id: 'inc-1' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  test('a restore that loses a race is a conflict; a database failure propagates', async () => {
    loadThen(withdrawnRow());
    prisma.conservationIncident.updateMany.mockResolvedValue({ count: 0 });
    await expect(incidentService.restoreIncident(RANGER, 'inc-1', restore())).rejects.toEqual(appError(409, 'EDIT_CONFLICT'));

    prisma.conservationIncident.findUnique.mockReset();
    loadThen(withdrawnRow());
    prisma.$transaction.mockRejectedValue(new Error('timeout'));
    await expect(incidentService.restoreIncident(RANGER, 'inc-1', restore())).rejects.toThrow('timeout');
  });
});
