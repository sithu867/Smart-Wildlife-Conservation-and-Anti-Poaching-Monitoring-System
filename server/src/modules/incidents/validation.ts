import { z } from 'zod';
import { IncidentDeletionReason, IncidentType, LocationSource } from '../../types/enums.js';

export const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024;
export const MAX_EVIDENCE_PER_INCIDENT = 5;
export const ALLOWED_EVIDENCE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

// data:image/<jpeg|png|webp>;base64,<payload>
const IMAGE_DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/;

function decodedBase64Bytes(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

const isoDateTime = (field: string) =>
  z.string().datetime({ offset: true, message: `${field} must be a valid ISO 8601 date-time` });

const latitudeSchema = z.number().min(-90, 'Latitude must be between -90 and 90').max(90, 'Latitude must be between -90 and 90');
const longitudeSchema = z.number().min(-180, 'Longitude must be between -180 and 180').max(180, 'Longitude must be between -180 and 180');
const descriptionSchema = z
  .string()
  .trim()
  .min(3, 'Description must be at least 3 characters')
  .max(1000, 'Description cannot exceed 1000 characters');
const otherTypeDescriptionSchema = z.string().trim().max(200, 'Other type description cannot exceed 200 characters');

export const evidenceSchema = z
  .object({
    imageUrl: z
      .string()
      .min(1, 'Photographic evidence is required')
      .regex(IMAGE_DATA_URL, 'Photo evidence must be a JPEG, PNG or WebP image')
      .refine(url => decodedBase64Bytes(url) <= MAX_EVIDENCE_BYTES, 'Photo evidence cannot exceed 5 MB'),
    capturedAt: isoDateTime('capturedAt').optional(),
    fileSize: z.number().int().positive('fileSize must be positive').max(MAX_EVIDENCE_BYTES, 'Photo evidence cannot exceed 5 MB').optional(),
    mimeType: z.enum(ALLOWED_EVIDENCE_MIME_TYPES, { errorMap: () => ({ message: 'mimeType must be image/jpeg, image/png or image/webp' }) }).optional()
  })
  .superRefine((ev, ctx) => {
    const embeddedMime = IMAGE_DATA_URL.exec(ev.imageUrl)?.[1];
    if (ev.mimeType && embeddedMime && ev.mimeType !== embeddedMime) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['mimeType'], message: 'mimeType does not match the photo data' });
    }
  });

export type EvidenceInput = z.infer<typeof evidenceSchema>;

const requireOtherDescription = (
  value: { incidentType?: IncidentType; otherTypeDescription?: string },
  ctx: z.RefinementCtx
) => {
  if (value.incidentType === IncidentType.OTHER && (value.otherTypeDescription ?? '').length < 3) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['otherTypeDescription'],
      message: 'Please describe the "Other" threat (at least 3 characters)'
    });
  }
};

export const createIncidentSchema = z
  .object({
    clientIncidentId: z.string().optional(),
    // When the ranger reported it on the device. Sent for offline reports so syncing later keeps the real time.
    reportedAt: isoDateTime('reportedAt').optional(),
    incidentType: z.nativeEnum(IncidentType),
    otherTypeDescription: otherTypeDescriptionSchema.optional(),
    description: descriptionSchema,
    latitude: latitudeSchema,
    longitude: longitudeSchema,
    locationSource: z.nativeEnum(LocationSource).default(LocationSource.GPS),
    patrolSessionId: z.string().optional(),
    evidence: z
      .array(evidenceSchema)
      .min(1, 'At least one photo evidence is required')
      .max(MAX_EVIDENCE_PER_INCIDENT, `No more than ${MAX_EVIDENCE_PER_INCIDENT} photos can be attached`)
  })
  .superRefine(requireOtherDescription);

export type CreateIncidentInput = z.infer<typeof createIncidentSchema>;

const EDITABLE_FIELDS = [
  'incidentType',
  'otherTypeDescription',
  'description',
  'location',
  'addEvidence',
  'removeEvidenceIds',
  'patrolSessionId'
] as const;

export const updateIncidentSchema = z
  .object({
    // Concurrency / offline-sync metadata
    expectedUpdatedAt: isoDateTime('expectedUpdatedAt'),
    editedAt: isoDateTime('editedAt'),
    clientEditId: z.string().trim().min(1, 'clientEditId is required').max(64, 'clientEditId cannot exceed 64 characters'),

    // Editable fields (all optional - only changed fields are sent)
    incidentType: z.nativeEnum(IncidentType).optional(),
    otherTypeDescription: otherTypeDescriptionSchema.optional(),
    description: descriptionSchema.optional(),
    location: z
      .object({ latitude: latitudeSchema, longitude: longitudeSchema, source: z.nativeEnum(LocationSource) })
      .strict()
      .optional(),
    addEvidence: z
      .array(evidenceSchema)
      .max(MAX_EVIDENCE_PER_INCIDENT, `No more than ${MAX_EVIDENCE_PER_INCIDENT} photos can be attached`)
      .optional(),
    removeEvidenceIds: z.array(z.string().min(1)).max(MAX_EVIDENCE_PER_INCIDENT).optional(),
    patrolSessionId: z.string().min(1).optional()
  })
  .strict(`Only ${EDITABLE_FIELDS.join(', ')} can be edited`)
  .refine(input => EDITABLE_FIELDS.some(field => input[field] !== undefined), { message: 'No changes to save' });

export type UpdateIncidentInput = z.infer<typeof updateIncidentSchema>;

export const deleteIncidentSchema = z
  .object({
    expectedUpdatedAt: isoDateTime('expectedUpdatedAt'),
    // When the ranger deleted the report (offline deletes sync later and are judged by this time)
    deletedAt: isoDateTime('deletedAt'),
    clientDeleteId: z.string().trim().min(1, 'clientDeleteId is required').max(64, 'clientDeleteId cannot exceed 64 characters'),
    reason: z.nativeEnum(IncidentDeletionReason, { errorMap: () => ({ message: 'Choose a reason for deleting this report' }) }),
    note: z.string().trim().max(500, 'Note cannot exceed 500 characters').optional()
  })
  .strict()
  .superRefine((input, ctx) => {
    if (input.reason === IncidentDeletionReason.OTHER && (input.note ?? '').length < 3) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['note'], message: 'Add a short note explaining why (at least 3 characters)' });
    }
  });

export type DeleteIncidentInput = z.infer<typeof deleteIncidentSchema>;

export const restoreIncidentSchema = z
  .object({
    restoredAt: isoDateTime('restoredAt'),
    clientRestoreId: z.string().trim().min(1, 'clientRestoreId is required').max(64, 'clientRestoreId cannot exceed 64 characters')
  })
  .strict();

export type RestoreIncidentInput = z.infer<typeof restoreIncidentSchema>;
