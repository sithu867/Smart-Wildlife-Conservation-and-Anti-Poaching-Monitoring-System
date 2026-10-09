import {
  acknowledgeAlertSchema,
  addResponseSchema,
  cancelAlertSchema,
  communityReportSchema,
  createAlertSchema,
  deleteSchema,
  locationSchema,
  resolveAlertSchema,
  simulateCollarSchema,
  updateAlertSchema,
  updateResponseSchema
} from '../src/modules/conflict-alerts/validation.js';
import { AlertSeverity, AlertSource, ConflictAlertType, LocationSource, ResponseAction } from '../src/types/enums.js';

// UC-C request validation: the zod schemas used by the conflict-alert controller, tested directly.
const PARK = 'c67a000000000000000000001';
const collar = (overrides: Record<string, unknown> = {}) => ({ animalId: 'ELEPHANT-001', latitude: -2.1523, longitude: 34.8214, ...overrides });
const community = (overrides: Record<string, unknown> = {}) => ({
  latitude: -2.189,
  longitude: 34.841,
  reportType: ConflictAlertType.CROP_RAID,
  description: 'Hippo pod feeding in maize field',
  ...overrides
});
const direct = (overrides: Record<string, unknown> = {}) => ({
  source: AlertSource.COLLAR,
  alertType: ConflictAlertType.DANGEROUS_WILDLIFE_ACTIVITY,
  severity: AlertSeverity.HIGH,
  latitude: -2.1523,
  longitude: 34.8214,
  description: 'Elephant at fence',
  ...overrides
});
const messages = (result: { success: boolean; error?: { issues: { path: (string | number)[]; message: string }[] } }) =>
  result.success ? [] : result.error!.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`);

describe('collar reading (simulate-collar) validation', () => {
  test('a minimal reading is accepted and defaults the alert type to DANGEROUS_WILDLIFE_ACTIVITY and severity to HIGH', () => {
    expect(simulateCollarSchema.parse(collar())).toEqual({
      ...collar(),
      alertType: ConflictAlertType.DANGEROUS_WILDLIFE_ACTIVITY,
      severity: AlertSeverity.HIGH
    });
  });

  test('explicit park, event id, type, severity and description are retained', () => {
    const input = collar({ parkId: PARK, sourceEventId: 'evt-1', alertType: ConflictAlertType.CROP_RAID, severity: AlertSeverity.LOW, description: 'Raid' });
    expect(simulateCollarSchema.parse(input)).toEqual(input);
  });

  test.each([
    ['latitude', -90],
    ['latitude', 90],
    ['longitude', -180],
    ['longitude', 180]
  ])('%s exactly %d is on the valid boundary', (field, value) => {
    expect(simulateCollarSchema.safeParse(collar({ [field]: value })).success).toBe(true);
  });

  test('coordinates 0,0 are valid', () => {
    expect(simulateCollarSchema.parse(collar({ latitude: 0, longitude: 0 }))).toMatchObject({ latitude: 0, longitude: 0 });
  });

  test.each([
    ['latitude', -90.000001],
    ['latitude', 90.000001],
    ['longitude', -180.000001],
    ['longitude', 180.000001]
  ])('%s %d just outside the range is rejected', (field, value) => {
    expect(messages(simulateCollarSchema.safeParse(collar({ [field]: value })))[0]).toMatch(new RegExp(`^${field}: Number must be (greater|less) than or equal to`));
  });

  test.each([
    ['a numeric string', '-2.15'],
    ['NaN', Number.NaN],
    ['null', null]
  ])('a malformed latitude (%s) is rejected', (_label, latitude) => {
    expect(messages(simulateCollarSchema.safeParse(collar({ latitude }))).some(m => m.startsWith('latitude:'))).toBe(true);
  });

  test('a missing or empty animal ID is rejected with the documented message', () => {
    expect(messages(simulateCollarSchema.safeParse(collar({ animalId: '' })))).toEqual(['animalId: Animal ID is required']);
    expect(messages(simulateCollarSchema.safeParse({ latitude: 1, longitude: 1 }))).toEqual(['animalId: Required']);
  });

  test('missing coordinates are rejected', () => {
    expect(messages(simulateCollarSchema.safeParse({ animalId: 'E-1' }))).toEqual(['latitude: Required', 'longitude: Required']);
  });

  test('an unsupported alert type or severity is rejected', () => {
    expect(simulateCollarSchema.safeParse(collar({ alertType: 'POACHING' })).success).toBe(false);
    expect(simulateCollarSchema.safeParse(collar({ severity: 'EXTREME' })).success).toBe(false);
  });

  test('an invalid park id is rejected', () => {
    expect(messages(simulateCollarSchema.safeParse(collar({ parkId: 'not a park' })))).toEqual(['parkId: Select a valid Park / Conservation Area.']);
  });
});

describe('community report validation', () => {
  test('a valid crop-raid report is accepted with the default reporter name and MEDIUM severity', () => {
    expect(communityReportSchema.parse(community())).toEqual({ ...community(), reporterName: 'Community Member', severity: AlertSeverity.MEDIUM });
  });

  test.each(Object.values(ConflictAlertType))('report type %s is accepted', reportType => {
    expect(communityReportSchema.safeParse(community({ reportType })).success).toBe(true);
  });

  test('the shortest permitted description is exactly 5 characters', () => {
    expect(communityReportSchema.safeParse(community({ description: '12345' })).success).toBe(true);
    expect(messages(communityReportSchema.safeParse(community({ description: '1234' })))).toEqual(['description: Report description must be at least 5 characters']);
  });

  test('missing description, type and location are each reported', () => {
    expect(messages(communityReportSchema.safeParse({}))).toEqual(['latitude: Required', 'longitude: Required', 'reportType: Required', 'description: Required']);
  });

  test('an out-of-range community location is rejected', () => {
    expect(communityReportSchema.safeParse(community({ latitude: -91 })).success).toBe(false);
    expect(communityReportSchema.safeParse(community({ longitude: 181 })).success).toBe(false);
  });

  test('a non-string reporter name is rejected but an absent one is optional', () => {
    expect(communityReportSchema.safeParse(community({ reporterName: 42 })).success).toBe(false);
    expect(communityReportSchema.parse(community({ reporterName: 'Mzee Juma' })).reporterName).toBe('Mzee Juma');
  });

  test('coordinates on the exact boundaries are accepted', () => {
    expect(communityReportSchema.safeParse(community({ latitude: 90, longitude: -180 })).success).toBe(true);
  });
});

describe('direct alert creation validation', () => {
  test('a valid alert defaults its location source to GPS', () => {
    expect(createAlertSchema.parse(direct())).toEqual({ ...direct(), locationSource: LocationSource.GPS });
  });

  test('source, type and severity must be supported values', () => {
    expect(messages(createAlertSchema.safeParse(direct({ source: 'DRONE', alertType: 'X', severity: 'Y' }))).map(m => m.split(':')[0])).toEqual(['source', 'alertType', 'severity']);
  });

  test('the description must have at least 3 characters', () => {
    expect(createAlertSchema.safeParse(direct({ description: 'abc' })).success).toBe(true);
    expect(messages(createAlertSchema.safeParse(direct({ description: 'ab' })))).toEqual(['description: Description must be at least 3 characters']);
  });

  test('the shared location schema applies the same coordinate limits', () => {
    expect(locationSchema.parse({ latitude: 0, longitude: 0 })).toEqual({ latitude: 0, longitude: 0, source: LocationSource.GPS });
    expect(locationSchema.safeParse({ latitude: 90.1, longitude: 0 }).success).toBe(false);
  });
});

describe('response, acknowledgement and resolution validation', () => {
  test('acknowledgement accepts an empty body or a non-empty client acknowledgement id', () => {
    expect(acknowledgeAlertSchema.parse({})).toEqual({});
    expect(acknowledgeAlertSchema.parse({ clientAcknowledgementId: 'ack-1' })).toEqual({ clientAcknowledgementId: 'ack-1' });
    expect(acknowledgeAlertSchema.safeParse({ clientAcknowledgementId: '' }).success).toBe(false);
  });

  test('a field response defaults markResolved to false', () => {
    expect(addResponseSchema.parse({ action: ResponseAction.WARNED_COMMUNITY, notes: 'Warned village' })).toEqual({
      action: ResponseAction.WARNED_COMMUNITY,
      notes: 'Warned village',
      markResolved: false
    });
  });

  test('response notes need 3 characters and the action must be supported', () => {
    expect(messages(addResponseSchema.safeParse({ action: ResponseAction.OTHER, notes: 'ok' }))).toEqual(['notes: Response notes must be at least 3 characters']);
    expect(addResponseSchema.safeParse({ action: 'SHOT_ANIMAL', notes: 'Not allowed' }).success).toBe(false);
  });

  test('resolution requires notes of at least 3 characters', () => {
    expect(resolveAlertSchema.parse({ resolutionNotes: 'Done', clientActionId: 'res-1' })).toEqual({ resolutionNotes: 'Done', clientActionId: 'res-1' });
    expect(messages(resolveAlertSchema.safeParse({}))).toEqual(['resolutionNotes: Required']);
    expect(messages(resolveAlertSchema.safeParse({ resolutionNotes: 'no' }))).toEqual(['resolutionNotes: Resolution notes are required when resolving an alert']);
  });

  test('cancellation requires a reason; deletion reason is optional but must be 3+ characters', () => {
    expect(messages(cancelAlertSchema.safeParse({}))).toEqual(['reason: Required']);
    expect(messages(cancelAlertSchema.safeParse({ reason: 'no' }))).toEqual(['reason: Cancellation reason is required']);
    expect(deleteSchema.parse({})).toEqual({});
    expect(deleteSchema.safeParse({ reason: 'x' }).success).toBe(false);
  });

  test('alert and response updates require at least one editable field', () => {
    expect(messages(updateAlertSchema.safeParse({}))).toEqual([': At least one editable alert field is required']);
    expect(messages(updateResponseSchema.safeParse({}))).toEqual([': At least one editable response field is required']);
    expect(updateAlertSchema.parse({ severity: AlertSeverity.CRITICAL })).toEqual({ severity: AlertSeverity.CRITICAL });
    expect(updateResponseSchema.parse({ notes: 'Edited notes' })).toEqual({ notes: 'Edited notes' });
  });

  test('alert updates validate coordinates and enum values', () => {
    expect(updateAlertSchema.safeParse({ latitude: 91 }).success).toBe(false);
    expect(updateAlertSchema.safeParse({ locationSource: 'SATELLITE' }).success).toBe(false);
    expect(updateAlertSchema.safeParse({ animalId: '' }).success).toBe(false);
  });
});
