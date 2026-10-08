import { http } from '../../../shared/api/http';
import type { CollarDevice, CollarStats, CollarTelemetry } from '../types/collar';

export const collarApi = {
  async getCollarDevices(): Promise<{ devices: CollarDevice[]; stats: CollarStats }> {
    const res = await http.get('/device-ingestion/collars');
    return {
      devices: res.data.data,
      stats: res.data.stats
    };
  },

  async getCollarTelemetryHistory(deviceId: string): Promise<CollarTelemetry[]> {
    const res = await http.get(`/device-ingestion/collars/${encodeURIComponent(deviceId)}/telemetry`);
    return res.data.data;
  },

  async ingestCollarLocation(payload: {
    eventId: string;
    deviceId: string;
    animalId: string;
    latitude: number;
    longitude: number;
    recordedAt: string;
    batteryPercent?: number;
    accuracyMeters?: number;
  }, apiKey: string): Promise<any> {
    const res = await http.post('/device-ingestion/collar-location', payload, {
      headers: {
        'x-collar-api-key': apiKey
      }
    });
    return res.data;
  }
};
