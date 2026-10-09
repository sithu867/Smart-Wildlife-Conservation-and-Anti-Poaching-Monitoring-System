import { jest } from '@jest/globals';
import request from 'supertest';
import { resetIncidentPrisma } from './incidentPrismaMock.js';
import { IncidentDeletionReason, IncidentType } from '../src/types/enums.js';

const { createApp } = await import('../src/app.js');
const { incidentService } = await import('../src/modules/incidents/service.js');
const { AppError } = await import('../src/modules/shared/appError.js');

// UC-B HTTP layer: ranger identity, request validation and error-to-status mapping.
// The service is replaced per test, so these tests cover the controller, routes and error handler.
const app = createApp();
const jpeg = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD';
const report = { incidentType: IncidentType.SNARE, description: 'Wire snare on the fence', latitude: 6.475, longitude: 80.88, evidence: [{ imageUrl: jpeg }] };
const edit = { expectedUpdatedAt: '2026-10-08T11:30:00.000Z', editedAt: '2026-10-08T12:00:00.000Z', clientEditId: 'edit-1', description: 'Two snares' };
const withdrawal = { expectedUpdatedAt: '2026-10-08T11:30:00.000Z', deletedAt: '2026-10-08T12:00:00.000Z', clientDeleteId: 'del-1', reason: IncidentDeletionReason.DUPLICATE };
const saved = { _id: 'inc-1', canEdit: true };

beforeEach(() => resetIncidentPrisma());
afterEach(() => jest.restoreAllMocks());

test('POST /api/incidents reports an incident with 201 for the identified ranger', async () => {
  const spy = jest.spyOn(incidentService, 'createIncident').mockResolvedValue(saved);

  const res = await request(app).post('/api/incidents').set('x-ranger-id', 'R-7').set('x-ranger-name', 'Ranger Seven').send(report);

  expect(res.status).toBe(201);
  expect(res.body).toEqual({ success: true, data: saved });
  expect(spy).toHaveBeenCalledWith('R-7', 'Ranger Seven', expect.objectContaining({ ...report, locationSource: 'GPS' }));
});

test('requests without ranger headers use the demo ranger', async () => {
  const spy = jest.spyOn(incidentService, 'getRangerIncidents').mockResolvedValue([]);

  await request(app).get('/api/incidents/my').expect(200);

  expect(spy).toHaveBeenCalledWith('R-101');
});

test('POST /api/incidents returns every validation problem with 400 and never reaches the service', async () => {
  const spy = jest.spyOn(incidentService, 'createIncident');

  const res = await request(app).post('/api/incidents').send({ ...report, latitude: 95, evidence: [] });

  expect(res.status).toBe(400);
  expect(res.body.error.code).toBe('VALIDATION_ERROR');
  expect(res.body.error.details).toEqual([
    { path: 'latitude', message: 'Latitude must be between -90 and 90' },
    { path: 'evidence', message: 'At least one photo evidence is required' }
  ]);
  expect(spy).not.toHaveBeenCalled();
});

test('a malformed JSON body is a 400 that does not echo the request', async () => {
  const res = await request(app).post('/api/incidents').set('Content-Type', 'application/json').send('{"description": "secret');

  expect(res.status).toBe(400);
  expect(res.body).toEqual({ success: false, error: { message: 'Request must contain valid JSON.' } });
});

test('a request body over 8 MB is rejected with 413 PAYLOAD_TOO_LARGE', async () => {
  const res = await request(app).post('/api/incidents').send({ ...report, evidence: [{ imageUrl: `data:image/jpeg;base64,${'A'.repeat(9 * 1024 * 1024)}` }] });

  expect(res.status).toBe(413);
  expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
});

test('GET /api/incidents/:id returns the report for the ranger', async () => {
  const spy = jest.spyOn(incidentService, 'getIncidentById').mockResolvedValue(saved);

  const res = await request(app).get('/api/incidents/inc-1').set('x-ranger-id', 'R-7');

  expect(res.body.data).toEqual(saved);
  expect(spy).toHaveBeenCalledWith('R-7', 'inc-1');
});

test('PATCH /api/incidents/:id forwards a validated edit', async () => {
  const spy = jest.spyOn(incidentService, 'updateIncident').mockResolvedValue(saved);

  await request(app).patch('/api/incidents/inc-1').set('x-ranger-id', 'R-7').send(edit).expect(200);

  expect(spy).toHaveBeenCalledWith('R-7', 'Ranger John', 'inc-1', edit);
});

test('PATCH rejects an edit of a non-editable field with 400', async () => {
  const spy = jest.spyOn(incidentService, 'updateIncident');

  const res = await request(app).patch('/api/incidents/inc-1').send({ ...edit, status: 'RESOLVED' });

  expect(res.status).toBe(400);
  expect(spy).not.toHaveBeenCalled();
});

test('DELETE /api/incidents/:id withdraws the report with the request body', async () => {
  const spy = jest.spyOn(incidentService, 'deleteIncident').mockResolvedValue({ ...saved, canRestore: true });

  const res = await request(app).delete('/api/incidents/inc-1').set('x-ranger-id', 'R-7').send(withdrawal);

  expect(res.status).toBe(200);
  expect(spy).toHaveBeenCalledWith('R-7', 'inc-1', withdrawal);
});

test('DELETE without a reason is rejected with 400', async () => {
  const { reason: _omitted, ...noReason } = withdrawal;
  const res = await request(app).delete('/api/incidents/inc-1').send(noReason);

  expect(res.status).toBe(400);
  expect(res.body.error.details).toEqual([{ path: 'reason', message: 'Choose a reason for deleting this report' }]);
});

test('POST /api/incidents/:id/restore undoes a withdrawal', async () => {
  const spy = jest.spyOn(incidentService, 'restoreIncident').mockResolvedValue(saved);
  const body = { restoredAt: '2026-10-08T12:01:00.000Z', clientRestoreId: 'restore-1' };

  await request(app).post('/api/incidents/inc-1/restore').set('x-ranger-id', 'R-7').send(body).expect(200);

  expect(spy).toHaveBeenCalledWith('R-7', 'inc-1', body);
});

test.each([
  [404, 'INCIDENT_NOT_FOUND', 'Conservation incident not found.', undefined],
  [403, 'FORBIDDEN', 'Unauthorized: Incident report does not belong to this ranger.', undefined],
  [409, 'EDIT_CONFLICT', 'This report was changed on another device.', { currentUpdatedAt: '2026-10-08T11:45:00.000Z' }],
  [409, 'INCIDENT_LOCKED', 'This report is locked because its patrol has been completed.', { reason: 'PATROL_COMPLETED' }],
  [410, 'INCIDENT_DELETED', 'This report has been deleted.', undefined]
])('a service AppError %d %s is returned with its code and details', async (status, code, message, details) => {
  jest.spyOn(incidentService, 'updateIncident').mockRejectedValue(new AppError(status, code, message, details));

  const res = await request(app).patch('/api/incidents/inc-1').send(edit);

  expect(res.status).toBe(status);
  expect(res.body).toEqual({ success: false, error: { message, code, ...(details ? { details } : {}) } });
});

test.each([
  ['post', '/api/incidents', 'createIncident', report],
  ['get', '/api/incidents/my', 'getRangerIncidents', undefined],
  ['get', '/api/incidents/inc-1', 'getIncidentById', undefined],
  ['delete', '/api/incidents/inc-1', 'deleteIncident', withdrawal],
  ['post', '/api/incidents/inc-1/restore', 'restoreIncident', { restoredAt: '2026-10-08T12:01:00.000Z', clientRestoreId: 'r-1' }]
] as const)('%s %s turns an unexpected failure into a 500 error response', async (method, url, serviceMethod, body) => {
  // The shared error handler currently echoes the internal message for 500s (recorded as a known gap).
  jest.spyOn(incidentService, serviceMethod).mockRejectedValue(new Error('connection reset'));

  const res = await request(app)[method](url).send(body as object);

  expect(res.status).toBe(500);
  expect(res.body).toEqual({ success: false, error: { message: 'connection reset' } });
});
