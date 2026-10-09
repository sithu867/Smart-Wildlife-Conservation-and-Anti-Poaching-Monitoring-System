import {
  createIncidentSchema,
  deleteIncidentSchema,
  evidenceSchema,
  restoreIncidentSchema,
  updateIncidentSchema
} from '../src/modules/incidents/validation.js';
import { IncidentDeletionReason, IncidentType, LocationSource } from '../src/types/enums.js';

// UC-B request validation (zod schemas used by the incident controller).
const jpeg = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD';
const report = {
  incidentType: IncidentType.SNARE,
  description: 'Wire snare on the fence line',
  latitude: 6.475,
  longitude: 80.88,
  evidence: [{ imageUrl: jpeg }]
};
const paths = (result: { success: boolean; error?: { issues: Array<{ path: Array<string | number> }> } }) =>
  result.error?.issues.map(issue => issue.path.join('.')) ?? [];

describe('UC-B evidenceSchema (photo rules)', () => {
  test.each([
    ['JPEG', 'data:image/jpeg;base64,/9j/4AAQ'],
    ['PNG', 'data:image/png;base64,iVBORw0KGgo='],
    ['WebP', 'data:image/webp;base64,UklGRg==']
  ])('accepts a %s data URL', (_label, imageUrl) => {
    expect(evidenceSchema.safeParse({ imageUrl }).success).toBe(true);
  });

  test.each([
    ['an unsupported image type', 'data:image/gif;base64,R0lGODlh'],
    ['a plain file name', 'photo.jpg'],
    ['a remote URL', 'https://example.org/snare.jpg'],
    ['malformed base64 data', 'data:image/jpeg;base64,not base64!'],
    ['a data URL without base64 encoding', 'data:image/jpeg,raw']
  ])('rejects %s', (_label, imageUrl) => {
    const result = evidenceSchema.safeParse({ imageUrl });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe('Photo evidence must be a JPEG, PNG or WebP image');
  });

  test('rejects an empty photo', () => {
    expect(evidenceSchema.safeParse({ imageUrl: '' }).error?.issues[0].message).toBe('Photographic evidence is required');
  });

  test('accepts a photo of exactly 5 MB and rejects one byte more', () => {
    const fiveMb = `data:image/jpeg;base64,${'A'.repeat(6990507)}=`;
    const overFiveMb = `data:image/jpeg;base64,${'A'.repeat(6990508)}`;
    expect(evidenceSchema.safeParse({ imageUrl: fiveMb }).success).toBe(true);
    expect(evidenceSchema.safeParse({ imageUrl: overFiveMb }).error?.issues[0].message).toBe('Photo evidence cannot exceed 5 MB');
  });

  test('metadata must be real values that match the photo', () => {
    expect(evidenceSchema.safeParse({ imageUrl: jpeg, mimeType: 'image/jpeg', fileSize: 1024, capturedAt: '2026-10-01T06:00:00Z' }).success).toBe(true);
    expect(paths(evidenceSchema.safeParse({ imageUrl: jpeg, mimeType: 'image/png' }))).toEqual(['mimeType']);
    expect(paths(evidenceSchema.safeParse({ imageUrl: jpeg, mimeType: 'image/gif' }))).toEqual(['mimeType']);
    expect(paths(evidenceSchema.safeParse({ imageUrl: jpeg, fileSize: 0 }))).toEqual(['fileSize']);
    expect(paths(evidenceSchema.safeParse({ imageUrl: jpeg, fileSize: 5 * 1024 * 1024 + 1 }))).toEqual(['fileSize']);
    expect(paths(evidenceSchema.safeParse({ imageUrl: jpeg, capturedAt: 'yesterday' }))).toEqual(['capturedAt']);
  });
});

describe('UC-B createIncidentSchema', () => {
  test('accepts a GPS report and defaults the location source to GPS', () => {
    const parsed = createIncidentSchema.parse(report);
    expect(parsed).toMatchObject({ incidentType: IncidentType.SNARE, locationSource: LocationSource.GPS, latitude: 6.475, longitude: 80.88 });
  });

  test('accepts a manually pinned location, an offline report time and a client id', () => {
    const parsed = createIncidentSchema.parse({
      ...report,
      locationSource: LocationSource.MANUAL,
      reportedAt: '2026-10-01T06:00:00+05:30',
      clientIncidentId: 'inc-offline-1',
      patrolSessionId: 'sess-1'
    });
    expect(parsed).toMatchObject({ locationSource: LocationSource.MANUAL, clientIncidentId: 'inc-offline-1', patrolSessionId: 'sess-1' });
  });

  test.each([
    [-90, -180],
    [90, 180],
    [0, 0]
  ])('accepts boundary coordinates (%d, %d)', (latitude, longitude) => {
    expect(createIncidentSchema.safeParse({ ...report, latitude, longitude }).success).toBe(true);
  });

  test.each([
    ['latitude', { latitude: 90.0001 }, 'Latitude must be between -90 and 90'],
    ['latitude', { latitude: -90.0001 }, 'Latitude must be between -90 and 90'],
    ['longitude', { longitude: 180.0001 }, 'Longitude must be between -180 and 180'],
    ['longitude', { longitude: -180.0001 }, 'Longitude must be between -180 and 180']
  ])('rejects an out-of-range %s', (field, override, message) => {
    const result = createIncidentSchema.safeParse({ ...report, ...override });
    expect(paths(result)).toEqual([field]);
    expect(result.error?.issues[0].message).toBe(message);
  });

  test('rejects coordinates sent as text', () => {
    expect(paths(createIncidentSchema.safeParse({ ...report, latitude: '6.475' }))).toEqual(['latitude']);
  });

  test.each(['incidentType', 'description', 'latitude', 'longitude', 'evidence'])('requires %s', field => {
    const { [field as keyof typeof report]: _omitted, ...rest } = report;
    expect(paths(createIncidentSchema.safeParse(rest))).toEqual([field]);
  });

  test('rejects an unsupported incident type and location source', () => {
    expect(paths(createIncidentSchema.safeParse({ ...report, incidentType: 'POACHER_SIGHTING' }))).toEqual(['incidentType']);
    expect(paths(createIncidentSchema.safeParse({ ...report, locationSource: 'SATELLITE' }))).toEqual(['locationSource']);
  });

  test('description is trimmed and must be 3 to 1000 characters', () => {
    expect(createIncidentSchema.parse({ ...report, description: '  abc  ' }).description).toBe('abc');
    expect(createIncidentSchema.safeParse({ ...report, description: 'd'.repeat(1000) }).success).toBe(true);
    expect(createIncidentSchema.safeParse({ ...report, description: '  ab  ' }).error?.issues[0].message).toBe('Description must be at least 3 characters');
    expect(createIncidentSchema.safeParse({ ...report, description: 'd'.repeat(1001) }).error?.issues[0].message).toBe('Description cannot exceed 1000 characters');
  });

  test('requires at least one and at most five photos', () => {
    expect(createIncidentSchema.safeParse({ ...report, evidence: [] }).error?.issues[0].message).toBe('At least one photo evidence is required');
    expect(createIncidentSchema.safeParse({ ...report, evidence: Array(5).fill({ imageUrl: jpeg }) }).success).toBe(true);
    expect(createIncidentSchema.safeParse({ ...report, evidence: Array(6).fill({ imageUrl: jpeg }) }).error?.issues[0].message).toBe(
      'No more than 5 photos can be attached'
    );
  });

  test('reports the exact invalid photo', () => {
    expect(paths(createIncidentSchema.safeParse({ ...report, evidence: [{ imageUrl: jpeg }, { imageUrl: 'photo.jpg' }] }))).toEqual(['evidence.1.imageUrl']);
  });

  test('an "Other" threat must be named with at least 3 characters', () => {
    expect(createIncidentSchema.safeParse({ ...report, incidentType: IncidentType.OTHER, otherTypeDescription: 'Fence cut' }).success).toBe(true);
    const missing = createIncidentSchema.safeParse({ ...report, incidentType: IncidentType.OTHER });
    expect(paths(missing)).toEqual(['otherTypeDescription']);
    expect(paths(createIncidentSchema.safeParse({ ...report, incidentType: IncidentType.OTHER, otherTypeDescription: 'ab' }))).toEqual(['otherTypeDescription']);
    expect(paths(createIncidentSchema.safeParse({ ...report, incidentType: IncidentType.OTHER, otherTypeDescription: 'x'.repeat(201) }))).toEqual(['otherTypeDescription']);
  });

  test('rejects a malformed report time and park id', () => {
    expect(paths(createIncidentSchema.safeParse({ ...report, reportedAt: '01/10/2026' }))).toEqual(['reportedAt']);
    expect(paths(createIncidentSchema.safeParse({ ...report, parkId: 'not-a-park-id' }))).toEqual(['parkId']);
  });
});

describe('UC-B updateIncidentSchema', () => {
  const meta = { expectedUpdatedAt: '2026-10-01T06:00:00.000Z', editedAt: '2026-10-01T06:30:00.000Z', clientEditId: 'edit-1' };

  test('accepts a single changed field with the concurrency metadata', () => {
    expect(updateIncidentSchema.parse({ ...meta, description: 'Two snares' })).toEqual({ ...meta, description: 'Two snares' });
  });

  test('accepts a corrected manual location and photo changes', () => {
    const parsed = updateIncidentSchema.parse({
      ...meta,
      location: { latitude: 6.48, longitude: 80.9, source: LocationSource.MANUAL },
      addEvidence: [{ imageUrl: jpeg }],
      removeEvidenceIds: ['evid-1']
    });
    expect(parsed.location?.source).toBe(LocationSource.MANUAL);
    expect(parsed.removeEvidenceIds).toEqual(['evid-1']);
  });

  test('rejects a request with no editable change', () => {
    expect(updateIncidentSchema.safeParse(meta).error?.issues[0].message).toBe('No changes to save');
  });

  test('rejects fields that may not be edited', () => {
    const result = updateIncidentSchema.safeParse({ ...meta, description: 'Two snares', status: 'RESOLVED' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toMatch(/^Only incidentType, otherTypeDescription, description, location/);
  });

  test.each(['expectedUpdatedAt', 'editedAt', 'clientEditId'])('requires %s', field => {
    const { [field as keyof typeof meta]: _omitted, ...rest } = meta;
    expect(paths(updateIncidentSchema.safeParse({ ...rest, description: 'Two snares' }))).toEqual([field]);
  });

  test('rejects an invalid location, an over-long edit id and more than five new photos', () => {
    expect(paths(updateIncidentSchema.safeParse({ ...meta, location: { latitude: 91, longitude: 80, source: LocationSource.GPS } }))).toEqual(['location.latitude']);
    expect(paths(updateIncidentSchema.safeParse({ ...meta, location: { latitude: 6, longitude: 80, source: LocationSource.GPS, accuracy: 3 } }))).toEqual(['location']);
    expect(paths(updateIncidentSchema.safeParse({ ...meta, clientEditId: 'e'.repeat(65), description: 'Two snares' }))).toEqual(['clientEditId']);
    expect(paths(updateIncidentSchema.safeParse({ ...meta, addEvidence: Array(6).fill({ imageUrl: jpeg }) }))).toEqual(['addEvidence']);
  });
});

describe('UC-B deleteIncidentSchema and restoreIncidentSchema', () => {
  const withdrawal = { expectedUpdatedAt: '2026-10-01T06:00:00.000Z', deletedAt: '2026-10-01T07:00:00.000Z', clientDeleteId: 'del-1', reason: IncidentDeletionReason.DUPLICATE };

  test('accepts a withdrawal with a reason, and "Other" with a note', () => {
    expect(deleteIncidentSchema.parse(withdrawal)).toEqual(withdrawal);
    expect(deleteIncidentSchema.safeParse({ ...withdrawal, reason: IncidentDeletionReason.OTHER, note: 'Wrong park' }).success).toBe(true);
  });

  test('a reason is required and "Other" needs a note of at least 3 characters', () => {
    const { reason: _omitted, ...noReason } = withdrawal;
    expect(deleteIncidentSchema.safeParse(noReason).error?.issues[0].message).toBe('Choose a reason for deleting this report');
    expect(paths(deleteIncidentSchema.safeParse({ ...withdrawal, reason: IncidentDeletionReason.OTHER, note: ' a ' }))).toEqual(['note']);
    expect(paths(deleteIncidentSchema.safeParse({ ...withdrawal, note: 'n'.repeat(501) }))).toEqual(['note']);
  });

  test('a withdrawal rejects unknown fields and malformed times', () => {
    expect(deleteIncidentSchema.safeParse({ ...withdrawal, hardDelete: true }).success).toBe(false);
    expect(paths(deleteIncidentSchema.safeParse({ ...withdrawal, deletedAt: 'now' }))).toEqual(['deletedAt']);
  });

  test('a restore needs its time and a client id, and nothing else', () => {
    expect(restoreIncidentSchema.safeParse({ restoredAt: '2026-10-01T07:05:00.000Z', clientRestoreId: 'restore-1' }).success).toBe(true);
    expect(paths(restoreIncidentSchema.safeParse({ restoredAt: '2026-10-01T07:05:00.000Z', clientRestoreId: '  ' }))).toEqual(['clientRestoreId']);
    expect(restoreIncidentSchema.safeParse({ restoredAt: '2026-10-01T07:05:00.000Z', clientRestoreId: 'r', reason: 'x' }).success).toBe(false);
  });
});
