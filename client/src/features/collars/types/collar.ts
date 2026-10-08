export interface CollarDevice {
  deviceId: string;
  animalId: string;
  lastLatitude: number;
  lastLongitude: number;
  lastRecordedAt: string;
  batteryPercent: number | null;
  accuracyMeters: number | null;
  totalReadings: number;
  isOnline: boolean;
  status: 'ONLINE' | 'OFFLINE';
  batteryStatus: 'GOOD' | 'WARNING' | 'CRITICAL' | 'UNKNOWN';
  nearestRiskZone: {
    zoneName: string;
    distanceKm: number;
    inside: boolean;
  } | null;
}

export interface CollarTelemetry {
  id: string;
  eventId: string;
  deviceId: string;
  animalId: string;
  latitude: number;
  longitude: number;
  recordedAt: string;
  batteryPercent: number | null;
  accuracyMeters: number | null;
  receivedAt: string;
  alertCreated: boolean;
}

export interface CollarStats {
  totalDevices: number;
  onlineDevices: number;
  offlineDevices: number;
  lowBatteryDevices: number;
  insideRiskZone: number;
}
