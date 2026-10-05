import { http } from '../../../shared/api/http';
import { offlineDb } from '../../../offline/db';
import { syncService } from '../../../offline/syncService';
import {
  SyncStatus,
  AlertStatus,
  AlertSource,
  ConflictAlertType,
  AlertSeverity
} from '../../../shared/types/enums';
import type {
  WildlifeConflictAlert,
  SimulateCollarInput,
  CommunityReportInput,
  AddResponseInput,
  ResolveAlertInput
} from '../types/conflictAlert';

const DEFAULT_SEED_ALERTS: WildlifeConflictAlert[] = [
  {
    _id: 'alert-seed-001',
    sourceEventId: 'evt-seed-collar-01',
    source: AlertSource.COLLAR,
    alertType: ConflictAlertType.DANGEROUS_WILDLIFE_ACTIVITY,
    severity: AlertSeverity.HIGH,
    status: AlertStatus.OPEN,
    location: {
      latitude: -2.1523,
      longitude: 34.8214,
      timestamp: new Date().toISOString(),
      source: 'GPS' as any
    },
    description: 'Tracked bull elephant ELEPHANT-001 breached the northern buffer fence.',
    animalId: 'ELEPHANT-001',
    responses: [],
    createdAt: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    _id: 'alert-seed-002',
    sourceEventId: 'evt-seed-comm-02',
    source: AlertSource.COMMUNITY_REPORT,
    alertType: ConflictAlertType.CROP_RAID,
    severity: AlertSeverity.MEDIUM,
    status: AlertStatus.ACKNOWLEDGED,
    location: {
      latitude: -2.189,
      longitude: 34.841,
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
      source: 'MANUAL' as any
    },
    description: 'Local farmer reported hippo pod feeding in maize field near river bank.',
    reporterName: 'Mzee Juma',
    acknowledgedBy: 'R-101',
    acknowledgedName: 'Ranger John',
    acknowledgedAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    responses: [],
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    updatedAt: new Date().toISOString()
  }
];

async function safeDexiePut(alert: WildlifeConflictAlert, syncStatus: SyncStatus) {
  if (typeof indexedDB === 'undefined') return;
  try {
    const alertWithSync = { ...alert, syncStatus };
    const existing = await offlineDb.conflictAlerts
      .filter(item => item.remoteId === alert._id || (item.payload as any)?._id === alert._id)
      .first();
    if (existing && existing.id) {
      await offlineDb.conflictAlerts.update(existing.id, {
        syncStatus,
        updatedAt: alert.updatedAt || new Date().toISOString(),
        payload: alertWithSync
      });
    } else {
      await offlineDb.conflictAlerts.add({
        remoteId: alert._id,
        syncStatus,
        createdAt: alert.createdAt || new Date().toISOString(),
        updatedAt: alert.updatedAt || new Date().toISOString(),
        payload: alertWithSync
      });
    }
  } catch (err) {
    console.warn('Dexie put ignored in test/unsupported environment:', err);
  }
}

async function safeDexieUpdate(alertId: string, alert: WildlifeConflictAlert, syncStatus: SyncStatus) {
  if (typeof indexedDB === 'undefined') return;
  try {
    const alertWithSync = { ...alert, syncStatus };
    const cached = await offlineDb.conflictAlerts
      .filter(item => item.remoteId === alertId || (item.payload as any)?._id === alertId)
      .first();
    if (cached && cached.id) {
      await offlineDb.conflictAlerts.update(cached.id, {
        syncStatus,
        updatedAt: new Date().toISOString(),
        payload: alertWithSync
      });
    } else {
      await offlineDb.conflictAlerts.add({
        remoteId: alertId,
        syncStatus,
        createdAt: alert.createdAt || new Date().toISOString(),
        updatedAt: alert.updatedAt || new Date().toISOString(),
        payload: alertWithSync
      });
    }
  } catch (err) {
    console.warn('Dexie update ignored in test/unsupported environment:', err);
  }
}

async function safeDexieGetArray(): Promise<WildlifeConflictAlert[]> {
  if (typeof indexedDB === 'undefined') return [];
  try {
    const cached = await offlineDb.conflictAlerts.toArray();
    const map = new Map<string, WildlifeConflictAlert>();
    for (const c of cached) {
      const alert = c.payload as WildlifeConflictAlert;
      if (alert && alert._id) {
        map.set(alert._id, { ...alert, syncStatus: c.syncStatus });
      }
    }
    return Array.from(map.values());
  } catch (err) {
    return [];
  }
}

export const conflictAlertApi = {
  async getAlerts(filters?: { status?: string; severity?: string; alertType?: string }): Promise<WildlifeConflictAlert[]> {
    try {
      const response = await http.get('/conflict-alerts', { params: filters });
      if (response.data?.success) {
        const alerts: WildlifeConflictAlert[] = response.data.data;
        for (const alert of alerts) {
          await safeDexiePut(alert, SyncStatus.SYNCED);
        }
        return alerts;
      }
    } catch (error) {
      console.warn('Network request failed for conflict alerts, retrieving from local cache:', error);
    }

    let list = await safeDexieGetArray();
    if (list.length === 0) throw new Error('No cached conflict alerts are available offline.');

    if (filters?.status) list = list.filter(a => a.status === filters.status);
    if (filters?.severity) list = list.filter(a => a.severity === filters.severity);
    if (filters?.alertType) list = list.filter(a => a.alertType === filters.alertType);

    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  async getAlertById(alertId: string): Promise<WildlifeConflictAlert> {
    try {
      const response = await http.get(`/conflict-alerts/${alertId}`);
      if (response.data?.success) {
        return response.data.data;
      }
    } catch (error) {
      console.warn('Network failed retrieving alert details, checking offline store:', error);
    }

    const cached = await safeDexieGetArray();
    const alert = cached.find(a => a._id === alertId);
    if (alert) return alert;

    throw new Error('Wildlife conflict alert not found.');
  },

  async acknowledgeAlert(alertId: string): Promise<WildlifeConflictAlert> {
    const clientAcknowledgementId = crypto.randomUUID();
    try {
      const response = await http.post(`/conflict-alerts/${alertId}/acknowledge`, { clientAcknowledgementId });
      const updatedAlert: WildlifeConflictAlert = response.data.data;

      await safeDexieUpdate(alertId, updatedAlert, SyncStatus.SYNCED);
      return updatedAlert;
    } catch (error) {
      console.warn('Network failed on acknowledgeAlert, applying local state update:', error);

      const alert = await this.getAlertById(alertId);
      if (alert.status === AlertStatus.RESOLVED) {
        throw new Error('Resolved alert cannot be acknowledged.');
      }

      const updatedAlert: WildlifeConflictAlert = {
        ...alert,
        status: AlertStatus.ACKNOWLEDGED,
        acknowledgedBy: 'R-101',
        acknowledgedName: 'Ranger John',
        acknowledgedAt: new Date().toISOString(),
        clientAcknowledgementId,
        updatedAt: new Date().toISOString()
      };

      await safeDexieUpdate(alertId, updatedAlert, SyncStatus.PENDING);
      await enqueueAction('ACKNOWLEDGE_ALERT', alertId, { alertId, clientAcknowledgementId });
      return updatedAlert;
    }
  },

  async addResponse(alertId: string, input: AddResponseInput): Promise<WildlifeConflictAlert> {
    try {
      const response = await http.post(`/conflict-alerts/${alertId}/responses`, input);
      const updatedAlert: WildlifeConflictAlert = response.data.data;

      await safeDexieUpdate(alertId, updatedAlert, SyncStatus.SYNCED);
      return updatedAlert;
    } catch (error) {
      console.warn('Network failed on addResponse, recording local response:', error);

      const alert = await this.getAlertById(alertId);
      if (alert.status === AlertStatus.RESOLVED) {
        throw new Error('Resolved alert cannot accept new responses.');
      }
      if (alert.status === AlertStatus.OPEN) {
        throw new Error('Alert must be acknowledged before recording response.');
      }

      const now = new Date().toISOString();
      const clientResponseId = crypto.randomUUID();
      const newResp = {
        responseId: clientResponseId,
        clientResponseId,
        responderId: 'R-101',
        responderName: 'Ranger John',
        action: input.action,
        notes: input.notes,
        respondedAt: now,
        outcome: input.outcome
      };

      const updatedAlert: WildlifeConflictAlert = {
        ...alert,
        status: input.markResolved ? AlertStatus.RESOLVED : AlertStatus.RESPONDING,
        responses: [...(alert.responses || []), newResp],
        resolvedBy: input.markResolved ? 'R-101' : alert.resolvedBy,
        resolvedName: input.markResolved ? 'Ranger John' : alert.resolvedName,
        resolvedAt: input.markResolved ? now : alert.resolvedAt,
        resolutionNotes: input.markResolved ? input.resolutionNotes || input.notes : alert.resolutionNotes,
        updatedAt: now
      };

      await safeDexieUpdate(alertId, updatedAlert, SyncStatus.PENDING);
      await enqueueAction('ADD_RESPONSE', alertId, { alertId, input: { ...input, clientResponseId } });
      return updatedAlert;
    }
  },

  async resolveAlert(alertId: string, input: ResolveAlertInput): Promise<WildlifeConflictAlert> {
    const clientActionId = crypto.randomUUID();
    const request = { ...input, clientActionId };
    try {
      const response = await http.post(`/conflict-alerts/${alertId}/resolve`, request);
      const updatedAlert: WildlifeConflictAlert = response.data.data;

      await safeDexieUpdate(alertId, updatedAlert, SyncStatus.SYNCED);
      return updatedAlert;
    } catch (error) {
      console.warn('Network failed on resolveAlert, updating state locally:', error);

      const alert = await this.getAlertById(alertId);
      if (alert.status === AlertStatus.RESOLVED) {
        throw new Error('Alert is already resolved.');
      }

      const now = new Date().toISOString();
      const updatedAlert: WildlifeConflictAlert = {
        ...alert,
        status: AlertStatus.RESOLVED,
        resolvedBy: 'R-101',
        resolvedName: 'Ranger John',
        resolvedAt: now,
        resolutionNotes: input.resolutionNotes,
        clientResolutionId: clientActionId,
        updatedAt: now
      };

      await safeDexieUpdate(alertId, updatedAlert, SyncStatus.PENDING);
      await enqueueAction('RESOLVE_ALERT', alertId, { alertId, input: request });
      return updatedAlert;
    }
  },

  async simulateCollar(input: SimulateCollarInput): Promise<WildlifeConflictAlert> {
    const response = await http.post('/conflict-alerts/simulate-collar', input);
    return response.data.data;
  },

  async submitCommunityReport(input: CommunityReportInput): Promise<WildlifeConflictAlert> {
    const response = await http.post('/conflict-alerts/community-report', input);
    return response.data.data;
  }
};

async function enqueueAction(operation: 'ACKNOWLEDGE_ALERT' | 'ADD_RESPONSE' | 'RESOLVE_ALERT', alertId: string, payload: unknown) {
  await syncService.enqueue({ entity: 'conflict-alerts', operation, recordId: 0, clientId: typeof payload === 'object' && payload !== null && 'input' in payload ? String((payload as { input?: { clientResponseId?: string } }).input?.clientResponseId ?? alertId) : alertId, payload });
}

syncService.registerTransport('conflict-alerts', async item => {
  const payload = item.payload as { alertId: string; input?: AddResponseInput | ResolveAlertInput };
  let response: any;
  if (item.operation === 'ACKNOWLEDGE_ALERT') {
    response = await http.post(`/conflict-alerts/${payload.alertId}/acknowledge`, payload);
  } else if (item.operation === 'ADD_RESPONSE') {
    response = await http.post(`/conflict-alerts/${payload.alertId}/responses`, payload.input);
  } else if (item.operation === 'RESOLVE_ALERT') {
    response = await http.post(`/conflict-alerts/${payload.alertId}/resolve`, payload.input);
  }
  if (response?.data?.data) {
    await safeDexieUpdate(payload.alertId, response.data.data, SyncStatus.SYNCED);
  }
});
