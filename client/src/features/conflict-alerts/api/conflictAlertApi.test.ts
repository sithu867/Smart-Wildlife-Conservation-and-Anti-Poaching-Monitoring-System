import { AxiosError, type AxiosResponse } from 'axios';
import type { MockInstance } from 'vitest';
import { http } from '../../../shared/api/http';
import { ApiError } from '../../../shared/api/apiError';
import { offlineDb } from '../../../offline/db';
import { syncService } from '../../../offline/syncService';
import { AlertSeverity, AlertSource, AlertStatus, ConflictAlertType, LocationSource, ResponseAction, SyncStatus } from '../../../shared/types/enums';
import type { WildlifeConflictAlert } from '../types/conflictAlert';
import { conflictAlertApi } from './conflictAlertApi';

// UC-C conflict-alert API: online requests, server rejection vs lost connection, offline field
// responses stored in IndexedDB (fake-indexeddb) and their synchronisation. HTTP is mocked;
// Dexie and SyncService are real.
type HttpMock = MockInstance<(url: string, body?: any, config?: any) => Promise<unknown>>;
const networkError = () => new AxiosError('Network Error', 'ERR_NETWORK');
const timeoutError = () => new AxiosError('timeout of 10000ms exceeded', 'ECONNABORTED');
const serverError = (status: number, message = `Rejected with ${status}`, code?: string) =>
  new AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_RESPONSE', undefined, undefined, {
    status,
    data: { success: false, error: { message, code } }
  } as AxiosResponse);
const ok = (data: unknown) => ({ data: { success: true, data } });

const alert = (overrides: Partial<WildlifeConflictAlert> = {}): WildlifeConflictAlert => ({
  _id: 'alert-1',
  sourceEventId: 'evt-1',
  source: AlertSource.COLLAR,
  alertType: ConflictAlertType.DANGEROUS_WILDLIFE_ACTIVITY,
  severity: AlertSeverity.HIGH,
  status: AlertStatus.OPEN,
  location: { latitude: -2.1523, longitude: 34.8214, timestamp: '2026-10-09T07:00:00.000Z', source: LocationSource.GPS },
  description: 'Elephant at the buffer fence',
  animalId: 'ELEPHANT-001',
  responses: [],
  createdAt: '2026-10-09T07:00:00.000Z',
  updatedAt: '2026-10-09T07:00:00.000Z',
  ...overrides
});
const response = (overrides: Record<string, unknown> = {}) => ({
  responseId: 'resp-1',
  responderId: 'R-101',
  responderName: 'Ranger John',
  action: ResponseAction.INVESTIGATED_AREA,
  notes: 'Checked the fence',
  respondedAt: '2026-10-09T07:30:00.000Z',
  ...overrides
});
const responseInput = { action: ResponseAction.WARNED_COMMUNITY, notes: 'Warned the village', outcome: 'Families moved inside' };

async function cache(stored: WildlifeConflictAlert, syncStatus = SyncStatus.SYNCED) {
  return offlineDb.conflictAlerts.add({ remoteId: stored._id, syncStatus, createdAt: stored.createdAt, updatedAt: stored.updatedAt, payload: { ...stored, syncStatus } });
}
const locals = async () => (await offlineDb.conflictAlerts.toArray()).map(record => ({ ...record, payload: record.payload as WildlifeConflictAlert }));
const local = async (id = 'alert-1') => (await locals()).find(record => record.remoteId === id);
const queue = () => offlineDb.syncQueue.toArray();
const goOffline = () => window.dispatchEvent(new Event('offline'));
const goOnline = () => window.dispatchEvent(new Event('online'));
const isProcessing = () => (syncService as unknown as { isProcessing: boolean }).isProcessing;
const waitForQueue = (...statuses: SyncStatus[]) => vi.waitFor(async () => expect((await queue()).map(item => item.status)).toEqual(statuses));

let get: HttpMock;
let post: HttpMock;
let put: HttpMock;
let del: HttpMock;

beforeEach(async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  get = vi.spyOn(http, 'get') as unknown as HttpMock;
  post = vi.spyOn(http, 'post') as unknown as HttpMock;
  put = vi.spyOn(http, 'put') as unknown as HttpMock;
  del = vi.spyOn(http, 'delete') as unknown as HttpMock;
  await Promise.all([offlineDb.conflictAlerts.clear(), offlineDb.syncQueue.clear()]);
});
afterEach(async () => {
  // Let any sync batch started by the test finish before the next test clears IndexedDB.
  await vi.waitFor(() => expect(isProcessing()).toBe(false));
  vi.restoreAllMocks();
});

describe('online requests', () => {
  beforeEach(() => goOnline());

  test('getAlerts sends the filters as query parameters and caches every alert as SYNCED', async () => {
    get.mockResolvedValue(ok([alert(), alert({ _id: 'alert-2', status: AlertStatus.RESOLVED })]));

    const alerts = await conflictAlertApi.getAlerts({ status: AlertStatus.OPEN, severity: AlertSeverity.HIGH });

    expect(get).toHaveBeenCalledWith('/conflict-alerts', { params: { status: AlertStatus.OPEN, severity: AlertSeverity.HIGH } });
    expect(alerts.map(a => a._id)).toEqual(['alert-1', 'alert-2']);
    expect((await locals()).map(r => [r.remoteId, r.syncStatus])).toEqual([['alert-1', SyncStatus.SYNCED], ['alert-2', SyncStatus.SYNCED]]);
  });

  test('refreshing the list updates an existing cached copy instead of duplicating it', async () => {
    await cache(alert(), SyncStatus.PENDING);
    get.mockResolvedValue(ok([alert({ status: AlertStatus.ACKNOWLEDGED, updatedAt: '2026-10-09T08:00:00.000Z' })]));

    await conflictAlertApi.getAlerts();

    expect(await locals()).toEqual([expect.objectContaining({ remoteId: 'alert-1', syncStatus: SyncStatus.SYNCED, updatedAt: '2026-10-09T08:00:00.000Z', payload: expect.objectContaining({ status: AlertStatus.ACKNOWLEDGED }) })]);
  });

  test('getAlertById and getHistory read the server', async () => {
    get.mockResolvedValueOnce(ok(alert())).mockResolvedValueOnce(ok([{ id: 'h-1', action: 'CREATE' }]));
    expect((await conflictAlertApi.getAlertById('alert-1'))._id).toBe('alert-1');
    expect(await conflictAlertApi.getHistory('alert-1')).toEqual([{ id: 'h-1', action: 'CREATE' }]);
    expect(get).toHaveBeenLastCalledWith('/conflict-alerts/alert-1/history');
  });

  test('acknowledgeAlert posts a client acknowledgement id and caches the server result as SYNCED', async () => {
    post.mockResolvedValue(ok(alert({ status: AlertStatus.ACKNOWLEDGED, acknowledgedBy: 'R-101' })));

    const updated = await conflictAlertApi.acknowledgeAlert('alert-1');

    expect(post).toHaveBeenCalledWith('/conflict-alerts/alert-1/acknowledge', { clientAcknowledgementId: expect.stringMatching(/^[0-9a-f-]{36}$/) });
    expect(updated.status).toBe(AlertStatus.ACKNOWLEDGED);
    expect(await local()).toMatchObject({ syncStatus: SyncStatus.SYNCED, payload: { status: AlertStatus.ACKNOWLEDGED } });
    expect(await queue()).toEqual([]);
  });

  test('addResponse, resolveAlert, updateAlert and cancelAlert call the matching endpoints with their payloads', async () => {
    post.mockResolvedValue(ok(alert()));
    put.mockResolvedValue(ok(alert()));

    await conflictAlertApi.addResponse('alert-1', responseInput);
    await conflictAlertApi.resolveAlert('alert-1', { resolutionNotes: 'Herd moved away' });
    await conflictAlertApi.updateAlert('alert-1', { description: 'Two elephants' });
    await conflictAlertApi.cancelAlert('alert-1', 'False alarm');

    expect(post.mock.calls).toEqual([
      ['/conflict-alerts/alert-1/responses', responseInput],
      ['/conflict-alerts/alert-1/resolve', { resolutionNotes: 'Herd moved away', clientActionId: expect.stringMatching(/^[0-9a-f-]{36}$/) }],
      ['/conflict-alerts/alert-1/cancel', { reason: 'False alarm' }]
    ]);
    expect(put).toHaveBeenCalledWith('/conflict-alerts/alert-1', { description: 'Two elephants' });
  });

  test('deleteAlert, updateResponse and deleteResponse call the matching endpoints', async () => {
    del.mockResolvedValue(ok(alert({ isDeleted: true })));
    put.mockResolvedValue(ok(alert()));

    await conflictAlertApi.deleteAlert('alert-1', 'Duplicate');
    await conflictAlertApi.updateResponse('alert-1', 'resp-1', { notes: 'Edited' });
    await conflictAlertApi.deleteResponse('alert-1', 'resp-1');

    expect(del.mock.calls).toEqual([['/conflict-alerts/alert-1', { data: { reason: 'Duplicate' } }], ['/conflict-alerts/alert-1/responses/resp-1']]);
    expect(put).toHaveBeenCalledWith('/conflict-alerts/alert-1/responses/resp-1', { notes: 'Edited' });
  });

  test('simulateCollar sends the reading with a generated event id and returns the server result', async () => {
    post.mockResolvedValue(ok({ alertCreated: true, _id: 'alert-9', riskZone: 'Northern Community Buffer Zone' }));

    const result = await conflictAlertApi.simulateCollar({ animalId: 'ELEPHANT-001', latitude: -2.1523, longitude: 34.8214 });

    expect(post).toHaveBeenCalledWith('/conflict-alerts/simulate-collar', { animalId: 'ELEPHANT-001', latitude: -2.1523, longitude: 34.8214, sourceEventId: expect.stringMatching(/^offline-collar-[0-9a-f-]{36}$/) });
    expect(result).toEqual({ alertCreated: true, _id: 'alert-9', riskZone: 'Northern Community Buffer Zone' });
  });

  test('an outside-zone collar reading returns the telemetry-only answer (no alert)', async () => {
    post.mockResolvedValue(ok({ alertCreated: false, telemetrySaved: true }));
    expect(await conflictAlertApi.simulateCollar({ animalId: 'E-1', latitude: 0, longitude: 0, sourceEventId: 'evt-x' })).toEqual({ alertCreated: false, telemetrySaved: true });
    expect(post.mock.calls[0][1]).toMatchObject({ sourceEventId: 'evt-x' });
    expect(await queue()).toEqual([]);
  });

  test('submitCommunityReport posts the report with a generated event id', async () => {
    post.mockResolvedValue(ok(alert({ source: AlertSource.COMMUNITY_REPORT })));
    const report = { latitude: -2.189, longitude: 34.841, reportType: ConflictAlertType.CROP_RAID, description: 'Hippos in maize', reporterName: 'Mzee Juma' };

    await conflictAlertApi.submitCommunityReport(report);

    expect(post).toHaveBeenCalledWith('/conflict-alerts/community-report', { ...report, sourceEventId: expect.stringMatching(/^offline-community-/) });
  });
});

describe('a server rejection is shown, not treated as being offline', () => {
  beforeEach(async () => {
    goOnline();
    await cache(alert({ status: AlertStatus.RESPONDING, responses: [response()] }));
    get.mockResolvedValue(ok(alert({ status: AlertStatus.RESPONDING, responses: [response()] })));
  });

  const operations = [
    ['acknowledgeAlert', () => conflictAlertApi.acknowledgeAlert('alert-1'), () => post],
    ['addResponse', () => conflictAlertApi.addResponse('alert-1', responseInput), () => post],
    ['resolveAlert', () => conflictAlertApi.resolveAlert('alert-1', { resolutionNotes: 'Done now' }), () => post],
    ['updateAlert', () => conflictAlertApi.updateAlert('alert-1', { description: 'Edited' }), () => put],
    ['cancelAlert', () => conflictAlertApi.cancelAlert('alert-1', 'False alarm'), () => post],
    ['deleteAlert', () => conflictAlertApi.deleteAlert('alert-1', 'Duplicate'), () => del],
    ['updateResponse', () => conflictAlertApi.updateResponse('alert-1', 'resp-1', { notes: 'Edited' }), () => put],
    ['deleteResponse', () => conflictAlertApi.deleteResponse('alert-1', 'resp-1'), () => del],
    ['simulateCollar', () => conflictAlertApi.simulateCollar({ animalId: 'E-1', latitude: 1, longitude: 1 }), () => post],
    ['submitCommunityReport', () => conflictAlertApi.submitCommunityReport({ latitude: 1, longitude: 1, reportType: ConflictAlertType.OTHER, description: 'Seen' }), () => post]
  ] as const;

  describe.each([400, 403, 409, 500])('HTTP %d', status => {
    test.each(operations)('%s throws the server message and leaves the device copy and queue untouched', async (_name, call, method) => {
      method().mockRejectedValue(serverError(status, `Server says ${status}`, 'SERVER_CODE'));
      const before = await locals();

      const error = await call().catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({ status, message: `Server says ${status}`, code: 'SERVER_CODE' });
      expect(await locals()).toEqual(before);
      expect(await queue()).toEqual([]);
    });
  });

  test('HTTP 404 on an action (other than delete) is shown as not found and nothing is queued', async () => {
    post.mockRejectedValue(serverError(404, 'Wildlife conflict alert not found.'));
    await expect(conflictAlertApi.acknowledgeAlert('alert-1')).rejects.toMatchObject({ status: 404, message: 'Wildlife conflict alert not found.' });
    expect(await queue()).toEqual([]);
  });

  test('HTTP 404 on delete means the alert is already gone: the device copy is removed and nothing is queued', async () => {
    del.mockRejectedValue(serverError(404));
    expect(await conflictAlertApi.deleteAlert('alert-1', 'Duplicate')).toEqual({ _id: 'alert-1', isDeleted: true, syncStatus: SyncStatus.SYNCED });
    expect(await locals()).toEqual([]);
    expect(await queue()).toEqual([]);
  });

  test('a 409 invalid transition keeps the exact lifecycle message for the ranger', async () => {
    post.mockRejectedValue(serverError(409, 'Resolved alert cannot be acknowledged.', 'INVALID_STATE_TRANSITION'));
    await expect(conflictAlertApi.acknowledgeAlert('alert-1')).rejects.toThrow('Resolved alert cannot be acknowledged.');
  });
});

describe('a lost connection switches to offline field mode', () => {
  beforeEach(() => {
    goOffline();
    get.mockRejectedValue(networkError());
    post.mockRejectedValue(networkError());
    put.mockRejectedValue(networkError());
    del.mockRejectedValue(networkError());
  });

  test('acknowledge offline: the device copy becomes ACKNOWLEDGED + PENDING and one ACKNOWLEDGE_ALERT is queued', async () => {
    await cache(alert());

    const updated = await conflictAlertApi.acknowledgeAlert('alert-1');

    expect(updated).toMatchObject({ status: AlertStatus.ACKNOWLEDGED, acknowledgedBy: 'R-101', acknowledgedName: 'Ranger John', clientAcknowledgementId: expect.any(String) });
    expect(await local()).toMatchObject({ syncStatus: SyncStatus.PENDING, payload: { status: AlertStatus.ACKNOWLEDGED, syncStatus: SyncStatus.PENDING, acknowledgedAt: updated.acknowledgedAt } });
    expect(await queue()).toEqual([
      expect.objectContaining({ entity: 'conflict-alerts', operation: 'ACKNOWLEDGE_ALERT', clientId: 'alert-1', status: SyncStatus.PENDING, attempts: 0, payload: { alertId: 'alert-1', clientAcknowledgementId: updated.clientAcknowledgementId } })
    ]);
  });

  test('a request timeout (no response) is also treated as offline', async () => {
    await cache(alert());
    post.mockRejectedValue(timeoutError());
    expect((await conflictAlertApi.acknowledgeAlert('alert-1')).status).toBe(AlertStatus.ACKNOWLEDGED);
    expect(await queue()).toHaveLength(1);
  });

  test('acknowledging a RESOLVED alert offline is refused and nothing is queued', async () => {
    await cache(alert({ status: AlertStatus.RESOLVED }));
    await expect(conflictAlertApi.acknowledgeAlert('alert-1')).rejects.toThrow('Resolved alert cannot be acknowledged.');
    expect(await queue()).toEqual([]);
    expect((await local())!.payload.status).toBe(AlertStatus.RESOLVED);
  });

  test('respond offline: the response keeps action, notes, outcome and responder, the alert is RESPONDING + PENDING', async () => {
    await cache(alert({ status: AlertStatus.ACKNOWLEDGED }));

    const updated = await conflictAlertApi.addResponse('alert-1', responseInput);

    const [saved] = updated.responses;
    expect(saved).toMatchObject({ ...responseInput, responderId: 'R-101', responderName: 'Ranger John', clientResponseId: saved.responseId });
    expect(await local()).toMatchObject({ syncStatus: SyncStatus.PENDING, payload: { status: AlertStatus.RESPONDING, responses: [saved] } });
    expect(await queue()).toEqual([expect.objectContaining({ operation: 'ADD_RESPONSE', clientId: saved.clientResponseId, payload: { alertId: 'alert-1', input: { ...responseInput, clientResponseId: saved.clientResponseId } } })]);
  });

  test('respond-and-resolve offline records the resolution locally', async () => {
    await cache(alert({ status: AlertStatus.RESPONDING }));
    const updated = await conflictAlertApi.addResponse('alert-1', { ...responseInput, markResolved: true, resolutionNotes: 'Herd left' });
    expect(updated).toMatchObject({ status: AlertStatus.RESOLVED, resolvedBy: 'R-101', resolutionNotes: 'Herd left' });
  });

  test.each([
    [AlertStatus.OPEN, 'Alert must be acknowledged before recording response.'],
    [AlertStatus.RESOLVED, 'Resolved alert cannot accept new responses.']
  ])('responding offline to a %s alert is refused', async (status, message) => {
    await cache(alert({ status }));
    await expect(conflictAlertApi.addResponse('alert-1', responseInput)).rejects.toThrow(message);
    expect(await queue()).toEqual([]);
  });

  test('resolve offline: RESOLVED + PENDING locally, earlier responses retained, RESOLVE_ALERT queued with its client action id', async () => {
    await cache(alert({ status: AlertStatus.RESPONDING, responses: [response()] }));

    const updated = await conflictAlertApi.resolveAlert('alert-1', { resolutionNotes: 'Herd returned to the reserve' });

    expect(updated).toMatchObject({ status: AlertStatus.RESOLVED, resolvedBy: 'R-101', resolutionNotes: 'Herd returned to the reserve', responses: [response()] });
    expect(await local()).toMatchObject({ syncStatus: SyncStatus.PENDING, payload: { status: AlertStatus.RESOLVED, responses: [response()] } });
    expect(await queue()).toEqual([expect.objectContaining({ operation: 'RESOLVE_ALERT', payload: { alertId: 'alert-1', input: { resolutionNotes: 'Herd returned to the reserve', clientActionId: updated.clientResolutionId } } })]);
  });

  test('resolving an already resolved alert offline is refused', async () => {
    await cache(alert({ status: AlertStatus.RESOLVED }));
    await expect(conflictAlertApi.resolveAlert('alert-1', { resolutionNotes: 'Again' })).rejects.toThrow('Alert is already resolved.');
  });

  test('update offline merges the edit and new coordinates into the device copy and queues UPDATE_ALERT', async () => {
    await cache(alert());
    const updated = await conflictAlertApi.updateAlert('alert-1', { description: 'Two elephants', latitude: -2.2 });
    expect(updated).toMatchObject({ description: 'Two elephants', location: { latitude: -2.2, longitude: 34.8214, source: LocationSource.GPS }, syncStatus: SyncStatus.PENDING });
    expect((await queue())[0]).toMatchObject({ operation: 'UPDATE_ALERT', payload: { alertId: 'alert-1', input: { description: 'Two elephants', latitude: -2.2 } } });
  });

  test('cancel offline marks the alert CANCELLED; a resolved alert cannot be cancelled', async () => {
    await cache(alert());
    expect((await conflictAlertApi.cancelAlert('alert-1', 'False alarm')).status).toBe(AlertStatus.CANCELLED);
    expect((await queue())[0]).toMatchObject({ operation: 'CANCEL_ALERT', payload: { alertId: 'alert-1', reason: 'False alarm' } });

    await offlineDb.conflictAlerts.clear();
    await cache(alert({ _id: 'alert-2', status: AlertStatus.RESOLVED }));
    await expect(conflictAlertApi.cancelAlert('alert-2', 'Too late')).rejects.toThrow('Alert cannot be cancelled from its current state.');
  });

  test('delete offline keeps the record on the device marked deleted and PENDING until the server confirms', async () => {
    await cache(alert());
    expect(await conflictAlertApi.deleteAlert('alert-1', 'Duplicate')).toMatchObject({ isDeleted: true, syncStatus: SyncStatus.PENDING });
    expect(await local()).toMatchObject({ syncStatus: SyncStatus.PENDING, payload: { isDeleted: true } });
    expect((await queue())[0]).toMatchObject({ operation: 'DELETE_ALERT', payload: { alertId: 'alert-1', reason: 'Duplicate' } });
  });

  test('editing and deleting a response offline updates the device copy and queues both', async () => {
    await cache(alert({ status: AlertStatus.RESPONDING, responses: [response(), response({ responseId: 'resp-2', notes: 'Second' })] }));

    const edited = await conflictAlertApi.updateResponse('alert-1', 'resp-1', { notes: 'Edited offline' });
    expect(edited.responses.map(r => r.notes)).toEqual(['Edited offline', 'Second']);

    const deleted = await conflictAlertApi.deleteResponse('alert-1', 'resp-2');
    expect(deleted.responses.map(r => r.responseId)).toEqual(['resp-1']);
    expect((await queue()).map(item => item.operation)).toEqual(['UPDATE_RESPONSE', 'DELETE_RESPONSE']);
  });

  test('regression: a second offline edit of the same alert is queued too, so the newer edit is not lost', async () => {
    await cache(alert());

    await conflictAlertApi.updateAlert('alert-1', { description: 'First edit' });
    await conflictAlertApi.updateAlert('alert-1', { description: 'Second edit' });

    expect((await local())!.payload.description).toBe('Second edit');
    expect((await queue()).map(item => (item.payload as { input: { description: string } }).input.description)).toEqual(['First edit', 'Second edit']);
  });

  test('regression: offline edits to two different responses of one alert are both queued', async () => {
    await cache(alert({ status: AlertStatus.RESPONDING, responses: [response(), response({ responseId: 'resp-2' })] }));

    await conflictAlertApi.updateResponse('alert-1', 'resp-1', { notes: 'Edit one' });
    await conflictAlertApi.updateResponse('alert-1', 'resp-2', { notes: 'Edit two' });
    await conflictAlertApi.deleteResponse('alert-1', 'resp-1');
    await conflictAlertApi.deleteResponse('alert-1', 'resp-2');

    expect((await queue()).map(item => [item.operation, (item.payload as { responseId: string }).responseId])).toEqual([
      ['UPDATE_RESPONSE', 'resp-1'],
      ['UPDATE_RESPONSE', 'resp-2'],
      ['DELETE_RESPONSE', 'resp-1'],
      ['DELETE_RESPONSE', 'resp-2']
    ]);
  });

  test('an action on an alert that is neither reachable nor cached reports it as not found', async () => {
    await expect(conflictAlertApi.acknowledgeAlert('unknown')).rejects.toThrow('Wildlife conflict alert not found.');
    expect(await queue()).toEqual([]);
  });

  test('a collar reading and a community report are queued with their event ids and return null', async () => {
    expect(await conflictAlertApi.simulateCollar({ animalId: 'E-1', latitude: -2.1523, longitude: 34.8214, sourceEventId: 'evt-c' })).toBeNull();
    expect(await conflictAlertApi.submitCommunityReport({ latitude: 1, longitude: 1, reportType: ConflictAlertType.CROP_RAID, description: 'Raid', sourceEventId: 'evt-r' })).toBeNull();
    expect((await queue()).map(item => [item.operation, item.clientId])).toEqual([['SIMULATE_COLLAR', 'evt-c'], ['COMMUNITY_REPORT', 'evt-r']]);
  });

  test('the same community report queued twice (same event id) is stored once', async () => {
    const report = { latitude: 1, longitude: 1, reportType: ConflictAlertType.CROP_RAID, description: 'Raid', sourceEventId: 'evt-r' };
    await conflictAlertApi.submitCommunityReport(report);
    await conflictAlertApi.submitCommunityReport(report);
    expect(await queue()).toHaveLength(1);
  });
});

describe('offline alert list', () => {
  beforeEach(() => {
    goOffline();
    get.mockRejectedValue(networkError());
  });

  test('cached alerts are served newest first with their sync status and the requested filters', async () => {
    await cache(alert({ _id: 'old', createdAt: '2026-10-01T00:00:00.000Z' }));
    await cache(alert({ _id: 'new', createdAt: '2026-10-09T00:00:00.000Z', severity: AlertSeverity.LOW }), SyncStatus.PENDING);

    expect((await conflictAlertApi.getAlerts()).map(a => [a._id, a.syncStatus])).toEqual([['new', SyncStatus.PENDING], ['old', SyncStatus.SYNCED]]);
    expect((await conflictAlertApi.getAlerts({ severity: AlertSeverity.LOW })).map(a => a._id)).toEqual(['new']);
    expect(await conflictAlertApi.getAlerts({ status: AlertStatus.RESOLVED })).toEqual([]);
    expect(await conflictAlertApi.getAlerts({ alertType: ConflictAlertType.CROP_RAID })).toEqual([]);
  });

  test('like the server, at most 5 active alerts are listed but every historical alert is kept', async () => {
    for (let i = 0; i < 7; i++) await cache(alert({ _id: `active-${i}`, createdAt: `2026-10-0${i + 1}T00:00:00.000Z` }));
    await cache(alert({ _id: 'resolved', status: AlertStatus.RESOLVED, createdAt: '2026-09-01T00:00:00.000Z' }));

    const ids = (await conflictAlertApi.getAlerts()).map(a => a._id);

    expect(ids).toEqual(['active-6', 'active-5', 'active-4', 'active-3', 'active-2', 'resolved']);
  });

  test('with nothing cached the list fails clearly', async () => {
    await expect(conflictAlertApi.getAlerts()).rejects.toThrow('No cached conflict alerts are available offline.');
  });

  test('getAlertById serves the cached copy offline', async () => {
    await cache(alert(), SyncStatus.PENDING);
    expect(await conflictAlertApi.getAlertById('alert-1')).toMatchObject({ _id: 'alert-1', syncStatus: SyncStatus.PENDING });
  });
});

describe('synchronising offline field actions', () => {
  async function acknowledgeOffline() {
    goOffline();
    get.mockRejectedValue(networkError());
    post.mockRejectedValue(networkError());
    await cache(alert());
    return conflictAlertApi.acknowledgeAlert('alert-1');
  }

  test('PENDING -> reconnect -> server accepts -> queue SYNCED and the device copy holds the server alert', async () => {
    const offline = await acknowledgeOffline();
    post.mockResolvedValue(ok(alert({ status: AlertStatus.ACKNOWLEDGED, acknowledgedBy: 'R-101', updatedAt: '2026-10-09T09:00:00.000Z' })));

    goOnline();
    await waitForQueue(SyncStatus.SYNCED);

    expect(post).toHaveBeenLastCalledWith('/conflict-alerts/alert-1/acknowledge', { alertId: 'alert-1', clientAcknowledgementId: offline.clientAcknowledgementId });
    expect(await locals()).toEqual([expect.objectContaining({ remoteId: 'alert-1', syncStatus: SyncStatus.SYNCED, payload: expect.objectContaining({ status: AlertStatus.ACKNOWLEDGED, updatedAt: '2026-10-09T09:00:00.000Z' }) })]);
  });

  test('a lost connection during sync keeps the item PENDING for an automatic retry and keeps the local alert', async () => {
    await acknowledgeOffline();

    goOnline();
    await vi.waitFor(async () => expect((await queue())[0].attempts).toBe(1));

    expect((await queue())[0]).toMatchObject({ status: SyncStatus.PENDING, lastError: 'Network Error' });
    expect(await local()).toMatchObject({ syncStatus: SyncStatus.PENDING, payload: { status: AlertStatus.ACKNOWLEDGED } });
  });

  test('a server rejection during sync marks the item FAILED but never deletes the local alert or its response', async () => {
    goOffline();
    get.mockRejectedValue(networkError());
    post.mockRejectedValue(networkError());
    await cache(alert({ status: AlertStatus.ACKNOWLEDGED }));
    const offline = await conflictAlertApi.addResponse('alert-1', responseInput);
    post.mockRejectedValue(serverError(409, 'Invalid state transition: Resolved alert cannot accept new responses.'));

    goOnline();
    await waitForQueue(SyncStatus.FAILED);

    expect((await queue())[0]).toMatchObject({ attempts: 1, lastError: 'Request failed with status code 409' });
    expect(await locals()).toEqual([expect.objectContaining({ remoteId: 'alert-1', payload: expect.objectContaining({ status: AlertStatus.RESPONDING, responses: offline.responses }) })]);
  });

  test('Retry: FAILED -> retryFailed -> server accepts -> SYNCED', async () => {
    await acknowledgeOffline();
    post.mockRejectedValue(serverError(500));
    goOnline();
    await vi.waitFor(async () => expect((await queue())[0].attempts).toBe(1));
    // 5xx is retryable for the queue, so it is still PENDING; a later 4xx would make it FAILED.
    post.mockRejectedValue(serverError(400));
    await syncService.processAll();
    expect((await queue())[0]).toMatchObject({ status: SyncStatus.FAILED, attempts: 2 });
    expect(await local()).toMatchObject({ payload: { status: AlertStatus.ACKNOWLEDGED } });

    post.mockResolvedValue(ok(alert({ status: AlertStatus.ACKNOWLEDGED })));
    await syncService.retryFailed();

    expect((await queue())[0]).toMatchObject({ status: SyncStatus.SYNCED });
    expect(await local()).toMatchObject({ syncStatus: SyncStatus.SYNCED });
  });

  test('every queued operation is replayed to its endpoint with the stored payload', async () => {
    goOffline();
    get.mockRejectedValue(networkError());
    post.mockRejectedValue(networkError());
    put.mockRejectedValue(networkError());
    del.mockRejectedValue(networkError());
    await cache(alert({ status: AlertStatus.ACKNOWLEDGED, responses: [response()] }));
    const responded = await conflictAlertApi.addResponse('alert-1', responseInput);
    const resolved = await conflictAlertApi.resolveAlert('alert-1', { resolutionNotes: 'Herd left' });
    await conflictAlertApi.updateAlert('alert-1', { severity: AlertSeverity.LOW });
    await conflictAlertApi.updateResponse('alert-1', 'resp-1', { notes: 'Edited' });
    await conflictAlertApi.deleteResponse('alert-1', 'resp-1');
    await conflictAlertApi.simulateCollar({ animalId: 'E-1', latitude: 1, longitude: 1, sourceEventId: 'evt-c' });
    await conflictAlertApi.submitCommunityReport({ latitude: 1, longitude: 1, reportType: ConflictAlertType.OTHER, description: 'Seen', sourceEventId: 'evt-r' });
    post.mockReset().mockResolvedValue(ok(alert()));
    put.mockReset().mockResolvedValue(ok(alert()));
    del.mockReset().mockResolvedValue(ok(alert()));

    goOnline();
    await vi.waitFor(async () => expect((await queue()).every(item => item.status === SyncStatus.SYNCED)).toBe(true));

    const clientResponseId = responded.responses[1].clientResponseId;
    expect(post.mock.calls).toEqual([
      ['/conflict-alerts/alert-1/responses', { ...responseInput, clientResponseId }],
      ['/conflict-alerts/alert-1/resolve', { resolutionNotes: 'Herd left', clientActionId: resolved.clientResolutionId }],
      ['/conflict-alerts/simulate-collar', { animalId: 'E-1', latitude: 1, longitude: 1, sourceEventId: 'evt-c' }],
      ['/conflict-alerts/community-report', { latitude: 1, longitude: 1, reportType: ConflictAlertType.OTHER, description: 'Seen', sourceEventId: 'evt-r' }]
    ]);
    expect(put.mock.calls).toEqual([['/conflict-alerts/alert-1', { severity: AlertSeverity.LOW }], ['/conflict-alerts/alert-1/responses/resp-1', { notes: 'Edited' }]]);
    expect(del.mock.calls).toEqual([['/conflict-alerts/alert-1/responses/resp-1']]);
  });

  test('cancel and delete are replayed with their reason; a delete answered 404 removes the device copy', async () => {
    goOffline();
    get.mockRejectedValue(networkError());
    post.mockRejectedValue(networkError());
    del.mockRejectedValue(networkError());
    await cache(alert());
    await cache(alert({ _id: 'alert-2' }));
    await conflictAlertApi.cancelAlert('alert-1', 'False alarm');
    await conflictAlertApi.deleteAlert('alert-2', 'Duplicate');
    post.mockReset().mockResolvedValue(ok(alert({ status: AlertStatus.CANCELLED })));
    del.mockReset().mockRejectedValue(serverError(404));

    goOnline();
    await waitForQueue(SyncStatus.SYNCED, SyncStatus.SYNCED);

    expect(post).toHaveBeenCalledWith('/conflict-alerts/alert-1/cancel', { reason: 'False alarm' });
    expect(del).toHaveBeenCalledWith('/conflict-alerts/alert-2', { data: { reason: 'Duplicate' } });
    expect((await locals()).map(r => r.remoteId)).toEqual(['alert-1']);
  });

  test('a delete rejected with another error during sync stays queued as FAILED and keeps the device copy', async () => {
    goOffline();
    get.mockRejectedValue(networkError());
    del.mockRejectedValue(networkError());
    await cache(alert());
    await conflictAlertApi.deleteAlert('alert-1', 'Duplicate');
    del.mockReset().mockRejectedValue(serverError(403));

    goOnline();
    await waitForQueue(SyncStatus.FAILED);
    expect(await local()).toMatchObject({ payload: { isDeleted: true } });
  });

  test('regression: two offline edits sync in order, so the device ends with the newer edit', async () => {
    goOffline();
    get.mockRejectedValue(networkError());
    put.mockRejectedValue(networkError());
    await cache(alert());
    await conflictAlertApi.updateAlert('alert-1', { description: 'First edit' });
    await conflictAlertApi.updateAlert('alert-1', { description: 'Second edit' });
    put.mockReset().mockImplementation(async (_url: string, body: { description: string }) => ok(alert({ description: body.description })));

    goOnline();
    await waitForQueue(SyncStatus.SYNCED, SyncStatus.SYNCED);

    expect(put.mock.calls.map(call => call[1])).toEqual([{ description: 'First edit' }, { description: 'Second edit' }]);
    expect((await local())!.payload.description).toBe('Second edit');
  });
});
