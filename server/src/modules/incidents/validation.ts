import { z } from 'zod';
import { IncidentType, LocationSource } from '../../types/enums.js';
import { optionalParkIdSchema } from '../shared/parkScope.js';

export const createIncidentSchema = z.object({
  clientIncidentId: z.string().optional(),
  parkId: optionalParkIdSchema,
  incidentType: z.nativeEnum(IncidentType),
  otherTypeDescription: z.string().max(200, 'Other type description cannot exceed 200 characters').optional(),
  description: z.string().min(3, 'Description must be at least 3 characters').max(1000, 'Description cannot exceed 1000 characters'),
  latitude: z.number().min(-90, 'Latitude must be between -90 and 90').max(90, 'Latitude must be between -90 and 90'),
  longitude: z.number().min(-180, 'Longitude must be between -180 and 180').max(180, 'Longitude must be between -180 and 180'),
  locationSource: z.nativeEnum(LocationSource).default(LocationSource.GPS),
  patrolSessionId: z.string().optional(),
  evidence: z
    .array(
      z.object({
        imageUrl: z.string().min(1, 'Photographic evidence is required'),
        capturedAt: z.string().optional(),
        fileSize: z.number().optional(),
        mimeType: z.string().optional()
      })
    )
    .min(1, 'At least one photo evidence is required')
});

export type CreateIncidentInput = z.infer<typeof createIncidentSchema>;
