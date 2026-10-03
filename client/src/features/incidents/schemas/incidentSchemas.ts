import { z } from 'zod';
import { IncidentType, LocationSource } from '../../../shared/types/enums';

export const reportIncidentFormSchema = z.object({
  incidentType: z.nativeEnum(IncidentType, {
    errorMap: () => ({ message: 'Please select a valid incident type' })
  }),
  otherTypeDescription: z
    .string()
    .max(200, 'Other type description cannot exceed 200 characters')
    .optional(),
  description: z
    .string()
    .min(3, 'Please provide a description of at least 3 characters')
    .max(1000, 'Description cannot exceed 1000 characters'),
  latitude: z.number().min(-90, 'Latitude must be between -90 and 90').max(90, 'Latitude must be between -90 and 90'),
  longitude: z.number().min(-180, 'Longitude must be between -180 and 180').max(180, 'Longitude must be between -180 and 180'),
  locationSource: z.nativeEnum(LocationSource).default(LocationSource.GPS),
  patrolSessionId: z.string().optional(),
  imageUrl: z.string().min(1, 'Please capture or upload photographic evidence')
});

export type ReportIncidentFormValues = z.infer<typeof reportIncidentFormSchema>;
