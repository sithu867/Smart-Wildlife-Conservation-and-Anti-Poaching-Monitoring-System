import { AxiosError, type AxiosResponse } from 'axios';
import type { MockInstance } from 'vitest';
import { http } from '../../../shared/api/http';
import { ApiError } from '../../../shared/api/apiError';
import { offlineDb } from '../../../offline/db';
import { syncService } from '../../../offline/syncService';
import { IncidentDeletionReason, IncidentStatus, IncidentType, LocationSource, SyncStatus } from '../../../shared/types/enums';
import type { ConservationIncident, CreateIncidentPayload } from '../types/incident';
import { incidentApi } from './incidentApi';

// UC-B incident API: online requests, server-error vs lost-connection handling, offline reports in
// IndexedDB (fake-indexeddb) and their synchronisation. HTTP is mocked; Dexie and SyncService are real.
type HttpMock = MockInstance<(url: string, body?: any) => Promise<unknown>>;
const jpeg = 'data:image/jpeg;base64,/9j/4AAQ';
const networkError = () => new AxiosError('Network Error', 'ERR_NETWORK');
const serverError = (status: number, code?: string, message = 'Rejected', details?: unknown) =>
  new AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_RESPONSE', undefined, undefined, {
    status,
    data: { success: false, error: { message, code, details } }
  } as AxiosResponse);
const ok = (data: unknown) => ({ data: { success: true, data } });

const payload = (overrides: Partial<CreateIncidentPayload> = {}): CreateIncidentPayload => ({
  incidentType: IncidentType.SNARE,
  description: 'Wire snare on the fence line',
  latitude: 6.475,
  longitude: 80.88,
  locationSource: LocationSource.GPS,
  evidence: [{ imageUrl: jpeg, fileSize: 2048, mimeType: 'image/jpeg', capturedAt: '2026-10-08T11:55:00.000Z' }],
  ...overrides
});
const serverIncident = (overrides: Partial<ConservationIncident> = {}): ConservationIncident => ({
  _id: 'srv-1',
  clientIncidentId: 'inc-client-1',
  incidentType: IncidentType.SNARE,
  description: 'Wire snare on the fence line',
  location: { latitude: 6.475, longitude: 80.88, timestamp: '2026-10-08T12:00:00.000Z', source: LocationSource.GPS },
  reportedBy: 'R-101',
  rangerName: 'Ranger John',
  reportedAt: '2026-10-08T12:00:00.000Z',
  evidence: [{ evidenceId: 'evid-1', imageUrl: jpeg }],
  status: IncidentStatus.REPORTED,
  syncStatus: SyncStatus.SYNCED,
  updatedAt: '2026-10-08T12:00:00.000Z',
  ...overrides
});

async function storeLocal(incident: ConservationIncident, syncStatus: SyncStatus) {
  return offlineDb.incidents.add({ remoteId: incident._id, syncStatus, createdAt: incident.reportedAt, updatedAt: incident.reportedAt, payload: { ...incident, syncStatus } });
}
const locals = async () => (await offlineDb.incidents.toArray()).map(record => ({ ...record, payload: record.payload as ConservationIncident }));
const queue = () => offlineDb.syncQueue.toArray();
const goOffline = () => window.dispatchEvent(new Event('offline'));
const goOnline = () => window.dispatchEvent(new Event('online'));
const isProcessing = () => (syncService as unknown as { isProcessing: boolean }).isProcessing;

let get: HttpMock;
let post: HttpMock;

beforeEach(async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  get = vi.spyOn(http, 'get') as unknown as HttpMock;
  post = vi.spyOn(http, 'post') as unknown as HttpMock;
  await Promise.all([offlineDb.incidents.clear(), offlineDb.syncQueue.clear()]);
});
afterEach(async () => {
  // Let any sync batch started by the test finish before the next test clears IndexedDB.
  await vi.waitFor(() => expect(isProcessing()).toBe(false));
  vi.restoreAllMocks();
});

describe('online reporting', () => {
  beforeEach(() => goOnline());

  test('createIncident posts the report with a client id, lets the server set the time and caches it as SYNCED', async () => {
    post.mockResolvedValue(ok(serverIncident()));

    const created = await incidentApi.createIncident(payload({ reportedAt: '2026-10-08T11:59:00.000Z' }));

    expect(post).toHaveBeenCalledWith('/incidents', { ...payload(), clientIncidentId: expect.stringMatching(/^inc-\d+-[a-z0-9]+$/) });
    expect(created).toEqual(serverIncident());
    expect(await locals()).toEqual([expect.objectContaining({ remoteId: 'srv-1', syncStatus: SyncStatus.SYNCED })]);
    expect(await queue()).toEqual([]);
  });

  test('a draft keeps its client id, so retries are recognised by the server', async () => {
    post.mockResolvedValue(ok(serverIncident()));
    await incidentApi.createIncident(payload({ clientIncidentId: 'inc-draft-7' }));
    expect((post.mock.calls[0][1] as { clientIncidentId: string }).clientIncidentId).toBe('inc-draft-7');
  });

  // Server answers are business errors, not lost connectivity: they must never become PENDING local reports.
  test.each([
    ['400 VALIDATION_ERROR', 400, 'VALIDATION_ERROR', 'Latitude must be between -90 and 90'],
    ['403 FORBIDDEN', 403, 'FORBIDDEN', 'Unauthorized: Attached patrol session does not belong to this ranger.'],
    ['409 EDIT_CONFLICT', 409, 'EDIT_CONFLICT', 'This report was changed on another device.'],
    ['413 PAYLOAD_TOO_LARGE', 413, 'PAYLOAD_TOO_LARGE', 'Request body exceeds the 8 MB limit.'],
    ['500 without an error code', 500, undefined, 'Internal server error']
  ])('a server rejection (%s) is shown to the ranger and nothing is saved offline', async (_label, status, code, message) => {
    post.mockRejectedValue(serverError(status, code, message));

    const failure = incidentApi.createIncident(payload());

    await expect(failure).rejects.toBeInstanceOf(ApiError);
    await expect(failure).rejects.toMatchObject({ status, code, message });
    expect(await locals()).toEqual([]);
    expect(await queue()).toEqual([]);
  });

  test('getIncidentById returns the server report', async () => {
    get.mockResolvedValue(ok(serverIncident()));
    await expect(incidentApi.getIncidentById('srv-1')).resolves.toEqual(serverIncident());
    expect(get).toHaveBeenCalledWith('/incidents/srv-1');
  });

  test("getIncidentById reports the server's 404 instead of showing a stale device copy", async () => {
    await storeLocal(serverIncident(), SyncStatus.SYNCED);
    get.mockRejectedValue(serverError(404, 'INCIDENT_NOT_FOUND', 'Conservation incident not found.'));

    await expect(incidentApi.getIncidentById('srv-1')).rejects.toMatchObject({ status: 404, code: 'INCIDENT_NOT_FOUND' });
  });

  test('updateIncident sends the changes and refreshes the device copy', async () => {
    const id = await storeLocal(serverIncident(), SyncStatus.SYNCED);
    const patch = vi.spyOn(http, 'patch').mockResolvedValue(ok(serverIncident({ description: 'Two snares', editCount: 1 })));
    const change = { description: 'Two snares', expectedUpdatedAt: '2026-10-08T12:00:00.000Z', editedAt: '2026-10-08T12:05:00.000Z', clientEditId: 'edit-1' };

    await incidentApi.updateIncident('srv-1', change);

    expect(patch).toHaveBeenCalledWith('/incidents/srv-1', change);
    expect((await offlineDb.incidents.get(id))?.payload).toMatchObject({ description: 'Two snares', editCount: 1 });
  });

  test('an edit conflict keeps the server code and details', async () => {
    vi.spyOn(http, 'patch').mockRejectedValue(serverError(409, 'EDIT_CONFLICT', 'Changed elsewhere', { currentUpdatedAt: '2026-10-08T12:03:00.000Z' }));

    await expect(incidentApi.updateIncident('srv-1', { expectedUpdatedAt: 'x', editedAt: 'y', clientEditId: 'z', description: 'abc' })).rejects.toMatchObject({
      status: 409,
      code: 'EDIT_CONFLICT',
      details: { currentUpdatedAt: '2026-10-08T12:03:00.000Z' }
    });
  });

  test('deleteIncident withdraws with the reason in the request body', async () => {
    const del = vi.spyOn(http, 'delete').mockResolvedValue(ok(serverIncident({ deletedAt: '2026-10-08T12:10:00.000Z', canRestore: true })));
    const body = { expectedUpdatedAt: '2026-10-08T12:00:00.000Z', deletedAt: '2026-10-08T12:10:00.000Z', clientDeleteId: 'del-1', reason: IncidentDeletionReason.DUPLICATE };

    const withdrawn = await incidentApi.deleteIncident('srv-1', body);

    expect(del).toHaveBeenCalledWith('/incidents/srv-1', { data: body });
    expect(withdrawn.canRestore).toBe(true);
    expect((await locals())[0].payload.deletedAt).toBe('2026-10-08T12:10:00.000Z');
  });

  test('a withdrawal rejected as already deleted keeps the 410 code', async () => {
    vi.spyOn(http, 'delete').mockRejectedValue(serverError(410, 'INCIDENT_DELETED', 'This report has been deleted.'));
    await expect(incidentApi.deleteIncident('srv-1', {} as never)).rejects.toMatchObject({ status: 410, code: 'INCIDENT_DELETED' });
  });

  test('restoreIncident posts a fresh undo with its time', async () => {
    post.mockResolvedValue(ok(serverIncident()));

    await incidentApi.restoreIncident('srv-1');

    expect(post).toHaveBeenCalledWith('/incidents/srv-1/restore', { restoredAt: expect.any(String), clientRestoreId: expect.stringMatching(/^restore-/) });
  });
});

describe('without a connection', () => {
  beforeEach(() => {
    goOffline();
    get.mockRejectedValue(networkError());
    post.mockRejectedValue(networkError());
  });

  test('a GPS report is saved on the device as PENDING (not SYNCED) and queued for upload', async () => {
    const before = Date.now();
    const saved = await incidentApi.createIncident(payload({ clientIncidentId: 'inc-offline-1', patrolSessionId: 'sess-3' }));

    expect(saved).toMatchObject({
      _id: 'inc-offline-1',
      clientIncidentId: 'inc-offline-1',
      incidentType: IncidentType.SNARE,
      description: 'Wire snare on the fence line',
      location: { latitude: 6.475, longitude: 80.88, source: LocationSource.GPS },
      patrolSession: 'sess-3',
      status: IncidentStatus.REPORTED,
      syncStatus: SyncStatus.PENDING
    });
    expect(saved.syncStatus).not.toBe(SyncStatus.SYNCED);
    expect(new Date(saved.reportedAt).getTime()).toBeGreaterThanOrEqual(before);
    expect(saved.evidence).toEqual([{ evidenceId: 'evid-inc-offline-1-0', imageUrl: jpeg, capturedAt: '2026-10-08T11:55:00.000Z', fileSize: 2048, mimeType: 'image/jpeg' }]);
    const [local] = await locals();
    expect(local).toMatchObject({ remoteId: 'inc-offline-1', syncStatus: SyncStatus.PENDING, payload: saved });
    expect(await queue()).toEqual([
      expect.objectContaining({ entity: 'INCIDENT', operation: 'CREATE', recordId: local.id, status: SyncStatus.PENDING, attempts: 0, payload: saved })
    ]);
  });

  test('a manually pinned location, park and photo defaults are kept on the device', async () => {
    const saved = await incidentApi.createIncident(
      payload({ locationSource: LocationSource.MANUAL, latitude: 0, longitude: 0, parkId: 'park-1', evidence: [{ imageUrl: jpeg }] })
    );

    expect(saved.location).toMatchObject({ latitude: 0, longitude: 0, source: LocationSource.MANUAL });
    expect(saved.parkId).toBe('park-1');
    expect(saved.evidence[0]).toMatchObject({ mimeType: 'image/jpeg', capturedAt: expect.any(String) });
  });

  test('a device storage failure is reported instead of losing the report silently', async () => {
    vi.spyOn(offlineDb, 'transaction').mockRejectedValueOnce(new Error('QuotaExceededError'));

    await expect(incidentApi.createIncident(payload())).rejects.toThrow('Unable to save this incident on the device. Please try again.');
  });

  test('getIncidentById serves the device copy with its sync status', async () => {
    await storeLocal(serverIncident({ _id: 'inc-offline-1', clientIncidentId: 'inc-offline-1' }), SyncStatus.PENDING);

    await expect(incidentApi.getIncidentById('inc-offline-1')).resolves.toMatchObject({ _id: 'inc-offline-1', syncStatus: SyncStatus.PENDING });
    await expect(incidentApi.getIncidentById('unknown')).rejects.toMatchObject({ status: 404, code: 'INCIDENT_NOT_FOUND' });
  });

  test.each([
    ['updateIncident', () => incidentApi.updateIncident('srv-1', {} as never), 'patch'],
    ['deleteIncident', () => incidentApi.deleteIncident('srv-1', {} as never), 'delete'],
    ['restoreIncident', () => incidentApi.restoreIncident('srv-1'), 'post']
  ] as const)('%s needs a connection and says so', async (_name, call, method) => {
    if (method !== 'post') vi.spyOn(http, method).mockRejectedValue(networkError());
    await expect(call()).rejects.toMatchObject({ status: 0, code: 'OFFLINE' });
  });
});

describe('the report list (getMyIncidents)', () => {
  test('online: merges the server list with unsynced drafts, newest first, and flushes the queue first', async () => {
    goOnline();
    const processAll = vi.spyOn(syncService, 'processAll');
    await storeLocal(serverIncident({ _id: 'draft', clientIncidentId: 'draft', reportedAt: '2026-10-08T13:00:00.000Z' }), SyncStatus.FAILED);
    get.mockResolvedValue(ok([serverIncident({ _id: 'srv-1', reportedAt: '2026-10-08T12:00:00.000Z' })]));

    const list = await incidentApi.getMyIncidents();

    expect(processAll).toHaveBeenCalled();
    expect(list.map(item => [item._id, item.syncStatus])).toEqual([
      ['draft', SyncStatus.FAILED],
      ['srv-1', SyncStatus.SYNCED]
    ]);
    expect((await locals()).map(record => record.remoteId).sort()).toEqual(['draft', 'srv-1']);
  });

  test('online: a synced copy the server no longer lists (e.g. withdrawn elsewhere) is removed from the device', async () => {
    goOnline();
    const id = await storeLocal(serverIncident({ _id: 'gone', clientIncidentId: 'gone' }), SyncStatus.SYNCED);
    await offlineDb.syncQueue.add({ entity: 'INCIDENT', operation: 'CREATE', recordId: id, status: SyncStatus.SYNCED, attempts: 1, createdAt: 'x' });
    get.mockResolvedValue(ok([]));

    expect(await incidentApi.getMyIncidents()).toEqual([]);
    expect(await locals()).toEqual([]);
    expect(await queue()).toEqual([]);
  });

  test('offline: shows the device copies with their sync status and hides withdrawn ones', async () => {
    goOffline();
    get.mockRejectedValue(networkError());
    await storeLocal(serverIncident({ _id: 'kept' }), SyncStatus.SYNCED);
    await storeLocal(serverIncident({ _id: 'pending', clientIncidentId: 'pending' }), SyncStatus.PENDING);
    await storeLocal(serverIncident({ _id: 'withdrawn', clientIncidentId: 'withdrawn', deletedAt: '2026-10-08T12:30:00.000Z' }), SyncStatus.SYNCED);

    const list = await incidentApi.getMyIncidents();

    expect(list.map(item => [item._id, item.syncStatus]).sort()).toEqual([
      ['kept', SyncStatus.SYNCED],
      ['pending', SyncStatus.PENDING]
    ]);
  });

  // Regression: a demo-data clean-up deleted genuine unsynced reports (and their uploads) that shared one description.
  test('opening the list never deletes unsynced reports, even with identical descriptions', async () => {
    goOffline();
    get.mockRejectedValue(networkError());
    post.mockRejectedValue(networkError());
    const demoText = { description: 'Wire snare found attached to acacia tree near waterhole.' };
    await incidentApi.createIncident(payload({ ...demoText, latitude: 6.41 }));
    await incidentApi.createIncident(payload({ ...demoText, latitude: 6.42 }));

    const list = await incidentApi.getMyIncidents();

    expect(list).toHaveLength(2);
    expect((await locals()).map(record => record.syncStatus)).toEqual([SyncStatus.PENDING, SyncStatus.PENDING]);
    expect(await queue()).toHaveLength(2);
  });

  test('repeated synced demo copies are still tidied to the newest one', async () => {
    goOffline();
    get.mockRejectedValue(networkError());
    const demo = { incidentType: IncidentType.SNARE, description: 'Wire snare found attached to acacia tree near waterhole.' };
    await storeLocal(serverIncident({ ...demo, _id: 'old', clientIncidentId: 'old', reportedAt: '2026-10-07T12:00:00.000Z' }), SyncStatus.SYNCED);
    await storeLocal(serverIncident({ ...demo, _id: 'new', clientIncidentId: 'new', reportedAt: '2026-10-08T12:00:00.000Z' }), SyncStatus.SYNCED);

    expect((await incidentApi.getMyIncidents()).map(item => item._id)).toEqual(['new']);
  });
});

describe('synchronising offline reports', () => {
  const offlineReport = () =>
    serverIncident({
      _id: 'inc-off-1',
      clientIncidentId: 'inc-off-1',
      reportedAt: '2026-10-08T09:00:00.000Z',
      otherTypeDescription: undefined,
      parkId: 'park-1',
      patrolSession: { _id: 'sess-9' } as ConservationIncident['patrolSession'],
      location: { latitude: 0, longitude: 0, timestamp: '2026-10-08T09:00:00.000Z', source: LocationSource.MANUAL },
      evidence: [{ evidenceId: 'evid-inc-off-1-0', imageUrl: jpeg, capturedAt: '2026-10-08T08:59:00.000Z', fileSize: 2048, mimeType: 'image/png' }],
      syncStatus: SyncStatus.PENDING
    });
  const syncBody = {
    clientIncidentId: 'inc-off-1',
    reportedAt: '2026-10-08T09:00:00.000Z',
    incidentType: IncidentType.SNARE,
    parkId: 'park-1',
    otherTypeDescription: undefined,
    description: 'Wire snare on the fence line',
    latitude: 0,
    longitude: 0,
    locationSource: LocationSource.MANUAL,
    patrolSessionId: 'sess-9',
    evidence: [{ imageUrl: jpeg, capturedAt: '2026-10-08T08:59:00.000Z', fileSize: 2048, mimeType: 'image/png' }]
  };
  const waitForQueue = (status: SyncStatus) => vi.waitFor(async () => expect((await queue()).map(item => item.status)).toEqual([status]));

  test('syncIncidentPayload uploads the original report time, location source, patrol, park and photos, then marks it SYNCED', async () => {
    const id = await storeLocal(offlineReport(), SyncStatus.PENDING);
    post.mockResolvedValue(ok(serverIncident({ _id: 'srv-9', clientIncidentId: 'inc-off-1' })));

    await incidentApi.syncIncidentPayload(offlineReport());

    expect(post).toHaveBeenCalledWith('/incidents', syncBody);
    expect(await offlineDb.incidents.get(id)).toMatchObject({ remoteId: 'srv-9', syncStatus: SyncStatus.SYNCED, payload: { _id: 'srv-9', syncStatus: SyncStatus.SYNCED } });
  });

  test('a failed upload marks the device copy FAILED but keeps the whole report', async () => {
    const id = await storeLocal(offlineReport(), SyncStatus.PENDING);
    post.mockRejectedValue(serverError(500));

    await expect(incidentApi.syncIncidentPayload(offlineReport())).rejects.toThrow('status code 500');

    expect(await offlineDb.incidents.get(id)).toMatchObject({ syncStatus: SyncStatus.FAILED, payload: { ...offlineReport(), syncStatus: SyncStatus.FAILED } });
  });

  test('PENDING -> reconnect -> server accepts -> SYNCED on the device and in the queue', async () => {
    goOffline();
    post.mockRejectedValue(networkError());
    const saved = await incidentApi.createIncident(payload({ clientIncidentId: 'inc-off-2' }));
    post.mockResolvedValue(ok(serverIncident({ _id: 'srv-2', clientIncidentId: 'inc-off-2' })));

    goOnline();
    await waitForQueue(SyncStatus.SYNCED);

    expect(post).toHaveBeenLastCalledWith('/incidents', expect.objectContaining({ clientIncidentId: 'inc-off-2', reportedAt: saved.reportedAt }));
    expect(await locals()).toEqual([expect.objectContaining({ remoteId: 'srv-2', syncStatus: SyncStatus.SYNCED })]);
  });

  test('a lost connection during upload keeps the report and leaves it queued for an automatic retry', async () => {
    goOffline();
    post.mockRejectedValue(networkError());
    await incidentApi.createIncident(payload({ clientIncidentId: 'inc-off-3' }));

    goOnline();
    await vi.waitFor(async () => expect((await queue())[0].attempts).toBe(1));

    expect((await queue())[0].status).toBe(SyncStatus.PENDING);
    expect((await locals())[0].payload).toMatchObject({ clientIncidentId: 'inc-off-3', description: 'Wire snare on the fence line' });
  });

  test('a server rejection during upload marks the queue item FAILED and keeps the report', async () => {
    goOffline();
    post.mockRejectedValue(networkError());
    await incidentApi.createIncident(payload({ clientIncidentId: 'inc-off-4' }));
    post.mockRejectedValue(serverError(400, 'VALIDATION_ERROR'));

    goOnline();
    await waitForQueue(SyncStatus.FAILED);

    expect((await queue())[0]).toMatchObject({ attempts: 1, lastError: 'Request failed with status code 400' });
    expect(await locals()).toEqual([expect.objectContaining({ syncStatus: SyncStatus.FAILED, payload: expect.objectContaining({ clientIncidentId: 'inc-off-4' }) })]);
  });

  test('Retry Sync: a failed retry records the error, and the next retry succeeds', async () => {
    const id = await storeLocal(offlineReport(), SyncStatus.FAILED);
    await offlineDb.syncQueue.add({ entity: 'INCIDENT', operation: 'CREATE', recordId: id, status: SyncStatus.FAILED, attempts: 1, createdAt: 'x', payload: offlineReport() });
    post.mockRejectedValueOnce(serverError(503, undefined, 'Service unavailable'));

    await expect(incidentApi.retrySyncIncident('inc-off-1')).rejects.toThrow('status code 503');
    expect((await queue())[0]).toMatchObject({ status: SyncStatus.FAILED, attempts: 2, lastError: 'Request failed with status code 503' });
    expect((await locals())[0]).toMatchObject({ syncStatus: SyncStatus.FAILED, payload: expect.objectContaining({ description: 'Wire snare on the fence line' }) });

    post.mockResolvedValueOnce(ok(serverIncident({ _id: 'srv-9', clientIncidentId: 'inc-off-1' })));
    await expect(incidentApi.retrySyncIncident('inc-off-1')).resolves.toMatchObject({ _id: 'srv-9' });
    const [item] = await queue();
    expect(item.status).toBe(SyncStatus.SYNCED);
    expect(item).not.toHaveProperty('lastError');
    expect((await locals())[0]).toMatchObject({ remoteId: 'srv-9', syncStatus: SyncStatus.SYNCED });
  });

  test('Retry Sync fails clearly when the report is not on the device', async () => {
    await expect(incidentApi.retrySyncIncident('unknown')).rejects.toThrow('Local incident record not found for sync retry.');
  });
});

describe('discarding an unsynced draft', () => {
  test('removes the draft and its queued upload from the device', async () => {
    const id = await storeLocal(serverIncident({ _id: 'draft', clientIncidentId: 'draft' }), SyncStatus.PENDING);
    await offlineDb.syncQueue.add({ entity: 'INCIDENT', operation: 'CREATE', recordId: id, status: SyncStatus.PENDING, attempts: 0, createdAt: 'x' });

    await incidentApi.discardLocalDraft('draft');

    expect(await locals()).toEqual([]);
    expect(await queue()).toEqual([]);
  });

  test('refuses a report that already synced, and one that is uploading right now', async () => {
    await storeLocal(serverIncident({ _id: 'synced', clientIncidentId: 'synced' }), SyncStatus.SYNCED);
    const id = await storeLocal(serverIncident({ _id: 'uploading', clientIncidentId: 'uploading' }), SyncStatus.PENDING);
    await offlineDb.syncQueue.add({ entity: 'INCIDENT', operation: 'CREATE', recordId: id, status: SyncStatus.SYNCING, attempts: 0, createdAt: 'x' });

    await expect(incidentApi.discardLocalDraft('synced')).rejects.toMatchObject({ code: 'ALREADY_SYNCED' });
    await expect(incidentApi.discardLocalDraft('uploading')).rejects.toMatchObject({ code: 'SYNC_IN_PROGRESS' });
    expect(await locals()).toHaveLength(2);
  });

  test('an unknown draft is ignored', async () => {
    await expect(incidentApi.discardLocalDraft('unknown')).resolves.toBeUndefined();
  });
});
