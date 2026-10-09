import { prisma } from '../../config/prisma.js';
import { AlertSeverity, ConflictAlertType } from '../../types/enums.js';
import { conflictAlertService, CONFIG_RISK_ZONES } from '../conflict-alerts/service.js';
import { appEventEmitter, EVENTS } from '../shared/events.js';
import type { CollarTelemetryInput } from './validation.js';

function calculateHaversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function findNearestRiskZone(lat: number, lon: number) {
  let nearest: { zoneName: string; distanceKm: number; inside: boolean } | null = null;
  for (const zone of CONFIG_RISK_ZONES) {
    const dist = calculateHaversineDistanceKm(lat, lon, zone.centerLat, zone.centerLon);
    if (!nearest || dist < nearest.distanceKm) {
      nearest = {
        zoneName: zone.name,
        distanceKm: Number(dist.toFixed(2)),
        inside: dist <= zone.radiusKm
      };
    }
  }
  return nearest;
}

export class CollarIngestionService {
  async ingest(input: CollarTelemetryInput) {
    const existing = await prisma.collarTelemetry.findUnique({ where: { eventId: input.eventId } });
    if (existing?.alertCreated) {
      return { duplicate: true, telemetrySaved: true, alertCreated: true, telemetryId: existing.id };
    }

    // A stored reading without an alert may be a gateway retry after the alert step failed, so the
    // risk zone is evaluated again; alert creation is idempotent on the event id.
    const telemetry = existing ?? await prisma.collarTelemetry.create({
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
    if (existing && !alertCreated) {
      return { duplicate: true, telemetrySaved: true, alertCreated: false, telemetryId: existing.id };
    }
    await prisma.collarTelemetry.update({ where: { id: telemetry.id }, data: { alertCreated } });

    // Emit live events for connected stream listeners
    appEventEmitter.emit(EVENTS.COLLAR_TELEMETRY_RECEIVED, { telemetry, alertCreated, alert });
    if (alertCreated) {
      appEventEmitter.emit(EVENTS.ALERT_CREATED, alert);
    }

    return { duplicate: Boolean(existing), telemetrySaved: true, alertCreated, telemetryId: telemetry.id, ...(alertCreated ? { alert } : { telemetry: alert }) };
  }

  async getCollarDevices() {
    const allTelemetry = await prisma.collarTelemetry.findMany({
      orderBy: { recordedAt: 'desc' }
    });

    // Group by deviceId to get latest location, battery, and online status
    const deviceMap = new Map<string, {
      deviceId: string;
      animalId: string;
      lastLatitude: number;
      lastLongitude: number;
      lastRecordedAt: Date;
      batteryPercent: number | null;
      accuracyMeters: number | null;
      totalReadings: number;
      isOnline: boolean;
      status: 'ONLINE' | 'OFFLINE';
      batteryStatus: 'GOOD' | 'WARNING' | 'CRITICAL' | 'UNKNOWN';
      nearestRiskZone: { zoneName: string; distanceKm: number; inside: boolean } | null;
    }>();

    const now = Date.now();
    const OFFLINE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

    for (const record of allTelemetry) {
      if (!deviceMap.has(record.deviceId)) {
        const lastTime = new Date(record.recordedAt).getTime();
        const isOnline = (now - lastTime) <= OFFLINE_THRESHOLD_MS;
        const bat = record.batteryPercent;
        let batteryStatus: 'GOOD' | 'WARNING' | 'CRITICAL' | 'UNKNOWN' = 'UNKNOWN';
        if (bat !== null && bat !== undefined) {
          if (bat <= 20) batteryStatus = 'CRITICAL';
          else if (bat <= 50) batteryStatus = 'WARNING';
          else batteryStatus = 'GOOD';
        }

        deviceMap.set(record.deviceId, {
          deviceId: record.deviceId,
          animalId: record.animalId,
          lastLatitude: record.latitude,
          lastLongitude: record.longitude,
          lastRecordedAt: record.recordedAt,
          batteryPercent: record.batteryPercent,
          accuracyMeters: record.accuracyMeters,
          totalReadings: 1,
          isOnline,
          status: isOnline ? 'ONLINE' : 'OFFLINE',
          batteryStatus,
          nearestRiskZone: findNearestRiskZone(record.latitude, record.longitude)
        });
      } else {
        const entry = deviceMap.get(record.deviceId)!;
        entry.totalReadings += 1;
      }
    }

    return Array.from(deviceMap.values());
  }

  async getCollarTelemetryHistory(deviceId: string) {
    return prisma.collarTelemetry.findMany({
      where: { OR: [{ deviceId }, { animalId: deviceId }] },
      orderBy: { recordedAt: 'desc' },
      take: 100
    });
  }

  async getCollarStats() {
    const devices = await this.getCollarDevices();
    const totalDevices = devices.length;
    const onlineDevices = devices.filter(d => d.isOnline).length;
    const offlineDevices = totalDevices - onlineDevices;
    const lowBatteryDevices = devices.filter(d => d.batteryPercent !== null && d.batteryPercent <= 20).length;
    const insideRiskZone = devices.filter(d => d.nearestRiskZone?.inside).length;

    return {
      totalDevices,
      onlineDevices,
      offlineDevices,
      lowBatteryDevices,
      insideRiskZone
    };
  }
}

export const collarIngestionService = new CollarIngestionService();
