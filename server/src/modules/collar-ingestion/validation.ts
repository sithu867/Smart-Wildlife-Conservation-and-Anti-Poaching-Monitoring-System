import { z } from 'zod';

export const collarTelemetrySchema = z.object({
  eventId: z.string().min(1),
  deviceId: z.string().min(1),
  animalId: z.string().min(1),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  recordedAt: z.string().datetime({ offset: true }),
  batteryPercent: z.number().int().min(0).max(100).optional(),
  accuracyMeters: z.number().finite().nonnegative().optional(),
  alertType: z.enum([
    'WILDLIFE_NEAR_COMMUNITY',
    'WILDLIFE_NEAR_RANGER',
    'CROP_RAID',
    'LIVESTOCK_THREAT',
    'DANGEROUS_WILDLIFE_ACTIVITY',
    'OTHER'
  ]).optional(),
  description: z.string().min(3).optional()
});

export type CollarTelemetryInput = z.infer<typeof collarTelemetrySchema>;
