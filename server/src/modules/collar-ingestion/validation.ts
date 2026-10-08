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

export function normalizeVendorPayload(body: any, vendor?: string): CollarTelemetryInput {
  if (body.eventId && body.deviceId && body.animalId && typeof body.latitude === 'number' && typeof body.longitude === 'number') {
    return collarTelemetrySchema.parse(body);
  }

  // Handle TTN / LoRaWAN webhook format
  const ttnPayload = body.uplink_message?.decoded_payload || body.payload_fields || body.decoded_payload;
  const devId = body.end_device_ids?.device_id || body.deviceId || body.device_id || body.dev_id || 'UNKNOWN-DEVICE';
  const animalId = body.animalId || body.animal_id || body.animal || devId.replace(/^collar-/i, 'ANIMAL-');
  const eventId = body.eventId || body.event_id || body.deduplication_id || `vendor-evt-${devId}-${Date.now()}`;

  const lat = body.latitude ?? body.lat ?? ttnPayload?.latitude ?? ttnPayload?.lat;
  const lon = body.longitude ?? body.lng ?? body.lon ?? ttnPayload?.longitude ?? ttnPayload?.lng ?? ttnPayload?.lon;

  const rawDate = body.recordedAt ?? body.timestamp ?? body.time ?? body.received_at ?? body.recorded_at ?? new Date().toISOString();
  let recordedAt: string;
  try {
    recordedAt = new Date(rawDate).toISOString();
  } catch {
    recordedAt = new Date().toISOString();
  }

  const batteryPercent = body.batteryPercent ?? body.battery ?? body.battery_level ?? ttnPayload?.battery ?? ttnPayload?.battery_percent;
  const accuracyMeters = body.accuracyMeters ?? body.accuracy ?? body.gps_accuracy ?? ttnPayload?.accuracy;

  const normalized = {
    eventId: String(eventId),
    deviceId: String(devId),
    animalId: String(animalId),
    latitude: Number(lat),
    longitude: Number(lon),
    recordedAt,
    batteryPercent: batteryPercent !== undefined ? Math.round(Number(batteryPercent)) : undefined,
    accuracyMeters: accuracyMeters !== undefined ? Number(accuracyMeters) : undefined,
    alertType: body.alertType,
    description: body.description || `Ingested collar payload from vendor: ${vendor || 'generic'}`
  };

  return collarTelemetrySchema.parse(normalized);
}
