import { z } from 'zod';

export const manualWaypointSchema = z.object({
  latitude: z.number().min(-90, 'Latitude must be between -90 and 90').max(90, 'Latitude must be between -90 and 90'),
  longitude: z.number().min(-180, 'Longitude must be between -180 and 180').max(180, 'Longitude must be between -180 and 180'),
  note: z.string().max(500, 'Observation note cannot exceed 500 characters').optional()
});

export type ManualWaypointFormValues = z.infer<typeof manualWaypointSchema>;
