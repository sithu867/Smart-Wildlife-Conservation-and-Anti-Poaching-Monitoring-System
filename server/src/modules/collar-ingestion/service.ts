import { prisma } from '../../config/prisma.js';
import { AlertSeverity, ConflictAlertType } from '../../types/enums.js';
import { conflictAlertService } from '../conflict-alerts/service.js';
import type { CollarTelemetryInput } from './validation.js';

export class CollarIngestionService {
  async ingest(input: CollarTelemetryInput) {
    const existing = await prisma.collarTelemetry.findUnique({ where: { eventId: input.eventId } });
    if (existing) {
      return { duplicate: true, telemetrySaved: true, alertCreated: existing.alertCreated, telemetryId: existing.id };
    }

    const telemetry = await prisma.collarTelemetry.create({
      data: {
        eventId: input.eventId,
        deviceId: input.deviceId,
        animalId: input.animalId,
        latitude: input.latitude,
        longitude: input.longitude,
        recordedAt: new Date(input.recordedAt),
        batteryPercent: input.batteryPercent,
        accuracyMeters: input.accuracyMeters
      }
    });

    const alert = await conflictAlertService.simulateCollarEvent({
      sourceEventId: input.eventId,
      animalId: input.animalId,
      latitude: input.latitude,
      longitude: input.longitude,
      alertType: input.alertType as ConflictAlertType | undefined ?? ConflictAlertType.DANGEROUS_WILDLIFE_ACTIVITY,
      severity: AlertSeverity.HIGH,
      description: input.description
    });

    const alertCreated = Boolean(alert.alertCreated);
    await prisma.collarTelemetry.update({ where: { id: telemetry.id }, data: { alertCreated } });
    return { duplicate: false, telemetrySaved: true, alertCreated, telemetryId: telemetry.id, ...(alertCreated ? { alert } : { telemetry: alert }) };
  }
}

export const collarIngestionService = new CollarIngestionService();
