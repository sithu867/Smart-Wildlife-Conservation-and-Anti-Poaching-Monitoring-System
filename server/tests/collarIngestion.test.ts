import { jest } from '@jest/globals';
import crypto from 'crypto';
import { EventEmitter } from 'events';
import request from 'supertest';
import { ZodError } from 'zod';
import type { NextFunction, Request, Response } from 'express';
import { prisma, resetConflictPrisma } from './conflictAlertPrismaMock.js';
import { AlertSource, AlertStatus } from '../src/types/enums.js';

const { createApp } = await import('../src/app.js');
const { env } = await import('../src/config/env.js');
const { collarIngestionService } = await import('../src/modules/collar-ingestion/service.js');
const { collarIngestionController } = await import('../src/modules/collar-ingestion/controller.js');
const { requireCollarGatewayKey } = await import('../src/modules/collar-ingestion/middleware.js');
const { collarTelemetrySchema, normalizeVendorPayload } = await import('../src/modules/collar-ingestion/validation.js');
const { appEventEmitter, EVENTS } = await import('../src/modules/shared/events.js');

// UC-C GPS collar ingestion: payload validation and vendor normalisation, the gateway key / HMAC
// middleware, telemetry persistence with risk-zone alerting, device monitoring and the HTTP layer.
// Prisma is mocked; the conflict-alert service that decides on alerts is the real one.
const NOW = new Date('2026-10-09T08:00:00.000Z');
const hours = (n: number) => n * 60 * 60 * 1000;
const KEY = 'gateway-key-123';
const SECRET = 'webhook-secret-xyz';
const INSIDE = { latitude: -2.1523, longitude: 34.8214 }; // Northern Community Buffer Zone centre
const OUTSIDE = { latitude: -2.3, longitude: 34.8 };
const reading = (overrides: Record<string, unknown> = {}) => ({
  eventId: 'evt-100',
  deviceId: 'COLLAR-7',
  animalId: 'ELEPHANT-007',
  ...INSIDE,
  recordedAt: '2026-10-09T07:59:00.000Z',
  batteryPercent: 76,
  accuracyMeters: 4.5,
  ...overrides
});
const telemetryRow = (overrides: Record<string, unknown> = {}) => ({ id: 'tel-1', alertCreated: false, ...reading(), recordedAt: new Date('2026-10-09T07:59:00.000Z'), ...overrides });
const echoAlertCreate = () =>
  prisma.wildlifeConflictAlert.create.mockImplementation(async (args: any) => ({ id: 'alert-new', responses: [], createdAt: NOW, ...args.data }));
const sign = (body: unknown, secret = SECRET) => crypto.createHmac('sha256', secret).update(JSON.stringify(body)).digest('hex');

const savedEnv = { key: env.COLLAR_INGESTION_API_KEY, secret: env.COLLAR_WEBHOOK_SECRET };
let telemetryEvents: unknown[];
let alertEvents: unknown[];
const onTelemetry = (payload: unknown) => telemetryEvents.push(payload);
const onAlert = (payload: unknown) => alertEvents.push(payload);

beforeEach(() => {
  resetConflictPrisma();
  jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  env.COLLAR_INGESTION_API_KEY = KEY;
  env.COLLAR_WEBHOOK_SECRET = '';
  telemetryEvents = [];
  alertEvents = [];
  appEventEmitter.on(EVENTS.COLLAR_TELEMETRY_RECEIVED, onTelemetry);
  appEventEmitter.on(EVENTS.ALERT_CREATED, onAlert);
});
afterEach(() => {
  appEventEmitter.off(EVENTS.COLLAR_TELEMETRY_RECEIVED, onTelemetry);
  appEventEmitter.off(EVENTS.ALERT_CREATED, onAlert);
  env.COLLAR_INGESTION_API_KEY = savedEnv.key;
  env.COLLAR_WEBHOOK_SECRET = savedEnv.secret;
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('collar telemetry validation', () => {
  test('a complete reading with an ISO timestamp (UTC or offset) is accepted', () => {
    expect(collarTelemetrySchema.parse(reading())).toEqual(reading());
    expect(collarTelemetrySchema.safeParse(reading({ recordedAt: '2026-10-09T13:29:00+05:30' })).success).toBe(true);
  });

  test.each([
    ['latitude', -90],
    ['latitude', 90],
    ['longitude', -180],
    ['longitude', 180],
    ['batteryPercent', 0],
    ['batteryPercent', 100],
    ['accuracyMeters', 0]
  ])('%s = %d is on the valid boundary', (field, value) => {
    expect(collarTelemetrySchema.safeParse(reading({ [field]: value })).success).toBe(true);
  });

  test.each([
    ['latitude', -90.1],
    ['latitude', 90.1],
    ['longitude', -180.1],
    ['longitude', 180.1],
    ['latitude', Number.POSITIVE_INFINITY],
    ['longitude', '34.8'],
    ['batteryPercent', 101],
    ['batteryPercent', 50.5],
    ['accuracyMeters', -1]
  ])('%s = %p is rejected', (field, value) => {
    const result = collarTelemetrySchema.safeParse(reading({ [field]: value }));
    expect(result.success).toBe(false);
    expect(result.error!.issues[0].path).toEqual([field]);
  });

  test.each(['eventId', 'deviceId', 'animalId'])('a missing or empty %s is rejected', field => {
    expect(collarTelemetrySchema.safeParse(reading({ [field]: '' })).success).toBe(false);
    expect(collarTelemetrySchema.safeParse(reading({ [field]: undefined })).success).toBe(false);
  });

  test.each(['2026-10-09', '09/10/2026 08:00', 'yesterday', ''])('a malformed timestamp "%s" is rejected', recordedAt => {
    expect(collarTelemetrySchema.safeParse(reading({ recordedAt })).success).toBe(false);
  });

  test('an unsupported alert type or a too-short description is rejected', () => {
    expect(collarTelemetrySchema.safeParse(reading({ alertType: 'POACHING' })).success).toBe(false);
    expect(collarTelemetrySchema.safeParse(reading({ description: 'ab' })).success).toBe(false);
  });
});

describe('vendor payload normalisation', () => {
  test('a payload already in the canonical shape is validated as-is', () => {
    expect(normalizeVendorPayload(reading(), 'acme')).toEqual(reading());
  });

  test('a TTN / LoRaWAN uplink is mapped to a canonical reading', () => {
    const ttn = {
      end_device_ids: { device_id: 'collar-42' },
      deduplication_id: 'dedup-1',
      received_at: '2026-10-09T07:00:00Z',
      uplink_message: { decoded_payload: { lat: -2.15, lon: 34.82, battery: 49.6, accuracy: 3 } }
    };
    expect(normalizeVendorPayload(ttn, 'ttn')).toEqual({
      eventId: 'dedup-1',
      deviceId: 'collar-42',
      animalId: 'ANIMAL-42',
      latitude: -2.15,
      longitude: 34.82,
      recordedAt: '2026-10-09T07:00:00.000Z',
      batteryPercent: 50,
      accuracyMeters: 3,
      alertType: undefined,
      description: 'Ingested collar payload from vendor: ttn'
    });
  });

  test('flat alias fields (device_id, animal_id, lat, lng, timestamp) are recognised', () => {
    const normalized = normalizeVendorPayload({ device_id: 'D-1', animal_id: 'RHINO-1', event_id: 'e-1', lat: 1.5, lng: 2.5, timestamp: '2026-10-09T06:00:00Z', battery_level: 10 });
    expect(normalized).toMatchObject({ eventId: 'e-1', deviceId: 'D-1', animalId: 'RHINO-1', latitude: 1.5, longitude: 2.5, recordedAt: '2026-10-09T06:00:00.000Z', batteryPercent: 10, description: 'Ingested collar payload from vendor: generic' });
  });

  test('missing identifiers fall back to an UNKNOWN-DEVICE id and a generated event id; an unparseable time uses now', () => {
    const normalized = normalizeVendorPayload({ latitude: 0, longitude: 0, time: 'not a date' });
    expect(normalized).toMatchObject({ deviceId: 'UNKNOWN-DEVICE', animalId: 'UNKNOWN-DEVICE', eventId: `vendor-evt-UNKNOWN-DEVICE-${NOW.getTime()}`, recordedAt: NOW.toISOString() });
  });

  test('a vendor payload without coordinates is rejected instead of being stored at NaN', () => {
    expect(() => normalizeVendorPayload({ deviceId: 'D-1', animalId: 'A-1' })).toThrow(ZodError);
  });

  test('vendor coordinates out of range are rejected', () => {
    expect(() => normalizeVendorPayload({ deviceId: 'D-1', lat: 95, lng: 10 })).toThrow(ZodError);
  });
});

describe('collar gateway middleware (API key / HMAC signature)', () => {
  const run = (headers: Record<string, string>, body: unknown = reading()) => {
    const req = { headers, body } as unknown as Request;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
    const next = jest.fn();
    requireCollarGatewayKey(req, res as unknown as Response, next as unknown as NextFunction);
    return { res, next, status: (res.status.mock.calls[0]?.[0] as number | undefined), body: res.json.mock.calls[0]?.[0] };
  };

  test.each([
    ['x-collar-api-key', { 'x-collar-api-key': KEY }],
    ['x-api-key', { 'x-api-key': KEY }],
    ['Bearer authorization', { authorization: `Bearer ${KEY}` }]
  ])('the correct key in %s lets the request continue', (_label, headers) => {
    const { next, res } = run(headers);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  test('a missing key is rejected with 401', () => {
    const { next, status, body } = run({});
    expect(next).not.toHaveBeenCalled();
    expect(status).toBe(401);
    expect(body).toEqual({ success: false, error: 'Invalid collar gateway credentials or signature.' });
  });

  test('a wrong key, a key differing only in case, or a non-Bearer scheme is rejected', () => {
    expect(run({ 'x-collar-api-key': 'wrong' }).status).toBe(401);
    expect(run({ 'x-collar-api-key': KEY.toUpperCase() }).status).toBe(401);
    expect(run({ authorization: `Basic ${KEY}` }).status).toBe(401);
  });

  test('when neither a key nor a secret is configured, ingestion is unavailable (503) even with a key supplied', () => {
    env.COLLAR_INGESTION_API_KEY = '';
    const { status, body, next } = run({ 'x-collar-api-key': '' });
    expect(status).toBe(503);
    expect(body).toEqual({ success: false, error: 'Collar ingestion is not configured.' });
    expect(next).not.toHaveBeenCalled();
  });

  test('a valid HMAC-SHA256 signature of the body is accepted without a key (plain or "sha256=" prefixed)', () => {
    env.COLLAR_INGESTION_API_KEY = '';
    env.COLLAR_WEBHOOK_SECRET = SECRET;
    expect(run({ 'x-signature': sign(reading()) }).next).toHaveBeenCalledTimes(1);
    expect(run({ 'x-hub-signature-256': `sha256=${sign(reading())}` }).next).toHaveBeenCalledTimes(1);
  });

  test('a signature made with the wrong secret or for a different body is rejected', () => {
    env.COLLAR_INGESTION_API_KEY = '';
    env.COLLAR_WEBHOOK_SECRET = SECRET;
    expect(run({ 'x-vendor-signature': sign(reading(), 'other-secret') }).status).toBe(401);
    expect(run({ 'x-signature': sign(reading({ latitude: 0 })) }).status).toBe(401);
  });

  test('a malformed (wrong-length) signature is rejected as an invalid HMAC even when a valid key is present', () => {
    env.COLLAR_WEBHOOK_SECRET = SECRET;
    const { status, body, next } = run({ 'x-signature': 'abc', 'x-collar-api-key': KEY });
    expect(status).toBe(401);
    expect(body).toEqual({ success: false, error: 'Invalid HMAC signature.' });
    expect(next).not.toHaveBeenCalled();
  });

  test('a well-formed but wrong signature falls back to the API-key check', () => {
    env.COLLAR_WEBHOOK_SECRET = SECRET;
    const wrong = sign(reading(), 'other-secret');
    expect(run({ 'x-signature': wrong, 'x-collar-api-key': KEY }).next).toHaveBeenCalledTimes(1);
    expect(run({ 'x-signature': wrong }).status).toBe(401);
  });

  test('a signature is ignored when no webhook secret is configured', () => {
    expect(run({ 'x-signature': sign(reading()) }).status).toBe(401);
  });
});

describe('telemetry ingestion and risk-zone alerting', () => {
  test('a new reading inside a risk zone is stored, raises a COLLAR alert, is marked alertCreated and broadcast', async () => {
    prisma.collarTelemetry.create.mockResolvedValue(telemetryRow());
    echoAlertCreate();

    const result = await collarIngestionService.ingest(reading());

    expect(prisma.collarTelemetry.create).toHaveBeenCalledWith({
      data: { eventId: 'evt-100', deviceId: 'COLLAR-7', animalId: 'ELEPHANT-007', latitude: -2.1523, longitude: 34.8214, recordedAt: new Date('2026-10-09T07:59:00.000Z'), batteryPercent: 76, accuracyMeters: 4.5 }
    });
    expect((prisma.wildlifeConflictAlert.create.mock.calls[0][0] as any).data).toMatchObject({ sourceEventId: 'evt-100', source: AlertSource.COLLAR, animalId: 'ELEPHANT-007', status: AlertStatus.OPEN });
    expect(prisma.collarTelemetry.update).toHaveBeenCalledWith({ where: { id: 'tel-1' }, data: { alertCreated: true } });
    expect(result).toMatchObject({ duplicate: false, telemetrySaved: true, alertCreated: true, telemetryId: 'tel-1', alert: expect.objectContaining({ _id: 'alert-new', riskZone: 'Northern Community Buffer Zone' }) });
    expect(telemetryEvents).toEqual([expect.objectContaining({ alertCreated: true })]);
    expect(alertEvents).toEqual([expect.objectContaining({ _id: 'alert-new' })]);
  });

  test('a reading outside every zone is stored as tracking data only: no alert, no alert broadcast', async () => {
    prisma.collarTelemetry.create.mockResolvedValue(telemetryRow(OUTSIDE));

    const result = await collarIngestionService.ingest(reading(OUTSIDE));

    expect(prisma.wildlifeConflictAlert.create).not.toHaveBeenCalled();
    expect(prisma.collarTelemetry.update).toHaveBeenCalledWith({ where: { id: 'tel-1' }, data: { alertCreated: false } });
    expect(result).toMatchObject({ duplicate: false, alertCreated: false, telemetry: expect.objectContaining({ alertCreated: false }) });
    expect(result).not.toHaveProperty('alert');
    expect(telemetryEvents).toHaveLength(1);
    expect(alertEvents).toHaveLength(0);
  });

  test('a duplicate event whose alert was already raised is acknowledged without storing or alerting again', async () => {
    prisma.collarTelemetry.findUnique.mockResolvedValue(telemetryRow({ alertCreated: true }));

    const result = await collarIngestionService.ingest(reading());

    expect(result).toEqual({ duplicate: true, telemetrySaved: true, alertCreated: true, telemetryId: 'tel-1' });
    expect(prisma.collarTelemetry.create).not.toHaveBeenCalled();
    expect(prisma.wildlifeConflictAlert.create).not.toHaveBeenCalled();
    expect(telemetryEvents).toHaveLength(0);
  });

  test('a duplicate outside-zone event stays a duplicate without an alert or broadcast', async () => {
    prisma.collarTelemetry.findUnique.mockResolvedValue(telemetryRow({ ...OUTSIDE, alertCreated: false }));

    const result = await collarIngestionService.ingest(reading(OUTSIDE));

    expect(result).toEqual({ duplicate: true, telemetrySaved: true, alertCreated: false, telemetryId: 'tel-1' });
    expect(prisma.collarTelemetry.create).not.toHaveBeenCalled();
    expect(prisma.wildlifeConflictAlert.create).not.toHaveBeenCalled();
    expect(prisma.collarTelemetry.update).not.toHaveBeenCalled();
    expect(telemetryEvents).toHaveLength(0);
  });

  test('if alert creation fails after the reading was stored, the error is reported and the reading is not marked alerted', async () => {
    prisma.collarTelemetry.create.mockResolvedValue(telemetryRow());
    prisma.wildlifeConflictAlert.create.mockRejectedValue(new Error('alert insert failed'));

    await expect(collarIngestionService.ingest(reading())).rejects.toThrow('alert insert failed');
    expect(prisma.collarTelemetry.update).not.toHaveBeenCalled();
    expect(alertEvents).toHaveLength(0);
  });

  test('regression: a gateway retry after a failed alert step raises the missing alert instead of reporting a harmless duplicate', async () => {
    // First delivery stored the reading, then failed before the alert was created (previous test).
    prisma.collarTelemetry.findUnique.mockResolvedValue(telemetryRow({ alertCreated: false }));
    echoAlertCreate();

    const result = await collarIngestionService.ingest(reading());

    expect(prisma.collarTelemetry.create).not.toHaveBeenCalled();
    expect(prisma.wildlifeConflictAlert.create).toHaveBeenCalledTimes(1);
    expect(prisma.collarTelemetry.update).toHaveBeenCalledWith({ where: { id: 'tel-1' }, data: { alertCreated: true } });
    expect(result).toMatchObject({ duplicate: true, alertCreated: true, telemetryId: 'tel-1', alert: expect.objectContaining({ _id: 'alert-new' }) });
    expect(alertEvents).toHaveLength(1);
  });

  test('a telemetry persistence failure is reported and no alert is created', async () => {
    prisma.collarTelemetry.create.mockRejectedValue(new Error('telemetry insert failed'));
    await expect(collarIngestionService.ingest(reading())).rejects.toThrow('telemetry insert failed');
    expect(prisma.wildlifeConflictAlert.create).not.toHaveBeenCalled();
  });

  test('a database read failure on the duplicate check is reported and nothing is written', async () => {
    prisma.collarTelemetry.findUnique.mockRejectedValue(new Error('read timeout'));
    await expect(collarIngestionService.ingest(reading())).rejects.toThrow('read timeout');
    expect(prisma.collarTelemetry.create).not.toHaveBeenCalled();
  });
});

describe('collar device monitoring', () => {
  const row = (deviceId: string, recordedAt: Date, overrides: Record<string, unknown> = {}) => ({ deviceId, animalId: `ANIMAL-${deviceId}`, ...OUTSIDE, recordedAt, batteryPercent: 80, accuracyMeters: null, ...overrides });

  test('readings are grouped per device using the newest reading, counting all readings', async () => {
    prisma.collarTelemetry.findMany.mockResolvedValue([row('C-1', new Date(NOW.getTime() - hours(1)), INSIDE), row('C-1', new Date(NOW.getTime() - hours(5))), row('C-2', new Date(NOW.getTime() - hours(2)))]);

    const devices = await collarIngestionService.getCollarDevices();

    expect(prisma.collarTelemetry.findMany).toHaveBeenCalledWith({ orderBy: { recordedAt: 'desc' } });
    expect(devices).toHaveLength(2);
    expect(devices[0]).toMatchObject({ deviceId: 'C-1', totalReadings: 2, lastLatitude: INSIDE.latitude, nearestRiskZone: { zoneName: 'Northern Community Buffer Zone', distanceKm: 0, inside: true } });
    expect(devices[1]).toMatchObject({ deviceId: 'C-2', totalReadings: 1, nearestRiskZone: expect.objectContaining({ inside: false }) });
  });

  test('a collar is ONLINE up to exactly 24 hours since its last reading and OFFLINE after that', async () => {
    prisma.collarTelemetry.findMany.mockResolvedValue([row('C-EDGE', new Date(NOW.getTime() - hours(24))), row('C-OLD', new Date(NOW.getTime() - hours(24) - 1))]);
    const [edge, old] = await collarIngestionService.getCollarDevices();
    expect(edge).toMatchObject({ isOnline: true, status: 'ONLINE' });
    expect(old).toMatchObject({ isOnline: false, status: 'OFFLINE' });
  });

  test.each([
    [null, 'UNKNOWN'],
    [0, 'CRITICAL'],
    [20, 'CRITICAL'],
    [21, 'WARNING'],
    [50, 'WARNING'],
    [51, 'GOOD']
  ])('battery %p is classified %s', async (batteryPercent, batteryStatus) => {
    prisma.collarTelemetry.findMany.mockResolvedValue([row('C-1', NOW, { batteryPercent })]);
    expect((await collarIngestionService.getCollarDevices())[0].batteryStatus).toBe(batteryStatus);
  });

  test('stats count online, offline, low-battery (<= 20%) and in-zone collars', async () => {
    prisma.collarTelemetry.findMany.mockResolvedValue([
      row('C-1', NOW, { ...INSIDE, batteryPercent: 20 }),
      row('C-2', new Date(NOW.getTime() - hours(48)), { batteryPercent: null }),
      row('C-3', NOW, { batteryPercent: 90 })
    ]);
    expect(await collarIngestionService.getCollarStats()).toEqual({ totalDevices: 3, onlineDevices: 2, offlineDevices: 1, lowBatteryDevices: 1, insideRiskZone: 1 });
  });

  test('no telemetry means no devices and zeroed stats', async () => {
    prisma.collarTelemetry.findMany.mockResolvedValue([]);
    expect(await collarIngestionService.getCollarStats()).toEqual({ totalDevices: 0, onlineDevices: 0, offlineDevices: 0, lowBatteryDevices: 0, insideRiskZone: 0 });
  });

  test('telemetry history matches device or animal id, newest first, capped at 100', async () => {
    prisma.collarTelemetry.findMany.mockResolvedValue([]);
    await collarIngestionService.getCollarTelemetryHistory('C-1');
    expect(prisma.collarTelemetry.findMany).toHaveBeenCalledWith({ where: { OR: [{ deviceId: 'C-1' }, { animalId: 'C-1' }] }, orderBy: { recordedAt: 'desc' }, take: 100 });
  });
});

describe('collar ingestion HTTP routes', () => {
  const app = createApp();
  const ingested = { duplicate: false, telemetrySaved: true, alertCreated: true, telemetryId: 'tel-1' };

  test('POST /collar-location with a valid key accepts a new reading with 202', async () => {
    const spy = jest.spyOn(collarIngestionService, 'ingest').mockResolvedValue(ingested as any);
    const res = await request(app).post('/api/device-ingestion/collar-location').set('x-collar-api-key', KEY).send(reading());
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ success: true, data: ingested });
    expect(spy).toHaveBeenCalledWith(reading());
  });

  test('a duplicate delivery is answered with 200', async () => {
    jest.spyOn(collarIngestionService, 'ingest').mockResolvedValue({ ...ingested, duplicate: true } as any);
    expect((await request(app).post('/api/device-ingestion/collar-location').set('x-collar-api-key', KEY).send(reading())).status).toBe(200);
  });

  test('a rejected gateway request never reaches the ingestion service', async () => {
    const spy = jest.spyOn(collarIngestionService, 'ingest');
    const res = await request(app).post('/api/device-ingestion/collar-location').set('x-collar-api-key', 'wrong').send(reading());
    expect(res.status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
  });

  test('an invalid reading is a 400 validation error and never reaches the service', async () => {
    const spy = jest.spyOn(collarIngestionService, 'ingest');
    const res = await request(app).post('/api/device-ingestion/collar-location').set('x-collar-api-key', KEY).send(reading({ latitude: 91, animalId: '' }));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.map((d: { path: string }) => d.path)).toEqual(['animalId', 'latitude']);
    expect(spy).not.toHaveBeenCalled();
  });

  test('a signed vendor webhook is normalised and tagged with the vendor', async () => {
    env.COLLAR_WEBHOOK_SECRET = SECRET;
    const spy = jest.spyOn(collarIngestionService, 'ingest').mockResolvedValue(ingested as any);
    const body = { device_id: 'collar-9', lat: -2.15, lng: 34.82, event_id: 'v-1', timestamp: '2026-10-09T07:00:00Z' };

    const res = await request(app).post('/api/device-ingestion/vendor-webhook/ttn').set('x-signature', sign(body)).send(body);

    expect(res.status).toBe(202);
    expect(res.body.vendor).toBe('ttn');
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ eventId: 'v-1', deviceId: 'collar-9', animalId: 'ANIMAL-9' }));
  });

  test('an unexpected ingestion failure becomes a 500', async () => {
    jest.spyOn(collarIngestionService, 'ingest').mockRejectedValue(new Error('boom'));
    expect((await request(app).post('/api/device-ingestion/collar-location').set('x-collar-api-key', KEY).send(reading())).status).toBe(500);
    expect((await request(app).post('/api/device-ingestion/vendor-webhook/acme').set('x-collar-api-key', KEY).send(reading())).status).toBe(500);
  });

  test('GET /collars returns devices with stats; GET telemetry returns the device history', async () => {
    jest.spyOn(collarIngestionService, 'getCollarDevices').mockResolvedValue([{ deviceId: 'C-1' }] as any);
    jest.spyOn(collarIngestionService, 'getCollarStats').mockResolvedValue({ totalDevices: 1 } as any);
    const history = jest.spyOn(collarIngestionService, 'getCollarTelemetryHistory').mockResolvedValue([{ id: 't-1' }] as any);

    expect((await request(app).get('/api/device-ingestion/collars')).body).toEqual({ success: true, data: [{ deviceId: 'C-1' }], stats: { totalDevices: 1 } });
    expect((await request(app).get('/api/device-ingestion/collars/C-1/telemetry')).body).toEqual({ success: true, data: [{ id: 't-1' }] });
    expect(history).toHaveBeenCalledWith('C-1');
  });

  test('monitoring read failures become 500', async () => {
    jest.spyOn(collarIngestionService, 'getCollarDevices').mockRejectedValue(new Error('db'));
    jest.spyOn(collarIngestionService, 'getCollarTelemetryHistory').mockRejectedValue(new Error('db'));
    expect((await request(app).get('/api/device-ingestion/collars')).status).toBe(500);
    expect((await request(app).get('/api/device-ingestion/collars/C-1/telemetry')).status).toBe(500);
  });

  test('the live stream sends a ping, forwards telemetry and alert events, and unsubscribes when the client disconnects', () => {
    const req = new EventEmitter() as unknown as Request;
    const written: string[] = [];
    const res = { setHeader: jest.fn(), flushHeaders: jest.fn(), write: (chunk: string) => written.push(chunk) } as unknown as Response;
    const before = appEventEmitter.listenerCount(EVENTS.ALERT_CREATED);

    collarIngestionController.streamEvents(req, res);
    appEventEmitter.emit(EVENTS.COLLAR_TELEMETRY_RECEIVED, { deviceId: 'C-1' });
    appEventEmitter.emit(EVENTS.ALERT_CREATED, { _id: 'alert-1' });
    (req as unknown as EventEmitter).emit('close');
    appEventEmitter.emit(EVENTS.ALERT_CREATED, { _id: 'after-close' });

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
    expect(written).toEqual([
      `event: ping\ndata: ${JSON.stringify({ timestamp: NOW.toISOString() })}\n\n`,
      'event: collar-telemetry\ndata: {"deviceId":"C-1"}\n\n',
      'event: conflict-alert\ndata: {"_id":"alert-1"}\n\n'
    ]);
    expect(appEventEmitter.listenerCount(EVENTS.ALERT_CREATED)).toBe(before);
  });
});
