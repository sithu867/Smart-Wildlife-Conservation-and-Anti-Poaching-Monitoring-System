import { jest } from '@jest/globals';
import request from 'supertest';
import { resetConflictPrisma } from './conflictAlertPrismaMock.js';
import { AlertSeverity, AlertStatus, ConflictAlertType, ResponseAction } from '../src/types/enums.js';

const { createApp } = await import('../src/app.js');
const { conflictAlertService } = await import('../src/modules/conflict-alerts/service.js');
const { AppError } = await import('../src/modules/shared/appError.js');

// UC-C HTTP layer: ranger identity, request validation and error-to-status mapping.
// The service is replaced per test, so these tests cover the controller, routes and error handler.
const app = createApp();
const saved = { _id: 'alert-1', status: AlertStatus.OPEN };
const collar = { animalId: 'ELEPHANT-001', latitude: -2.1523, longitude: 34.8214 };
const community = { latitude: -2.189, longitude: 34.841, reportType: ConflictAlertType.CROP_RAID, description: 'Hippo pod in maize' };
const response = { action: ResponseAction.INVESTIGATED_AREA, notes: 'Checked fence', clientResponseId: 'c-1' };
const conflict = (message: string) => new AppError(409, 'INVALID_STATE_TRANSITION', message);

beforeEach(() => resetConflictPrisma());
afterEach(() => jest.restoreAllMocks());

describe('alert creation', () => {
  test('POST /simulate-collar returns 201 with the service result; omitted type and severity get schema defaults', async () => {
    const spy = jest.spyOn(conflictAlertService, 'simulateCollarEvent').mockResolvedValue({ alertCreated: true, ...saved });

    const res = await request(app).post('/api/conflict-alerts/simulate-collar').send(collar);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ success: true, data: { alertCreated: true, ...saved } });
    expect(spy).toHaveBeenCalledWith({ ...collar, alertType: ConflictAlertType.DANGEROUS_WILDLIFE_ACTIVITY, severity: AlertSeverity.HIGH });
  });

  test('a collar reading outside every zone is still a 201 that reports alertCreated: false', async () => {
    jest.spyOn(conflictAlertService, 'simulateCollarEvent').mockResolvedValue({ alertCreated: false, telemetrySaved: true });
    const res = await request(app).post('/api/conflict-alerts/simulate-collar').send({ ...collar, latitude: 0, longitude: 0 });
    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({ alertCreated: false, telemetrySaved: true });
  });

  test('invalid collar coordinates are a 400 and never reach the service', async () => {
    const spy = jest.spyOn(conflictAlertService, 'simulateCollarEvent');
    const res = await request(app).post('/api/conflict-alerts/simulate-collar').send({ ...collar, latitude: -91, longitude: 181 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: 'VALIDATION_ERROR', details: [expect.objectContaining({ path: 'latitude' }), expect.objectContaining({ path: 'longitude' })] });
    expect(spy).not.toHaveBeenCalled();
  });

  test('POST /community-report returns 201 with the default reporter and severity applied', async () => {
    const spy = jest.spyOn(conflictAlertService, 'submitCommunityReport').mockResolvedValue(saved);
    const res = await request(app).post('/api/conflict-alerts/community-report').send(community);
    expect(res.status).toBe(201);
    expect(spy).toHaveBeenCalledWith({ ...community, reporterName: 'Community Member', severity: AlertSeverity.MEDIUM });
  });

  test('a community report without location or description is a 400', async () => {
    const spy = jest.spyOn(conflictAlertService, 'submitCommunityReport');
    const res = await request(app).post('/api/conflict-alerts/community-report').send({ reportType: ConflictAlertType.CROP_RAID });
    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d: { path: string }) => d.path)).toEqual(['latitude', 'longitude', 'description']);
    expect(spy).not.toHaveBeenCalled();
  });

  test('POST / creates a direct alert with 201', async () => {
    const spy = jest.spyOn(conflictAlertService, 'createAlert').mockResolvedValue(saved);
    const body = { source: 'COLLAR', alertType: 'CROP_RAID', severity: 'LOW', latitude: 0, longitude: 0, description: 'Raid' };
    expect((await request(app).post('/api/conflict-alerts').send(body)).status).toBe(201);
    expect(spy).toHaveBeenCalledWith({ ...body, locationSource: 'GPS' });
  });

  test('an unexpected failure while creating is a 500', async () => {
    jest.spyOn(conflictAlertService, 'submitCommunityReport').mockRejectedValue(new Error('db unavailable'));
    expect((await request(app).post('/api/conflict-alerts/community-report').send(community)).status).toBe(500);
  });
});

describe('retrieval', () => {
  test('GET / passes status, severity and type filters and includeDeleted only when "true"', async () => {
    const spy = jest.spyOn(conflictAlertService, 'getAlerts').mockResolvedValue([saved]);
    const res = await request(app).get('/api/conflict-alerts').query({ status: 'RESOLVED', severity: 'HIGH', alertType: 'CROP_RAID', includeDeleted: 'yes' });
    expect(res.body).toEqual({ success: true, data: [saved] });
    expect(spy).toHaveBeenCalledWith({ status: 'RESOLVED', severity: 'HIGH', alertType: 'CROP_RAID', includeDeleted: false });
  });

  test('GET /:id returns the alert; an unknown alert is a 404 with the not-found message', async () => {
    const spy = jest.spyOn(conflictAlertService, 'getAlertById').mockResolvedValueOnce(saved).mockRejectedValueOnce(new Error('Wildlife conflict alert not found.'));
    expect((await request(app).get('/api/conflict-alerts/alert-1').query({ includeDeleted: 'true' })).body.data).toEqual(saved);
    expect(spy).toHaveBeenCalledWith('alert-1', true);

    const missing = await request(app).get('/api/conflict-alerts/nope');
    expect(missing.status).toBe(404);
    expect(missing.body.error.message).toBe('Wildlife conflict alert not found.');
  });

  test('responses and history are returned for an alert', async () => {
    jest.spyOn(conflictAlertService, 'getResponses').mockResolvedValue([{ responseId: 'r-1' }]);
    jest.spyOn(conflictAlertService, 'getHistory').mockResolvedValue([{ action: 'CREATE' }]);
    expect((await request(app).get('/api/conflict-alerts/alert-1/responses')).body.data).toEqual([{ responseId: 'r-1' }]);
    expect((await request(app).get('/api/conflict-alerts/alert-1/history')).body.data).toEqual([{ action: 'CREATE' }]);
  });

  test('read failures are 500s', async () => {
    jest.spyOn(conflictAlertService, 'getAlerts').mockRejectedValue(new Error('x'));
    jest.spyOn(conflictAlertService, 'getResponses').mockRejectedValue(new Error('x'));
    jest.spyOn(conflictAlertService, 'getHistory').mockRejectedValue(new Error('x'));
    expect((await request(app).get('/api/conflict-alerts')).status).toBe(500);
    expect((await request(app).get('/api/conflict-alerts/a/responses')).status).toBe(500);
    expect((await request(app).get('/api/conflict-alerts/a/history')).status).toBe(500);
  });
});

describe('lifecycle actions', () => {
  test('acknowledge uses the ranger headers and the client acknowledgement id', async () => {
    const spy = jest.spyOn(conflictAlertService, 'acknowledgeAlert').mockResolvedValue({ ...saved, status: AlertStatus.ACKNOWLEDGED });
    const res = await request(app).post('/api/conflict-alerts/alert-1/acknowledge').set('x-ranger-id', 'R-7').set('x-ranger-name', 'Ranger Seven').send({ clientAcknowledgementId: 'ack-1' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe(AlertStatus.ACKNOWLEDGED);
    expect(spy).toHaveBeenCalledWith('R-7', 'Ranger Seven', 'alert-1', 'ack-1');
  });

  test('without ranger headers the demo ranger is used; an empty body is accepted', async () => {
    const spy = jest.spyOn(conflictAlertService, 'acknowledgeAlert').mockResolvedValue(saved);
    await request(app).post('/api/conflict-alerts/alert-1/acknowledge').expect(200);
    expect(spy).toHaveBeenCalledWith('R-101', 'Ranger John', 'alert-1', undefined);
  });

  test('an invalid lifecycle transition is a 409 with the transition message and code', async () => {
    jest.spyOn(conflictAlertService, 'acknowledgeAlert').mockRejectedValue(conflict('Resolved alert cannot be acknowledged.'));
    const res = await request(app).post('/api/conflict-alerts/alert-1/acknowledge');
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ success: false, error: { message: 'Resolved alert cannot be acknowledged.', code: 'INVALID_STATE_TRANSITION' } });
  });

  test('a field response is recorded with markResolved defaulted to false', async () => {
    const spy = jest.spyOn(conflictAlertService, 'addResponse').mockResolvedValue({ ...saved, status: AlertStatus.RESPONDING });
    expect((await request(app).post('/api/conflict-alerts/alert-1/responses').set('x-ranger-id', 'R-7').send(response)).status).toBe(200);
    expect(spy).toHaveBeenCalledWith('R-7', 'Ranger John', 'alert-1', { ...response, markResolved: false });
  });

  test('a response with too-short notes is a 400; responding to an OPEN alert is a 409', async () => {
    const spy = jest.spyOn(conflictAlertService, 'addResponse').mockRejectedValue(conflict('Invalid state transition: Alert must be acknowledged before recording response.'));
    expect((await request(app).post('/api/conflict-alerts/alert-1/responses').send({ ...response, notes: 'ok' })).status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
    const res = await request(app).post('/api/conflict-alerts/alert-1/responses').send(response);
    expect(res.status).toBe(409);
    expect(res.body.error.message).toContain('must be acknowledged');
  });

  test('resolve requires notes; resolving before a response is a 409; success returns RESOLVED', async () => {
    const spy = jest.spyOn(conflictAlertService, 'resolveAlert')
      .mockRejectedValueOnce(conflict('Invalid state transition: ACKNOWLEDGED alert cannot be resolved.'))
      .mockResolvedValueOnce({ ...saved, status: AlertStatus.RESOLVED });

    expect((await request(app).post('/api/conflict-alerts/alert-1/resolve').send({})).status).toBe(400);
    expect((await request(app).post('/api/conflict-alerts/alert-1/resolve').send({ resolutionNotes: 'Too early' })).status).toBe(409);
    const ok = await request(app).post('/api/conflict-alerts/alert-1/resolve').send({ resolutionNotes: 'Herd moved away', clientActionId: 'res-1' });
    expect(ok.status).toBe(200);
    expect(ok.body.data.status).toBe(AlertStatus.RESOLVED);
    expect(spy).toHaveBeenLastCalledWith('R-101', 'Ranger John', 'alert-1', { resolutionNotes: 'Herd moved away', clientActionId: 'res-1' });
  });

  test('cancel requires a reason and maps a terminal-state cancel to 409', async () => {
    const spy = jest.spyOn(conflictAlertService, 'cancelAlert').mockRejectedValueOnce(conflict('Invalid state transition: RESOLVED alert cannot be cancelled.')).mockResolvedValueOnce({ ...saved, status: AlertStatus.CANCELLED });
    expect((await request(app).post('/api/conflict-alerts/alert-1/cancel').send({})).status).toBe(400);
    expect((await request(app).post('/api/conflict-alerts/alert-1/cancel').send({ reason: 'False alarm' })).status).toBe(409);
    expect((await request(app).post('/api/conflict-alerts/alert-1/cancel').send({ reason: 'False alarm' })).body.data.status).toBe(AlertStatus.CANCELLED);
    expect(spy).toHaveBeenLastCalledWith('R-101', 'Ranger John', 'alert-1', 'False alarm');
  });

  test('an unexpected failure during a lifecycle action is a 500', async () => {
    jest.spyOn(conflictAlertService, 'addResponse').mockRejectedValue(new Error('deadlock detected'));
    expect((await request(app).post('/api/conflict-alerts/alert-1/responses').send(response)).status).toBe(500);
  });
});

describe('edit and delete', () => {
  test('PUT /:id validates the edit and passes it on', async () => {
    const spy = jest.spyOn(conflictAlertService, 'updateAlert').mockResolvedValue(saved);
    expect((await request(app).put('/api/conflict-alerts/alert-1').send({})).status).toBe(400);
    expect((await request(app).put('/api/conflict-alerts/alert-1').send({ severity: 'CRITICAL' })).status).toBe(200);
    expect(spy).toHaveBeenCalledWith('R-101', 'Ranger John', 'alert-1', { severity: 'CRITICAL' });
  });

  test('editing a read-only alert is a 403', async () => {
    jest.spyOn(conflictAlertService, 'updateAlert').mockRejectedValue(new Error('Unauthorized: RESOLVED alerts are read-only.'));
    const res = await request(app).put('/api/conflict-alerts/alert-1').send({ description: 'Late edit' });
    expect(res.status).toBe(403);
    expect(res.body.error.message).toBe('Unauthorized: RESOLVED alerts are read-only.');
  });

  test('DELETE /:id soft-deletes with an optional reason; unknown alerts are 404', async () => {
    const spy = jest.spyOn(conflictAlertService, 'deleteAlert').mockResolvedValueOnce({ ...saved, isDeleted: true }).mockRejectedValueOnce(new Error('Wildlife conflict alert not found.'));
    expect((await request(app).delete('/api/conflict-alerts/alert-1').send({ reason: 'Duplicate' })).body.data.isDeleted).toBe(true);
    expect(spy).toHaveBeenCalledWith('R-101', 'Ranger John', 'alert-1', 'Duplicate');
    expect((await request(app).delete('/api/conflict-alerts/nope')).status).toBe(404);
  });

  test('responses can be edited and deleted by id; another ranger gets 403', async () => {
    const update = jest.spyOn(conflictAlertService, 'updateResponse').mockResolvedValueOnce(saved).mockRejectedValueOnce(new Error('Unauthorized: only the original responder can update this response.'));
    const remove = jest.spyOn(conflictAlertService, 'deleteResponse').mockResolvedValue(saved);

    expect((await request(app).put('/api/conflict-alerts/alert-1/responses/r-1').set('x-ranger-id', 'R-7').send({ notes: 'Edited' })).status).toBe(200);
    expect(update).toHaveBeenCalledWith('R-7', 'Ranger John', 'alert-1', 'r-1', { notes: 'Edited' });
    expect((await request(app).put('/api/conflict-alerts/alert-1/responses/r-1').send({ notes: 'Hijack' })).status).toBe(403);
    expect((await request(app).put('/api/conflict-alerts/alert-1/responses/r-1').send({})).status).toBe(400);

    expect((await request(app).delete('/api/conflict-alerts/alert-1/responses/r-1')).status).toBe(200);
    expect(remove).toHaveBeenCalledWith('R-101', 'Ranger John', 'alert-1', 'r-1', undefined);
  });

  test('edit/delete failures are passed to the error handler', async () => {
    jest.spyOn(conflictAlertService, 'deleteResponse').mockRejectedValue(new Error('Conflict response not found.'));
    expect((await request(app).delete('/api/conflict-alerts/alert-1/responses/x')).status).toBe(404);
  });
});
