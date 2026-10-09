import { ApiError } from '../../../shared/api/apiError';
import { IncidentDeletionReason, IncidentStatus, IncidentType, LocationSource, SyncStatus } from '../../../shared/types/enums';
import type { ConservationIncident } from '../types/incident';
import { reportIncidentFormSchema } from '../schemas/incidentSchemas';
import { MAX_PHOTO_BYTES, readEvidenceFile } from './photoFile';
import { incidentTypeLabel } from './incidentTypes';
import { buildFieldIssue, buildSubmitIssue, evidenceCountIssue, sortIssues } from './incidentFormIssues';
import {
  activeEvidenceCount,
  buildDeletePayload,
  buildIncidentChanges,
  distanceMeters,
  formFromIncident,
  formatDistance,
  incidentDisplayName,
  validateEditForm
} from './incidentEdit';

// UC-B client rules: photo files, the report form schema, error wording and edit helpers.
const incident = (overrides: Partial<ConservationIncident> = {}): ConservationIncident => ({
  _id: 'inc-1',
  incidentType: IncidentType.SNARE,
  otherTypeDescription: null,
  description: 'Wire snare near the waterhole',
  location: { latitude: 0, longitude: 0, timestamp: '2026-10-08T12:00:00.000Z', source: LocationSource.GPS },
  reportedBy: 'R-101',
  rangerName: 'Ranger John',
  reportedAt: '2026-10-08T12:00:00.000Z',
  evidence: [{ evidenceId: 'evid-1', imageUrl: 'a' }, { evidenceId: 'evid-2', imageUrl: 'b' }],
  status: IncidentStatus.REPORTED,
  syncStatus: SyncStatus.SYNCED,
  updatedAt: '2026-10-08T12:30:00.000Z',
  ...overrides
});
const ctx = { description: 'Fresh tracks', otherDescription: '' };

describe('photo evidence files (readEvidenceFile)', () => {
  test.each(['image/jpeg', 'image/png', 'image/webp'])('reads a %s photo as a data URL', async type => {
    const photo = await readEvidenceFile(new File(['photo-bytes'], 'evidence', { type }));
    expect(photo).toEqual({ dataUrl: expect.stringMatching(new RegExp(`^data:${type};base64,`)), size: 11, mimeType: type });
  });

  test.each([
    ['a GIF', 'image/gif'],
    ['a HEIC', 'image/heic'],
    ['a PDF', 'application/pdf'],
    ['an untyped', '']
  ])('rejects %s file', async (_label, type) => {
    await expect(readEvidenceFile(new File(['x'], 'evidence', { type }))).rejects.toThrow('Invalid file type: photo evidence must be a JPEG, PNG or WebP image.');
  });

  test('accepts exactly 5 MB and rejects a larger photo', async () => {
    const atLimit = new File(['x'], 'limit.jpg', { type: 'image/jpeg' });
    Object.defineProperty(atLimit, 'size', { value: MAX_PHOTO_BYTES });
    const tooLarge = new File(['x'], 'large.jpg', { type: 'image/jpeg' });
    Object.defineProperty(tooLarge, 'size', { value: MAX_PHOTO_BYTES + 1 });

    await expect(readEvidenceFile(atLimit)).resolves.toMatchObject({ size: MAX_PHOTO_BYTES });
    await expect(readEvidenceFile(tooLarge)).rejects.toThrow('Image file is too large. Maximum allowed evidence size is 5MB.');
  });

  test.each([
    ['the camera/file read fails', (reader: FileReader) => reader.onerror?.(new ProgressEvent('error') as ProgressEvent<FileReader>), 'Camera access error or failed to read captured image.'],
    [
      'the read produces no image data',
      (reader: FileReader) => reader.onload?.({ target: { result: '' } } as unknown as ProgressEvent<FileReader>),
      'Unable to process captured photograph. Please try again.'
    ]
  ])('reports a friendly error when %s', async (_label, finish, message) => {
    vi.stubGlobal(
      'FileReader',
      class {
        onerror: FileReader['onerror'] = null;
        onload: FileReader['onload'] = null;
        readAsDataURL() {
          finish(this as unknown as FileReader);
        }
      }
    );
    try {
      await expect(readEvidenceFile(new File(['x'], 'e.jpg', { type: 'image/jpeg' }))).rejects.toThrow(message);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('report form schema', () => {
  const form = { incidentType: IncidentType.SNARE, description: 'Wire snare', latitude: 6.475, longitude: 80.88, imageUrl: 'data:image/jpeg;base64,AAAA' };
  const firstMessage = (values: object) => reportIncidentFormSchema.safeParse(values).error?.issues[0].message;

  test('accepts a complete report and defaults the location source to GPS', () => {
    expect(reportIncidentFormSchema.parse(form).locationSource).toBe(LocationSource.GPS);
  });

  test('accepts boundary coordinates and a manual location', () => {
    expect(reportIncidentFormSchema.safeParse({ ...form, latitude: -90, longitude: 180, locationSource: LocationSource.MANUAL }).success).toBe(true);
    expect(reportIncidentFormSchema.safeParse({ ...form, latitude: 0, longitude: 0 }).success).toBe(true);
  });

  test.each([
    ['a missing incident type', { incidentType: null }, 'Please select a valid incident type'],
    ['a blank description', { description: '   ' }, 'Please provide a description of at least 3 characters'],
    ['a 1001-character description', { description: 'd'.repeat(1001) }, 'Description cannot exceed 1000 characters'],
    ['latitude 91', { latitude: 91 }, 'Latitude must be between -90 and 90'],
    ['longitude -180.5', { longitude: -180.5 }, 'Longitude must be between -180 and 180'],
    ['a missing photo', { imageUrl: '' }, 'Please capture or upload photographic evidence'],
    ['an "Other" threat named with 2 characters', { incidentType: IncidentType.OTHER, otherTypeDescription: ' ab ' }, 'Please describe the "Other" threat (at least 3 characters)'],
    ['a 201-character "Other" name', { incidentType: IncidentType.OTHER, otherTypeDescription: 'x'.repeat(201) }, 'Other type description cannot exceed 200 characters']
  ])('rejects %s', (_label, override, message) => {
    expect(firstMessage({ ...form, ...override })).toBe(message);
  });

  test('a 1000-character description is accepted', () => {
    expect(reportIncidentFormSchema.safeParse({ ...form, description: 'd'.repeat(1000) }).success).toBe(true);
  });
});

describe('incident types', () => {
  test('labels each type for the ranger and falls back to the raw value', () => {
    expect(incidentTypeLabel(IncidentType.SNARE)).toBe('Wire Snare / Trap');
    expect(incidentTypeLabel(IncidentType.AT_RISK_FOOTPRINTS)).toBe('Species Tracks');
    expect(incidentTypeLabel('POACHER_CAMP' as IncidentType)).toBe('POACHER_CAMP');
  });
});

describe('form problem wording (incidentFormIssues)', () => {
  test.each([
    ['location', 'Location not set', ctx, 'Pin on Map'],
    ['incidentType', 'Incident type not selected', ctx, 'Choose Type'],
    ['imageUrl', 'Photo evidence missing', ctx, 'Add Photo'],
    ['description', 'Description is empty', { ...ctx, description: '  ' }, 'Write Note'],
    ['description', 'Description too short', { ...ctx, description: 'ab' }, 'Add Detail'],
    ['description', 'Description too long', { ...ctx, description: 'd'.repeat(1001) }, 'Shorten Text'],
    ['otherTypeDescription', 'Describe the "Other" threat', { ...ctx, otherDescription: 'ab' }, 'Describe Threat'],
    ['otherTypeDescription', 'Threat details too long', { ...ctx, otherDescription: 'x'.repeat(201) }, 'Shorten Text']
  ] as const)('%s problem is titled "%s"', (field, title, context, actionLabel) => {
    expect(buildFieldIssue(field, 'schema message', context)).toMatchObject({ field, title, actionLabel });
  });

  test('lists problems in the order the fields appear on the form', () => {
    const issues = ['description', 'imageUrl', 'location', 'incidentType'].map(field => buildFieldIssue(field as never, '', ctx));
    expect(sortIssues(issues).map(issue => issue.field)).toEqual(['location', 'incidentType', 'imageUrl', 'description']);
  });

  test.each([
    [0, 'At least one photo must remain'],
    [6, 'Too many photos'],
    [7, 'Too many photos']
  ])('%d photos is a problem: "%s"', (count, title) => {
    expect(evidenceCountIssue(count)?.title).toBe(title);
  });

  test('1 to 5 photos is fine, and the message says how many to remove', () => {
    expect([1, 5].map(evidenceCountIssue)).toEqual([null, null]);
    expect(evidenceCountIssue(7)?.message).toBe('A report can have at most 5 photos. Remove 2 to continue.');
  });

  test.each([
    ['OFFLINE', 'save', "You're offline"],
    ['INCIDENT_LOCKED', 'save', 'This report is locked'],
    ['EDIT_CONFLICT', 'save', 'Changed on another device'],
    ['INCIDENT_DELETED', 'delete', 'Report already deleted'],
    ['INCIDENT_NOT_DELETED', 'restore', 'Report is not deleted'],
    ['SYNC_IN_PROGRESS', 'delete', 'Report is syncing'],
    ['ALREADY_SYNCED', 'delete', 'Report is syncing'],
    ['OTHER_DESCRIPTION_REQUIRED', 'save', 'Describe the "Other" threat'],
    ['EVIDENCE_REQUIRED', 'save', 'At least one photo must remain'],
    ['TOO_MANY_EVIDENCE', 'save', 'Too many photos'],
    ['EVIDENCE_NOT_FOUND', 'save', 'Photo no longer available'],
    ['LOCATION_TOO_FAR_FROM_PATROL', 'save', 'Location too far from your patrol'],
    ['NO_CHANGES', 'save', 'No changes to save'],
    ['INVALID_EDIT_TIME', 'save', 'Check your device clock'],
    ['FORBIDDEN', 'submit', 'Not allowed'],
    ['INCIDENT_NOT_FOUND', 'save', 'Report not found'],
    ['PAYLOAD_TOO_LARGE', 'submit', 'Photo is too large to upload'],
    ['VALIDATION_ERROR', 'submit', 'Some details were not accepted']
  ] as const)('server code %s on %s is explained as "%s"', (code, action, title) => {
    expect(buildSubmitIssue(new ApiError('Server message', 400, code), action, ctx).title).toBe(title);
  });

  test('an edit conflict while deleting asks the ranger to review before deleting', () => {
    expect(buildSubmitIssue(new ApiError('x', 409, 'EDIT_CONFLICT'), 'delete', ctx).message).toBe(
      'This report was changed after you opened it. Review the latest version, then delete it if you still want to.'
    );
  });

  test.each([
    [new Error('Request body exceeds the 8 MB limit.'), 'submit', 'Photo is too large to upload'],
    [new Error('Unauthorized: not your report'), 'save', 'Not allowed'],
    [new Error('Unable to save this incident on the device. Please try again.'), 'submit', 'Could not save on this device'],
    [new Error('Something unexpected'), 'submit', 'The server rejected this report'],
    [new Error('Something unexpected'), 'restore', 'The server could not restore this report']
  ] as const)('a plain error "%s" on %s is explained as "%s"', (error, action, title) => {
    expect(buildSubmitIssue(error, action, ctx).title).toBe(title);
  });

  test('a non-Error failure uses the fallback message for the action', () => {
    expect(buildSubmitIssue('boom', 'delete', ctx)).toEqual({ icon: '📡', title: 'The server could not delete this report', message: 'Failed to delete this report.' });
  });
});

describe('edit helpers (incidentEdit)', () => {
  test('starts the edit form from the saved report with nothing changed', () => {
    expect(formFromIncident(incident({ otherTypeDescription: null }))).toEqual({
      incidentType: IncidentType.SNARE,
      otherDescription: '',
      description: 'Wire snare near the waterhole',
      location: { latitude: 0, longitude: 0, source: LocationSource.GPS },
      removedEvidenceIds: [],
      newPhotos: []
    });
  });

  test('measures how far a pin moved and formats it', () => {
    expect(distanceMeters({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 })).toBeCloseTo(111194.93, 1);
    expect(distanceMeters({ latitude: 6.4, longitude: 80.9 }, { latitude: 6.4, longitude: 80.9 })).toBe(0);
    expect([0, 999.4, 1000, 1549].map(formatDistance)).toEqual(['0 m', '999 m', '1.0 km', '1.5 km']);
  });

  test('counts photos kept after removals plus new photos', () => {
    const form = { ...formFromIncident(incident()), removedEvidenceIds: ['evid-1'], newPhotos: [{ key: 'n1', imageUrl: 'c', capturedAt: 'x' }] };
    expect(activeEvidenceCount(incident(), form)).toBe(2);
  });

  test('builds only the changed fields with a readable summary', () => {
    const original = incident();
    const form = {
      ...formFromIncident(original),
      incidentType: IncidentType.OTHER,
      otherDescription: '  Fence cut  ',
      location: { latitude: 0, longitude: 0.01, source: LocationSource.MANUAL },
      removedEvidenceIds: ['evid-2'],
      newPhotos: [{ key: 'n1', imageUrl: 'data:new', fileSize: 10, mimeType: 'image/png', capturedAt: '2026-10-08T13:00:00.000Z' }]
    };

    const { changes, summary } = buildIncidentChanges(original, form);

    expect(changes).toEqual({
      incidentType: IncidentType.OTHER,
      otherTypeDescription: 'Fence cut',
      location: { latitude: 0, longitude: 0.01, source: LocationSource.MANUAL },
      removeEvidenceIds: ['evid-2'],
      addEvidence: [{ imageUrl: 'data:new', capturedAt: '2026-10-08T13:00:00.000Z', fileSize: 10, mimeType: 'image/png' }]
    });
    expect(summary.map(item => [item.label, item.detail])).toEqual([
      ['Incident type', 'Wire Snare / Trap → Other Threat'],
      ['Threat name', '"Fence cut"'],
      ['Location', 'Moved 1.1 km (MANUAL)'],
      ['Photos', '1 added, 1 removed']
    ]);
  });

  test('long new text is shortened in the summary but sent in full', () => {
    const description = 'd'.repeat(120);
    const { changes, summary } = buildIncidentChanges(incident(), { ...formFromIncident(incident()), description });
    expect(changes.description).toBe(description);
    expect(summary[0].detail).toBe(`"${'d'.repeat(79)}…"`);
  });

  test('a delete request carries the edited version and a note only when given', () => {
    const payload = buildDeletePayload(incident(), IncidentDeletionReason.FALSE_ALARM);
    expect(payload).toEqual({
      expectedUpdatedAt: '2026-10-08T12:30:00.000Z',
      deletedAt: expect.any(String),
      clientDeleteId: expect.stringMatching(/^delete-\d+-[a-z0-9]+$/),
      reason: IncidentDeletionReason.FALSE_ALARM
    });
    expect(buildDeletePayload(incident(), IncidentDeletionReason.OTHER, 'Wrong park').note).toBe('Wrong park');
  });

  test('names a report by its threat name for OTHER, otherwise by its type', () => {
    expect(incidentDisplayName(incident({ incidentType: IncidentType.OTHER, otherTypeDescription: 'Fence cut' }))).toBe('Fence cut');
    expect(incidentDisplayName(incident({ incidentType: IncidentType.OTHER, otherTypeDescription: null }))).toBe('Other Threat');
    expect(incidentDisplayName(incident())).toBe('Wire Snare / Trap');
  });

  test('flags an over-long description or threat name and too many photos', () => {
    const original = incident();
    const form = {
      ...formFromIncident(original),
      incidentType: IncidentType.OTHER,
      otherDescription: 'x'.repeat(201),
      description: 'd'.repeat(1001),
      newPhotos: [1, 2, 3, 4].map(n => ({ key: `n${n}`, imageUrl: 'p', capturedAt: 'x' }))
    };

    expect(validateEditForm(original, form).map(issue => issue.title)).toEqual(['Threat details too long', 'Too many photos', 'Description too long']);
  });
});
