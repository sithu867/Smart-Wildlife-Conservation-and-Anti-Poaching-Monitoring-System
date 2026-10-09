import { jest } from '@jest/globals';
import { ZodError } from 'zod';
import { prisma, resetConflictPrisma } from './conflictAlertPrismaMock.js';
import { AlertSeverity, AlertSource, AlertStatus, ConflictAlertType, LocationSource, ResponseAction, SyncStatus } from '../src/types/enums.js';

const { conflictAlertService, CONFIG_RISK_ZONES } = await import('../src/modules/conflict-alerts/service.js');
type RiskZone = (typeof CONFIG_RISK_ZONES)[number];

// UC-C conflict-alert service rules with Prisma mocked (no database). The clock is fixed at NOW.
const NOW = new Date('2026-10-09T08:00:00.000Z');
const PARK = 'c67a000000000000000000001';
const RANGER = 'R-7';
const NAME = 'Ranger Seven';
const ORIGINAL_ZONES = [...CONFIG_RISK_ZONES];
// Configured zone centres (see CONFIG_RISK_ZONES).
const NORTH_BUFFER = { latitude: -2.1523, longitude: 34.8214 };
const VILLAGE = { latitude: -2.189, longitude: 34.841 };
const OUTSIDE = { latitude: -2.3, longitude: 34.8 };

const alertRow = (overrides: Record<string, any> = {}) => ({
  id: 'alert-1',
  clientAlertId: null,
  sourceEventId: 'evt-1',
  source: AlertSource.COLLAR,
  alertType: ConflictAlertType.DANGEROUS_WILDLIFE_ACTIVITY,
  severity: AlertSeverity.HIGH,
  status: AlertStatus.OPEN,
  location: { latitude: -2.1523, longitude: 34.8214, timestamp: '2026-10-09T07:00:00.000Z', source: LocationSource.GPS },
  description: 'Elephant at the buffer fence',
  animalId: 'ELEPHANT-001',
  reporterName: null,
  responses: [] as any[],
  createdAt: new Date('2026-10-09T07:00:00.000Z'),
  ...overrides
});
const responseRow = (overrides: Record<string, any> = {}) => ({
  id: 'resp-db-1',
  responseId: 'resp-1',
  clientResponseId: 'client-resp-1',
  responderId: RANGER,
  responderName: NAME,
  action: ResponseAction.INVESTIGATED_AREA,
  notes: 'Investigated the fence line',
  ...overrides
});
const collarInput = (overrides: Record<string, any> = {}) => ({
  animalId: 'ELEPHANT-001',
  ...NORTH_BUFFER,
  alertType: ConflictAlertType.DANGEROUS_WILDLIFE_ACTIVITY,
  severity: AlertSeverity.HIGH,
  ...overrides
});
const communityInput = (overrides: Record<string, any> = {}) => ({
  ...VILLAGE,
  reportType: ConflictAlertType.CROP_RAID,
  description: 'Hippo pod in the maize field',
  reporterName: 'Mzee Juma',
  severity: AlertSeverity.MEDIUM,
  ...overrides
});
/** Makes the next lookup return `row` and `create`/`update` echo back the written data. */
function existing(row: Record<string, any>) {
  prisma.wildlifeConflictAlert.findFirst.mockResolvedValue(row);
}
function echoCreate() {
  prisma.wildlifeConflictAlert.create.mockImplementation(async (args: any) => ({ id: 'alert-new', responses: [], createdAt: NOW, ...args.data }));
}
function echoUpdate(base: Record<string, any>) {
  prisma.wildlifeConflictAlert.update.mockImplementation(async (args: any) => {
    const { responses, ...data } = args.data;
    const created = responses?.create ? [{ id: 'resp-db-new', ...responses.create }] : [];
    return { ...base, ...Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)), responses: [...base.responses, ...created] };
  });
}
const createData = () => (prisma.wildlifeConflictAlert.create.mock.calls[0][0] as any).data;
const updateArgs = () => prisma.wildlifeConflictAlert.update.mock.calls[0][0] as any;
const auditCalls = () => prisma.conflictAuditEntry.create.mock.calls.map(call => (call[0] as any).data);
const useZones = (zones: RiskZone[]) => CONFIG_RISK_ZONES.splice(0, CONFIG_RISK_ZONES.length, ...zones);
const zone = (overrides: Partial<RiskZone> = {}): RiskZone => ({ id: 'rz-test', name: 'Test Zone', type: 'BUFFER_ZONE', centerLat: 0, centerLon: 0, radiusKm: 10, highRisk: true, ...overrides });
const transitionError = (message: string | RegExp) => expect.objectContaining({ statusCode: 409, code: 'INVALID_STATE_TRANSITION', message: typeof message === 'string' ? message : expect.stringMatching(message) });

let log: ReturnType<typeof jest.spyOn>;

beforeEach(() => {
  resetConflictPrisma();
  jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
  log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  useZones(ORIGINAL_ZONES);
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('createAlert', () => {
  test('persists a new OPEN, SYNCED alert with its location and source, audits CREATE and notifies responders', async () => {
    echoCreate();

    const alert = await conflictAlertService.createAlert({
      source: AlertSource.COLLAR,
      alertType: ConflictAlertType.DANGEROUS_WILDLIFE_ACTIVITY,
      severity: AlertSeverity.CRITICAL,
      latitude: -2.15,
      longitude: 34.82,
      description: 'Elephant at fence',
      animalId: 'ELEPHANT-009',
      sourceEventId: 'evt-9',
      locationSource: LocationSource.GPS
    });

    expect(createData()).toEqual({
      parkId: undefined,
      clientAlertId: undefined,
      sourceEventId: 'evt-9',
      source: AlertSource.COLLAR,
      alertType: ConflictAlertType.DANGEROUS_WILDLIFE_ACTIVITY,
      severity: AlertSeverity.CRITICAL,
      status: AlertStatus.OPEN,
      location: { latitude: -2.15, longitude: 34.82, timestamp: NOW.toISOString(), source: LocationSource.GPS },
      description: 'Elephant at fence',
      animalId: 'ELEPHANT-009',
      reporterName: undefined,
      syncStatus: SyncStatus.SYNCED
    });
    expect(alert).toMatchObject({ _id: 'alert-new', status: AlertStatus.OPEN, source: AlertSource.COLLAR });
    expect(alert).not.toHaveProperty('id');
    expect(auditCalls()).toEqual([expect.objectContaining({ alertId: 'alert-new', action: 'CREATE', performedBy: 'SYSTEM', newValue: alert })]);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('[UC03 NOTIFICATION DISPATCH] Alert alert-new (CRITICAL DANGEROUS_WILDLIFE_ACTIVITY)'));
  });

  test('generates a source event id and fills the collar animal / community reporter defaults', async () => {
    echoCreate();
    const base = { alertType: ConflictAlertType.OTHER, severity: AlertSeverity.LOW, latitude: 1, longitude: 1, description: 'Seen', locationSource: LocationSource.GPS };

    await conflictAlertService.createAlert({ ...base, source: AlertSource.COLLAR });
    await conflictAlertService.createAlert({ ...base, source: AlertSource.COMMUNITY_REPORT });

    const [collarData, communityData] = prisma.wildlifeConflictAlert.create.mock.calls.map(call => (call[0] as any).data);
    expect(collarData.sourceEventId).toMatch(/^src-evt-\d+-[a-z0-9]{1,4}$/);
    expect(collarData).toMatchObject({ animalId: 'ELEPHANT-001', reporterName: undefined });
    expect(communityData).toMatchObject({ animalId: undefined, reporterName: 'Community Member' });
  });

  test('a repeated source event id returns the stored alert without creating, auditing or notifying again', async () => {
    existing(alertRow({ sourceEventId: 'evt-dup' }));

    const alert = await conflictAlertService.createAlert({ source: AlertSource.COLLAR, alertType: ConflictAlertType.OTHER, severity: AlertSeverity.LOW, latitude: 1, longitude: 1, description: 'Dup', sourceEventId: 'evt-dup', locationSource: LocationSource.GPS });

    expect(alert._id).toBe('alert-1');
    expect(prisma.wildlifeConflictAlert.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { sourceEventId: 'evt-dup' } }));
    expect(prisma.wildlifeConflictAlert.create).not.toHaveBeenCalled();
    expect(prisma.conflictAuditEntry.create).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalledWith(expect.stringContaining('NOTIFICATION'));
  });

  test('a repeated client alert id is idempotent', async () => {
    existing(alertRow({ clientAlertId: 'client-a' }));

    const alert = await conflictAlertService.createAlert({ source: AlertSource.COLLAR, alertType: ConflictAlertType.OTHER, severity: AlertSeverity.LOW, latitude: 1, longitude: 1, description: 'Dup', clientAlertId: 'client-a', locationSource: LocationSource.GPS });

    expect(alert._id).toBe('alert-1');
    expect(prisma.wildlifeConflictAlert.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { clientAlertId: 'client-a' } }));
    expect(prisma.wildlifeConflictAlert.create).not.toHaveBeenCalled();
  });

  test('an explicit existing park is stored; an unknown park is rejected before anything is written', async () => {
    echoCreate();
    prisma.park.findUnique.mockResolvedValueOnce({ id: PARK }).mockResolvedValueOnce(null);
    const input = { source: AlertSource.COLLAR, alertType: ConflictAlertType.OTHER, severity: AlertSeverity.LOW, latitude: 1, longitude: 1, description: 'Seen', parkId: PARK, locationSource: LocationSource.GPS };

    await conflictAlertService.createAlert(input);
    expect(createData().parkId).toBe(PARK);

    await expect(conflictAlertService.createAlert(input)).rejects.toBeInstanceOf(ZodError);
    expect(prisma.wildlifeConflictAlert.create).toHaveBeenCalledTimes(1);
  });

  test('a database failure while creating propagates and nothing is audited or notified', async () => {
    prisma.wildlifeConflictAlert.create.mockRejectedValue(new Error('connection reset'));

    await expect(conflictAlertService.createAlert({ source: AlertSource.COLLAR, alertType: ConflictAlertType.OTHER, severity: AlertSeverity.LOW, latitude: 1, longitude: 1, description: 'Seen', locationSource: LocationSource.GPS })).rejects.toThrow('connection reset');
    expect(prisma.conflictAuditEntry.create).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalledWith(expect.stringContaining('NOTIFICATION'));
  });

  test('an audit failure after the alert is persisted is reported to the caller (alert row already written)', async () => {
    echoCreate();
    prisma.conflictAuditEntry.create.mockRejectedValue(new Error('audit table unavailable'));

    await expect(conflictAlertService.createAlert({ source: AlertSource.COLLAR, alertType: ConflictAlertType.OTHER, severity: AlertSeverity.LOW, latitude: 1, longitude: 1, description: 'Seen', locationSource: LocationSource.GPS })).rejects.toThrow('audit table unavailable');
    expect(prisma.wildlifeConflictAlert.create).toHaveBeenCalledTimes(1);
  });
});

describe('notification failure', () => {
  test('a failed responder notification does not lose the persisted alert: it is still returned and the failure is logged', async () => {
    echoCreate();
    log.mockImplementation((message: unknown) => {
      if (String(message).includes('NOTIFICATION DISPATCH')) throw new Error('SMS gateway down');
    });

    const alert = await conflictAlertService.createAlert({ source: AlertSource.COLLAR, alertType: ConflictAlertType.OTHER, severity: AlertSeverity.HIGH, latitude: 1, longitude: 1, description: 'Seen', locationSource: LocationSource.GPS });

    expect(alert).toMatchObject({ _id: 'alert-new', status: AlertStatus.OPEN });
    expect(prisma.wildlifeConflictAlert.create).toHaveBeenCalledTimes(1);
    expect(auditCalls().map(entry => entry.action)).toEqual(['CREATE']);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('alert-new'), expect.objectContaining({ message: 'SMS gateway down' }));
  });

  test('a collar breach still reports alertCreated when notification fails', async () => {
    echoCreate();
    log.mockImplementation((message: unknown) => {
      if (String(message).includes('NOTIFICATION DISPATCH')) throw new Error('push service down');
    });

    const result = await conflictAlertService.simulateCollarEvent(collarInput());

    expect(result).toMatchObject({ alertCreated: true, _id: 'alert-new' });
  });
});

describe('GPS collar alert generation against the configured risk zones', () => {
  test('a reading inside a risk zone creates an OPEN COLLAR alert with the animal, location and zone', async () => {
    echoCreate();

    const result = await conflictAlertService.simulateCollarEvent(collarInput());

    expect(result).toMatchObject({ alertCreated: true, telemetrySaved: true, riskZone: 'Northern Community Buffer Zone', distanceKm: 0, _id: 'alert-new', status: AlertStatus.OPEN });
    expect(createData()).toMatchObject({
      source: AlertSource.COLLAR,
      status: AlertStatus.OPEN,
      animalId: 'ELEPHANT-001',
      severity: AlertSeverity.HIGH,
      sourceEventId: 'collar-evt-ELEPHANT-001--2.1523-34.8214',
      location: { latitude: -2.1523, longitude: 34.8214, timestamp: NOW.toISOString(), source: LocationSource.GPS },
      description: 'Collar breach alert for tracked animal ELEPHANT-001 inside Northern Community Buffer Zone (0.00 km from zone core).'
    });
    expect(auditCalls().map(entry => entry.action)).toEqual(['CREATE']);
  });

  test('a valid reading outside every risk zone stays telemetry only: no alert is looked up, created, audited or notified', async () => {
    const result = await conflictAlertService.simulateCollarEvent(collarInput(OUTSIDE));

    expect(result).toEqual({
      alertCreated: false,
      telemetrySaved: true,
      animalId: 'ELEPHANT-001',
      location: { latitude: -2.3, longitude: 34.8, timestamp: NOW },
      message: 'Collar reading for tracked animal ELEPHANT-001 recorded successfully. Animal is outside configured high-risk zones; no alert generated.'
    });
    expect(prisma.wildlifeConflictAlert.findFirst).not.toHaveBeenCalled();
    expect(prisma.wildlifeConflictAlert.create).not.toHaveBeenCalled();
    expect(prisma.conflictAuditEntry.create).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalledWith(expect.stringContaining('NOTIFICATION'));
  });

  test('coordinates 0,0 are far from the configured zones and create no alert', async () => {
    const result = await conflictAlertService.simulateCollarEvent(collarInput({ latitude: 0, longitude: 0 }));
    expect(result.alertCreated).toBe(false);
    expect(prisma.wildlifeConflictAlert.create).not.toHaveBeenCalled();
  });

  test('when zones overlap the first configured zone is reported (village centre lies in the northern buffer)', async () => {
    echoCreate();
    const result = await conflictAlertService.simulateCollarEvent(collarInput(VILLAGE));
    expect(result.riskZone).toBe('Northern Community Buffer Zone');
    expect(result.distanceKm).toBeGreaterThan(4);
    expect(result.distanceKm).toBeLessThan(5);
  });

  test('a point only inside the southern livestock zone is attributed to that zone', async () => {
    echoCreate();
    const result = await conflictAlertService.simulateCollarEvent(collarInput({ latitude: -2.11, longitude: 34.77 }));
    expect(result).toMatchObject({ alertCreated: true, riskZone: 'Southern Livestock Boma Fence' });
  });

  test('an explicit upstream event id is used and an explicit park gets its own generated key', async () => {
    echoCreate();
    prisma.park.findUnique.mockResolvedValue({ id: PARK });

    await conflictAlertService.simulateCollarEvent(collarInput({ sourceEventId: 'gateway-evt-1' }));
    await conflictAlertService.simulateCollarEvent(collarInput({ parkId: PARK }));

    const [first, second] = prisma.wildlifeConflictAlert.create.mock.calls.map(call => (call[0] as any).data);
    expect(first.sourceEventId).toBe('gateway-evt-1');
    expect(second).toMatchObject({ parkId: PARK, sourceEventId: `collar-evt-${PARK}-ELEPHANT-001--2.1523-34.8214` });
  });

  test('a repeated breach for the same animal and position returns the existing alert (idempotent)', async () => {
    existing(alertRow({ sourceEventId: 'collar-evt-ELEPHANT-001--2.1523-34.8214' }));

    const result = await conflictAlertService.simulateCollarEvent(collarInput());

    expect(result).toMatchObject({ alertCreated: true, _id: 'alert-1' });
    expect(prisma.wildlifeConflictAlert.create).not.toHaveBeenCalled();
  });

  test('alert creation failure inside a zone propagates instead of reporting a created alert', async () => {
    prisma.wildlifeConflictAlert.create.mockRejectedValue(new Error('write failed'));
    await expect(conflictAlertService.simulateCollarEvent(collarInput())).rejects.toThrow('write failed');
  });

  test('a database read failure during the idempotency check propagates and nothing is created', async () => {
    prisma.wildlifeConflictAlert.findFirst.mockRejectedValue(new Error('read timeout'));
    await expect(conflictAlertService.simulateCollarEvent(collarInput())).rejects.toThrow('read timeout');
    expect(prisma.wildlifeConflictAlert.create).not.toHaveBeenCalled();
  });
});

describe('risk-zone spatial logic (deterministic test zones)', () => {
  test.each([
    [0, AlertSeverity.CRITICAL],
    [0.02, AlertSeverity.CRITICAL], // 2.22 km of 10 km
    [0.04, AlertSeverity.HIGH], // 4.45 km
    [0.07, AlertSeverity.MEDIUM], // 7.78 km
    [0.085, AlertSeverity.LOW] // 9.45 km
  ])('without an explicit severity, a point %d° from the centre is rated by proximity as %s', async (longitude, severity) => {
    useZones([zone()]);
    echoCreate();

    await conflictAlertService.simulateCollarEvent(collarInput({ latitude: 0, longitude, severity: undefined }) as any);

    expect(createData().severity).toBe(severity);
  });

  test('an explicit severity overrides the proximity rating', async () => {
    useZones([zone()]);
    echoCreate();
    await conflictAlertService.simulateCollarEvent(collarInput({ latitude: 0, longitude: 0, severity: AlertSeverity.LOW }));
    expect(createData().severity).toBe(AlertSeverity.LOW);
  });

  test('near the boundary: 4.99 km inside a 5 km zone alerts, 5.01 km outside does not', async () => {
    useZones([zone({ radiusKm: 5 })]);
    echoCreate();

    expect((await conflictAlertService.simulateCollarEvent(collarInput({ latitude: 0, longitude: 0.0449 }))).alertCreated).toBe(true);
    expect((await conflictAlertService.simulateCollarEvent(collarInput({ latitude: 0, longitude: 0.0451 }))).alertCreated).toBe(false);
    expect(prisma.wildlifeConflictAlert.create).toHaveBeenCalledTimes(1);
  });

  test('the boundary is inclusive: distance exactly equal to the radius (0 km of a 0 km zone) is inside', async () => {
    useZones([zone({ radiusKm: 0 })]);
    echoCreate();
    const result = await conflictAlertService.simulateCollarEvent(collarInput({ latitude: 0, longitude: 0 }));
    expect(result).toMatchObject({ alertCreated: true, riskZone: 'Test Zone', distanceKm: 0 });
  });

  test('a zone at 0,0 makes 0,0 a valid in-zone position', async () => {
    useZones([zone()]);
    echoCreate();
    expect((await conflictAlertService.simulateCollarEvent(collarInput({ latitude: 0, longitude: 0 }))).alertCreated).toBe(true);
  });

  test('with no zones configured nothing ever alerts', async () => {
    useZones([]);
    expect((await conflictAlertService.simulateCollarEvent(collarInput())).alertCreated).toBe(false);
    expect(prisma.wildlifeConflictAlert.create).not.toHaveBeenCalled();
  });

  test.each([
    ['a NaN radius', { radiusKm: Number.NaN }],
    ['a NaN centre latitude', { centerLat: Number.NaN }],
    ['an undefined centre longitude', { centerLon: undefined as unknown as number }]
  ])('malformed zone data (%s) never produces a false positive alert', async (_label, overrides) => {
    useZones([zone(overrides)]);
    expect((await conflictAlertService.simulateCollarEvent(collarInput({ latitude: 0, longitude: 0 }))).alertCreated).toBe(false);
    expect(prisma.wildlifeConflictAlert.create).not.toHaveBeenCalled();
  });

  test('malformed reading coordinates that bypass validation (NaN) never produce an alert', async () => {
    expect((await conflictAlertService.simulateCollarEvent(collarInput({ latitude: Number.NaN, longitude: Number.NaN }))).alertCreated).toBe(false);
    expect(prisma.wildlifeConflictAlert.create).not.toHaveBeenCalled();
  });

  test('if the risk-zone calculation throws, the error propagates and no alert is created', async () => {
    const broken = zone();
    Object.defineProperty(broken, 'centerLat', { get: () => { throw new Error('zone config unreadable'); } });
    useZones([broken]);

    await expect(conflictAlertService.simulateCollarEvent(collarInput())).rejects.toThrow('zone config unreadable');
    expect(prisma.wildlifeConflictAlert.create).not.toHaveBeenCalled();
  });

  test('of several matching zones the first in configuration order wins', async () => {
    useZones([zone({ name: 'First', radiusKm: 50 }), zone({ name: 'Second', radiusKm: 100 })]);
    echoCreate();
    expect((await conflictAlertService.simulateCollarEvent(collarInput({ latitude: 0, longitude: 0.1 }))).riskZone).toBe('First');
  });
});

describe('community report workflow', () => {
  test('creates an OPEN COMMUNITY_REPORT alert with manual location, description and reporter', async () => {
    echoCreate();

    const alert = await conflictAlertService.submitCommunityReport(communityInput({ sourceEventId: 'comm-1' }));

    expect(createData()).toMatchObject({
      sourceEventId: 'comm-1',
      source: AlertSource.COMMUNITY_REPORT,
      alertType: ConflictAlertType.CROP_RAID,
      severity: AlertSeverity.MEDIUM,
      status: AlertStatus.OPEN,
      description: 'Hippo pod in the maize field',
      reporterName: 'Mzee Juma',
      location: { latitude: -2.189, longitude: 34.841, timestamp: NOW.toISOString(), source: LocationSource.MANUAL }
    });
    expect(alert.status).toBe(AlertStatus.OPEN);
    expect(auditCalls().map(entry => entry.action)).toEqual(['CREATE']);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('NOTIFICATION DISPATCH'));
  });

  test('community reports create alerts regardless of risk zones (0,0 accepted) and get a generated event id', async () => {
    echoCreate();
    await conflictAlertService.submitCommunityReport(communityInput({ latitude: 0, longitude: 0 }));
    expect(createData()).toMatchObject({ location: expect.objectContaining({ latitude: 0, longitude: 0 }), sourceEventId: expect.stringMatching(/^comm-rpt-\d+-/) });
  });

  test('an absent reporter name is stored as "Community Member"', async () => {
    echoCreate();
    await conflictAlertService.submitCommunityReport(communityInput({ reporterName: undefined }) as any);
    expect(createData().reporterName).toBe('Community Member');
  });

  test.each([
    [ConflictAlertType.DANGEROUS_WILDLIFE_ACTIVITY, AlertSeverity.HIGH],
    [ConflictAlertType.LIVESTOCK_THREAT, AlertSeverity.HIGH],
    [ConflictAlertType.CROP_RAID, AlertSeverity.MEDIUM],
    [ConflictAlertType.WILDLIFE_NEAR_COMMUNITY, AlertSeverity.LOW],
    [ConflictAlertType.OTHER, AlertSeverity.LOW]
  ])('without a severity, a %s report is rated %s', async (reportType, severity) => {
    echoCreate();
    await conflictAlertService.submitCommunityReport(communityInput({ reportType, severity: undefined }) as any);
    expect(createData().severity).toBe(severity);
  });

  test('a database failure is reported and no audit entry is written', async () => {
    prisma.wildlifeConflictAlert.create.mockRejectedValue(new Error('db down'));
    await expect(conflictAlertService.submitCommunityReport(communityInput())).rejects.toThrow('db down');
    expect(prisma.conflictAuditEntry.create).not.toHaveBeenCalled();
  });
});

describe('alert retrieval', () => {
  test('without filters, at most 5 active alerts plus all historical alerts are merged newest first', async () => {
    const older = alertRow({ id: 'a-old', createdAt: new Date('2026-10-01T00:00:00Z') });
    const newer = alertRow({ id: 'a-new', createdAt: new Date('2026-10-09T00:00:00Z') });
    const resolved = alertRow({ id: 'a-res', status: AlertStatus.RESOLVED, createdAt: new Date('2026-10-05T00:00:00Z') });
    prisma.wildlifeConflictAlert.findMany.mockResolvedValueOnce([newer, older]).mockResolvedValueOnce([resolved]);

    const alerts = await conflictAlertService.getAlerts();

    expect(alerts.map(a => a._id)).toEqual(['a-new', 'a-res', 'a-old']);
    const [active, historical] = prisma.wildlifeConflictAlert.findMany.mock.calls.map(call => call[0] as any);
    expect(active).toMatchObject({ where: { isDeleted: false, status: { in: [AlertStatus.OPEN, AlertStatus.ACKNOWLEDGED, AlertStatus.RESPONDING] } }, take: 5, orderBy: { createdAt: 'desc' } });
    expect(historical.where.status).toEqual({ in: [AlertStatus.RESOLVED, AlertStatus.CANCELLED] });
    expect(historical.take).toBeUndefined();
  });

  test('an active status filter queries only active alerts with that status', async () => {
    await conflictAlertService.getAlerts({ status: AlertStatus.ACKNOWLEDGED, severity: AlertSeverity.HIGH, alertType: ConflictAlertType.CROP_RAID });
    expect(prisma.wildlifeConflictAlert.findMany).toHaveBeenCalledTimes(1);
    expect((prisma.wildlifeConflictAlert.findMany.mock.calls[0][0] as any).where).toEqual({ severity: AlertSeverity.HIGH, alertType: ConflictAlertType.CROP_RAID, isDeleted: false, status: AlertStatus.ACKNOWLEDGED });
  });

  test('a historical status filter queries only historical alerts; includeDeleted drops the deleted filter', async () => {
    await conflictAlertService.getAlerts({ status: AlertStatus.RESOLVED, includeDeleted: true });
    expect(prisma.wildlifeConflictAlert.findMany).toHaveBeenCalledTimes(1);
    expect((prisma.wildlifeConflictAlert.findMany.mock.calls[0][0] as any).where).toEqual({ severity: undefined, alertType: undefined, isDeleted: undefined, status: AlertStatus.RESOLVED });
  });

  test('no matching alerts returns an empty list', async () => {
    expect(await conflictAlertService.getAlerts()).toEqual([]);
  });

  test('an alert is found by server id or client id, excluding deleted alerts unless requested', async () => {
    existing(alertRow());
    expect((await conflictAlertService.getAlertById('alert-1'))._id).toBe('alert-1');
    expect((prisma.wildlifeConflictAlert.findFirst.mock.calls[0][0] as any).where).toEqual({ OR: [{ id: 'alert-1' }, { clientAlertId: 'alert-1' }], isDeleted: false });

    await conflictAlertService.getAlertById('alert-1', true);
    expect((prisma.wildlifeConflictAlert.findFirst.mock.calls[1][0] as any).where).toEqual({ OR: [{ id: 'alert-1' }, { clientAlertId: 'alert-1' }] });
  });

  test('an unknown alert is reported as not found', async () => {
    await expect(conflictAlertService.getAlertById('missing')).rejects.toThrow('Wildlife conflict alert not found.');
  });
});

describe('acknowledge', () => {
  test('an OPEN alert becomes ACKNOWLEDGED with the responder and time stored and an audit entry', async () => {
    const row = alertRow();
    existing(row);
    echoUpdate(row);

    const alert = await conflictAlertService.acknowledgeAlert(RANGER, NAME, 'alert-1', 'ack-1');

    expect(updateArgs()).toMatchObject({ where: { id: 'alert-1' }, data: { status: AlertStatus.ACKNOWLEDGED, acknowledgedBy: RANGER, acknowledgedName: NAME, acknowledgedAt: NOW, clientAcknowledgementId: 'ack-1' } });
    expect(alert).toMatchObject({ _id: 'alert-1', status: AlertStatus.ACKNOWLEDGED, acknowledgedBy: RANGER });
    expect(auditCalls()).toEqual([expect.objectContaining({ alertId: 'alert-1', action: 'ACKNOWLEDGE', performedBy: RANGER, performedName: NAME, oldValue: { status: AlertStatus.OPEN }, newValue: { status: AlertStatus.ACKNOWLEDGED } })]);
  });

  test('a replayed acknowledgement with the same client id returns the alert unchanged (offline retry)', async () => {
    existing(alertRow({ status: AlertStatus.ACKNOWLEDGED, clientAcknowledgementId: 'ack-1' }));
    const alert = await conflictAlertService.acknowledgeAlert(RANGER, NAME, 'alert-1', 'ack-1');
    expect(alert.status).toBe(AlertStatus.ACKNOWLEDGED);
    expect(prisma.wildlifeConflictAlert.update).not.toHaveBeenCalled();
    expect(prisma.conflictAuditEntry.create).not.toHaveBeenCalled();
  });

  test('an unknown alert cannot be acknowledged', async () => {
    await expect(conflictAlertService.acknowledgeAlert(RANGER, NAME, 'missing')).rejects.toThrow('Wildlife conflict alert not found.');
  });

  test('a RESOLVED alert cannot be acknowledged', async () => {
    existing(alertRow({ status: AlertStatus.RESOLVED }));
    await expect(conflictAlertService.acknowledgeAlert(RANGER, NAME, 'alert-1')).rejects.toEqual(transitionError('Resolved alert cannot be acknowledged.'));
    expect(prisma.wildlifeConflictAlert.update).not.toHaveBeenCalled();
  });

  test.each([AlertStatus.ACKNOWLEDGED, AlertStatus.RESPONDING, AlertStatus.CANCELLED])('a %s alert cannot be acknowledged again', async status => {
    existing(alertRow({ status, clientAcknowledgementId: 'ack-old' }));
    await expect(conflictAlertService.acknowledgeAlert(RANGER, NAME, 'alert-1', 'ack-new')).rejects.toEqual(transitionError(`Invalid state transition: ${status} alert cannot be acknowledged.`));
    expect(prisma.wildlifeConflictAlert.update).not.toHaveBeenCalled();
  });
});

describe('respond', () => {
  test('a response on an ACKNOWLEDGED alert is stored with responder, action, notes, outcome and time; status becomes RESPONDING', async () => {
    const row = alertRow({ status: AlertStatus.ACKNOWLEDGED });
    existing(row);
    echoUpdate(row);

    const alert = await conflictAlertService.addResponse(RANGER, NAME, 'alert-1', { action: ResponseAction.WARNED_COMMUNITY, notes: 'Warned the village', outcome: 'Villagers alerted', clientResponseId: 'client-r1', markResolved: false });

    const { data } = updateArgs();
    expect(data).toMatchObject({ status: AlertStatus.RESPONDING, resolvedBy: undefined, resolvedAt: undefined, resolutionNotes: undefined });
    expect(data.responses.create).toEqual({
      responseId: expect.stringMatching(/^resp-\d+-/),
      clientResponseId: 'client-r1',
      responderId: RANGER,
      responderName: NAME,
      action: ResponseAction.WARNED_COMMUNITY,
      notes: 'Warned the village',
      respondedAt: NOW,
      outcome: 'Villagers alerted'
    });
    expect(alert.status).toBe(AlertStatus.RESPONDING);
    expect(auditCalls()).toEqual([expect.objectContaining({ action: 'ADD_RESPONSE', responseId: 'resp-db-new', performedBy: RANGER })]);
  });

  test('additional responses are allowed while RESPONDING', async () => {
    const row = alertRow({ status: AlertStatus.RESPONDING, responses: [responseRow()] });
    existing(row);
    echoUpdate(row);
    const alert = await conflictAlertService.addResponse(RANGER, NAME, 'alert-1', { action: ResponseAction.MONITORED_WILDLIFE, notes: 'Still monitoring', markResolved: false });
    expect(alert.responses).toHaveLength(2);
    expect(alert.status).toBe(AlertStatus.RESPONDING);
  });

  test('markResolved records the response and resolves the alert in one step, auditing both', async () => {
    const row = alertRow({ status: AlertStatus.RESPONDING });
    existing(row);
    echoUpdate(row);

    const alert = await conflictAlertService.addResponse(RANGER, NAME, 'alert-1', { action: ResponseAction.REDIRECTED_WILDLIFE, notes: 'Herd pushed back', markResolved: true, resolutionNotes: 'Herd returned to the core area' });

    expect(updateArgs().data).toMatchObject({ status: AlertStatus.RESOLVED, resolvedBy: RANGER, resolvedName: NAME, resolvedAt: NOW, resolutionNotes: 'Herd returned to the core area' });
    expect(alert.status).toBe(AlertStatus.RESOLVED);
    expect(auditCalls().map(entry => entry.action)).toEqual(['ADD_RESPONSE', 'RESOLVE']);
    expect(auditCalls()[1]).toMatchObject({ oldValue: { status: AlertStatus.RESPONDING }, newValue: { status: AlertStatus.RESOLVED }, reason: 'Herd returned to the core area' });
  });

  test('markResolved without resolution notes stores the response notes as the resolution', async () => {
    const row = alertRow({ status: AlertStatus.ACKNOWLEDGED });
    existing(row);
    echoUpdate(row);
    await conflictAlertService.addResponse(RANGER, NAME, 'alert-1', { action: ResponseAction.SECURED_AREA, notes: 'Area secured', markResolved: true });
    expect(updateArgs().data.resolutionNotes).toBe('Area secured');
  });

  test('a replayed response with an existing client response id is not stored twice', async () => {
    existing(alertRow({ status: AlertStatus.RESPONDING, responses: [responseRow()] }));
    const alert = await conflictAlertService.addResponse(RANGER, NAME, 'alert-1', { action: ResponseAction.INVESTIGATED_AREA, notes: 'Investigated the fence line', clientResponseId: 'client-resp-1', markResolved: false });
    expect(alert.responses).toHaveLength(1);
    expect(prisma.wildlifeConflictAlert.update).not.toHaveBeenCalled();
  });

  test('an OPEN alert must be acknowledged before a response is recorded', async () => {
    existing(alertRow());
    await expect(conflictAlertService.addResponse(RANGER, NAME, 'alert-1', { action: ResponseAction.OTHER, notes: 'Too early', markResolved: false })).rejects.toEqual(transitionError('Invalid state transition: Alert must be acknowledged before recording response.'));
  });

  test('a RESOLVED alert cannot accept new responses', async () => {
    existing(alertRow({ status: AlertStatus.RESOLVED }));
    await expect(conflictAlertService.addResponse(RANGER, NAME, 'alert-1', { action: ResponseAction.OTHER, notes: 'Too late', markResolved: false })).rejects.toEqual(transitionError('Invalid state transition: Resolved alert cannot accept new responses.'));
  });

  test('a CANCELLED alert cannot accept responses', async () => {
    existing(alertRow({ status: AlertStatus.CANCELLED }));
    await expect(conflictAlertService.addResponse(RANGER, NAME, 'alert-1', { action: ResponseAction.OTHER, notes: 'Cancelled', markResolved: false })).rejects.toEqual(transitionError(/must be acknowledged/));
    expect(prisma.wildlifeConflictAlert.update).not.toHaveBeenCalled();
  });

  test('an unknown alert or a failed write is reported without an audit entry', async () => {
    await expect(conflictAlertService.addResponse(RANGER, NAME, 'missing', { action: ResponseAction.OTHER, notes: 'x y z', markResolved: false })).rejects.toThrow('Wildlife conflict alert not found.');
    existing(alertRow({ status: AlertStatus.ACKNOWLEDGED }));
    prisma.wildlifeConflictAlert.update.mockRejectedValue(new Error('write failed'));
    await expect(conflictAlertService.addResponse(RANGER, NAME, 'alert-1', { action: ResponseAction.OTHER, notes: 'x y z', markResolved: false })).rejects.toThrow('write failed');
    expect(prisma.conflictAuditEntry.create).not.toHaveBeenCalled();
  });
});

describe('resolve', () => {
  test('a RESPONDING alert is RESOLVED with resolver, time, notes and client action id stored and audited', async () => {
    const row = alertRow({ status: AlertStatus.RESPONDING, responses: [responseRow()] });
    existing(row);
    echoUpdate(row);

    const alert = await conflictAlertService.resolveAlert(RANGER, NAME, 'alert-1', { resolutionNotes: 'Elephant returned to the reserve', clientActionId: 'res-1' });

    expect(updateArgs().data).toEqual({ status: AlertStatus.RESOLVED, resolvedBy: RANGER, clientResolutionId: 'res-1', resolvedName: NAME, resolvedAt: NOW, resolutionNotes: 'Elephant returned to the reserve' });
    expect(alert).toMatchObject({ status: AlertStatus.RESOLVED, resolvedBy: RANGER, responses: [expect.objectContaining({ responseId: 'resp-1' })] });
    expect(auditCalls()).toEqual([expect.objectContaining({ action: 'RESOLVE', reason: 'Elephant returned to the reserve', oldValue: { status: AlertStatus.RESPONDING } })]);
  });

  test('a replayed resolution with the same client action id is idempotent', async () => {
    existing(alertRow({ status: AlertStatus.RESOLVED, clientResolutionId: 'res-1' }));
    expect((await conflictAlertService.resolveAlert(RANGER, NAME, 'alert-1', { resolutionNotes: 'Done', clientActionId: 'res-1' })).status).toBe(AlertStatus.RESOLVED);
    expect(prisma.wildlifeConflictAlert.update).not.toHaveBeenCalled();
  });

  test.each([AlertStatus.OPEN, AlertStatus.ACKNOWLEDGED, AlertStatus.CANCELLED])('a %s alert cannot be resolved before a response is recorded', async status => {
    existing(alertRow({ status }));
    await expect(conflictAlertService.resolveAlert(RANGER, NAME, 'alert-1', { resolutionNotes: 'Skip' })).rejects.toEqual(transitionError(`Invalid state transition: ${status} alert cannot be resolved.`));
    expect(prisma.wildlifeConflictAlert.update).not.toHaveBeenCalled();
  });

  test('an already RESOLVED alert cannot be resolved again', async () => {
    existing(alertRow({ status: AlertStatus.RESOLVED, clientResolutionId: 'res-1' }));
    await expect(conflictAlertService.resolveAlert(RANGER, NAME, 'alert-1', { resolutionNotes: 'Again', clientActionId: 'res-2' })).rejects.toEqual(transitionError('Invalid state transition: Alert is already resolved.'));
  });

  test('an unknown alert cannot be resolved', async () => {
    await expect(conflictAlertService.resolveAlert(RANGER, NAME, 'missing', { resolutionNotes: 'Done' })).rejects.toThrow('Wildlife conflict alert not found.');
  });
});

describe('update, cancel and delete', () => {
  test('editing description and severity keeps the stored location and audits the old values', async () => {
    const row = alertRow();
    existing(row);
    echoUpdate(row);

    await conflictAlertService.updateAlert(RANGER, NAME, 'alert-1', { description: 'Two elephants', severity: AlertSeverity.CRITICAL });

    expect(updateArgs().data).toMatchObject({ description: 'Two elephants', severity: AlertSeverity.CRITICAL, location: undefined });
    expect(auditCalls()[0]).toMatchObject({ action: 'UPDATE', oldValue: expect.objectContaining({ description: 'Elephant at the buffer fence', severity: AlertSeverity.HIGH }), newValue: { description: 'Two elephants', severity: AlertSeverity.CRITICAL } });
  });

  test('editing one coordinate merges it into the existing location', async () => {
    const row = alertRow();
    existing(row);
    echoUpdate(row);
    await conflictAlertService.updateAlert(RANGER, NAME, 'alert-1', { latitude: -2.2 });
    expect(updateArgs().data.location).toEqual({ ...row.location, latitude: -2.2 });

    prisma.wildlifeConflictAlert.update.mockClear();
    await conflictAlertService.updateAlert(RANGER, NAME, 'alert-1', { longitude: 34.9, locationSource: LocationSource.MANUAL });
    expect(updateArgs().data.location).toEqual({ ...row.location, longitude: 34.9, source: LocationSource.MANUAL });
  });

  test.each([AlertStatus.RESOLVED, AlertStatus.CANCELLED])('a %s alert is read-only', async status => {
    existing(alertRow({ status }));
    await expect(conflictAlertService.updateAlert(RANGER, NAME, 'alert-1', { description: 'Late edit' })).rejects.toThrow(`Unauthorized: ${status} alerts are read-only.`);
    expect(prisma.wildlifeConflictAlert.update).not.toHaveBeenCalled();
  });

  test('cancelling an active alert stores CANCELLED and audits the reason', async () => {
    for (const status of [AlertStatus.OPEN, AlertStatus.ACKNOWLEDGED, AlertStatus.RESPONDING]) {
      resetConflictPrisma();
      const row = alertRow({ status });
      existing(row);
      echoUpdate(row);
      expect((await conflictAlertService.cancelAlert(RANGER, NAME, 'alert-1', 'False alarm')).status).toBe(AlertStatus.CANCELLED);
      expect(auditCalls()[0]).toMatchObject({ action: 'CANCEL', reason: 'False alarm', oldValue: { status }, newValue: { status: AlertStatus.CANCELLED } });
    }
  });

  test.each([AlertStatus.RESOLVED, AlertStatus.CANCELLED])('a %s alert cannot be cancelled', async status => {
    existing(alertRow({ status }));
    await expect(conflictAlertService.cancelAlert(RANGER, NAME, 'alert-1', 'Too late')).rejects.toEqual(transitionError(`Invalid state transition: ${status} alert cannot be cancelled.`));
  });

  test('deleting soft-deletes with the ranger, time and reason (default reason when none given)', async () => {
    const row = alertRow();
    existing(row);
    echoUpdate(row);

    await conflictAlertService.deleteAlert(RANGER, NAME, 'alert-1', 'Duplicate report');
    expect(updateArgs().data).toEqual({ isDeleted: true, deletedAt: NOW, deletedBy: RANGER, deletionReason: 'Duplicate report' });
    expect(auditCalls()[0]).toMatchObject({ action: 'DELETE', reason: 'Duplicate report', newValue: { isDeleted: true } });

    prisma.wildlifeConflictAlert.update.mockClear();
    await conflictAlertService.deleteAlert(RANGER, NAME, 'alert-1');
    expect(updateArgs().data.deletionReason).toBe('Deleted by ranger');
  });

  test('update, cancel and delete of an unknown alert are reported as not found', async () => {
    await expect(conflictAlertService.updateAlert(RANGER, NAME, 'x', { description: 'abc' })).rejects.toThrow('not found');
    await expect(conflictAlertService.cancelAlert(RANGER, NAME, 'x', 'reason')).rejects.toThrow('not found');
    await expect(conflictAlertService.deleteAlert(RANGER, NAME, 'x')).rejects.toThrow('not found');
  });
});

describe('responses and history', () => {
  test('getResponses returns the alert responses; unknown alert is not found', async () => {
    existing(alertRow({ responses: [responseRow()] }));
    expect(await conflictAlertService.getResponses('alert-1')).toEqual([responseRow()]);
    prisma.wildlifeConflictAlert.findFirst.mockResolvedValue(null);
    await expect(conflictAlertService.getResponses('missing')).rejects.toThrow('not found');
  });

  test('the original responder can edit a response; the change is audited and the refreshed alert returned', async () => {
    existing(alertRow({ status: AlertStatus.RESPONDING, responses: [responseRow()] }));
    prisma.conflictResponse.findFirst.mockResolvedValue(responseRow());
    prisma.conflictResponse.update.mockResolvedValue({});

    const alert = await conflictAlertService.updateResponse(RANGER, NAME, 'alert-1', 'resp-1', { notes: 'Edited notes' });

    expect(prisma.conflictResponse.findFirst).toHaveBeenCalledWith({ where: { alertId: 'alert-1', isDeleted: false, OR: [{ id: 'resp-1' }, { responseId: 'resp-1' }] } });
    expect(prisma.conflictResponse.update).toHaveBeenCalledWith({ where: { id: 'resp-db-1' }, data: { action: undefined, notes: 'Edited notes', outcome: undefined } });
    expect(auditCalls()[0]).toMatchObject({ action: 'UPDATE_RESPONSE', responseId: 'resp-db-1', oldValue: responseRow(), newValue: { notes: 'Edited notes' } });
    expect(alert._id).toBe('alert-1');
  });

  test('the original responder can soft-delete a response', async () => {
    existing(alertRow({ status: AlertStatus.RESPONDING, responses: [responseRow()] }));
    prisma.conflictResponse.findFirst.mockResolvedValue(responseRow());
    prisma.conflictResponse.update.mockResolvedValue({});

    await conflictAlertService.deleteResponse(RANGER, NAME, 'alert-1', 'resp-1', 'Entered twice');

    expect(prisma.conflictResponse.update).toHaveBeenCalledWith({ where: { id: 'resp-db-1' }, data: { isDeleted: true, deletedAt: NOW, deletedBy: RANGER, deletionReason: 'Entered twice' } });
    expect(auditCalls()[0]).toMatchObject({ action: 'DELETE_RESPONSE', reason: 'Entered twice' });
  });

  test('another ranger may not edit or delete the response', async () => {
    existing(alertRow({ status: AlertStatus.RESPONDING }));
    prisma.conflictResponse.findFirst.mockResolvedValue(responseRow({ responderId: 'R-OTHER' }));
    await expect(conflictAlertService.updateResponse(RANGER, NAME, 'alert-1', 'resp-1', { notes: 'Hijack' })).rejects.toThrow('Unauthorized: only the original responder can update this response.');
    await expect(conflictAlertService.deleteResponse(RANGER, NAME, 'alert-1', 'resp-1')).rejects.toThrow('Unauthorized: only the original responder can delete this response.');
    expect(prisma.conflictResponse.update).not.toHaveBeenCalled();
  });

  test('unknown responses, unknown alerts and terminal alerts are rejected', async () => {
    existing(alertRow({ status: AlertStatus.RESPONDING }));
    prisma.conflictResponse.findFirst.mockResolvedValue(null);
    await expect(conflictAlertService.updateResponse(RANGER, NAME, 'alert-1', 'nope', { notes: 'abc' })).rejects.toThrow('Conflict response not found.');
    await expect(conflictAlertService.deleteResponse(RANGER, NAME, 'alert-1', 'nope')).rejects.toThrow('Conflict response not found.');

    existing(alertRow({ status: AlertStatus.RESOLVED }));
    await expect(conflictAlertService.updateResponse(RANGER, NAME, 'alert-1', 'resp-1', { notes: 'abc' })).rejects.toThrow('Unauthorized: RESOLVED alerts are read-only.');
    await expect(conflictAlertService.deleteResponse(RANGER, NAME, 'alert-1', 'resp-1')).rejects.toThrow('Unauthorized: RESOLVED alerts are read-only.');

    prisma.wildlifeConflictAlert.findFirst.mockResolvedValue(null);
    await expect(conflictAlertService.updateResponse(RANGER, NAME, 'x', 'resp-1', { notes: 'abc' })).rejects.toThrow('not found');
    await expect(conflictAlertService.deleteResponse(RANGER, NAME, 'x', 'resp-1')).rejects.toThrow('not found');
  });

  test('history includes deleted alerts and is ordered oldest first', async () => {
    existing(alertRow({ isDeleted: true }));
    prisma.conflictAuditEntry.findMany.mockResolvedValue([{ action: 'CREATE' }, { action: 'DELETE' }]);

    expect(await conflictAlertService.getHistory('alert-1')).toEqual([{ action: 'CREATE' }, { action: 'DELETE' }]);
    expect((prisma.wildlifeConflictAlert.findFirst.mock.calls[0][0] as any).where).not.toHaveProperty('isDeleted');
    expect(prisma.conflictAuditEntry.findMany).toHaveBeenCalledWith({ where: { alertId: 'alert-1' }, orderBy: { timestamp: 'asc' } });

    prisma.wildlifeConflictAlert.findFirst.mockResolvedValue(null);
    await expect(conflictAlertService.getHistory('missing')).rejects.toThrow('not found');
  });
});
