import { http } from '../../../shared/api/http';
import { offlineDb, type OfflineRecord } from '../../../offline/db';
import { syncService } from '../../../offline/syncService';
import { SyncStatus, IncidentStatus, LocationSource } from '../../../shared/types/enums';
import type { ConservationIncident, CreateIncidentPayload } from '../types/incident';

async function findLocalIncidentByRemoteId(remoteId: string): Promise<OfflineRecord | undefined> {
  try {
    return await offlineDb.incidents
      .filter(
        item =>
          item.remoteId === remoteId ||
          (item.payload as ConservationIncident)?._id === remoteId ||
          (item.payload as ConservationIncident)?.clientIncidentId === remoteId
      )
      .first();
  } catch (error) {
    console.warn('Error querying local store for incident:', error);
    return undefined;
  }
}

export const incidentApi = {
  async createIncident(payload: CreateIncidentPayload): Promise<ConservationIncident> {
    const clientIncidentId = payload.clientIncidentId || `inc-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const fullPayload = { ...payload, clientIncidentId };

    try {
      const response = await http.post('/incidents', fullPayload);
      const incident: ConservationIncident = response.data.data;

      // Save to local offline store as SYNCED
      try {
        await offlineDb.incidents.put({
          remoteId: incident._id,
          syncStatus: SyncStatus.SYNCED,
          createdAt: incident.reportedAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          payload: incident
        });
      } catch (dbErr) {
        console.warn('Could not cache online incident to local storage:', dbErr);
      }

      return incident;
    } catch (error) {
      console.warn('Network request failed for createIncident, storing locally with PENDING sync status:', error);

      const offlineIncident: ConservationIncident = {
        _id: clientIncidentId,
        clientIncidentId,
        incidentType: payload.incidentType,
        otherTypeDescription: payload.otherTypeDescription,
        description: payload.description,
        location: {
          latitude: payload.latitude,
          longitude: payload.longitude,
          timestamp: new Date().toISOString(),
          source: payload.locationSource || LocationSource.GPS
        },
        reportedBy: 'R-101',
        rangerName: 'Ranger John',
        reportedAt: new Date().toISOString(),
        patrolSession: payload.patrolSessionId,
        evidence: payload.evidence.map((ev, idx) => ({
          evidenceId: `evid-${clientIncidentId}-${idx}`,
          imageUrl: ev.imageUrl,
          capturedAt: ev.capturedAt || new Date().toISOString(),
          fileSize: ev.fileSize,
          mimeType: ev.mimeType || 'image/jpeg'
        })),
        status: IncidentStatus.REPORTED,
        syncStatus: SyncStatus.PENDING
      };

      try {
        if (typeof indexedDB !== 'undefined') {
          await offlineDb.transaction('rw', [offlineDb.incidents, offlineDb.syncQueue], async () => {
            const id = await offlineDb.incidents.put({
              remoteId: clientIncidentId,
              syncStatus: SyncStatus.PENDING,
              createdAt: offlineIncident.reportedAt,
              updatedAt: new Date().toISOString(),
              payload: offlineIncident
            });

            await offlineDb.syncQueue.add({
              entity: 'INCIDENT',
              operation: 'CREATE',
              recordId: id,
              status: SyncStatus.PENDING,
              attempts: 0,
              createdAt: new Date().toISOString(),
              payload: offlineIncident
            });
          });

          // Trigger sync processing if network is available
          if (syncService.getIsOnline()) {
            void syncService.processAll();
          }
        }
      } catch (dbErr) {
        console.error('Local storage error creating incident offline:', dbErr);
        throw new Error('Unable to save this incident on the device. Please try again.');
      }

      return offlineIncident;
    }
  },

  async getMyIncidents(): Promise<ConservationIncident[]> {
    try {
      const response = await http.get('/incidents/my');
      if (response.data?.success) {
        const remoteIncidents: ConservationIncident[] = response.data.data;

        for (const inc of remoteIncidents) {
          const local = await findLocalIncidentByRemoteId(inc._id);
          if (!local) {
            await offlineDb.incidents.put({
              remoteId: inc._id,
              syncStatus: SyncStatus.SYNCED,
              createdAt: inc.reportedAt,
              updatedAt: new Date().toISOString(),
              payload: inc
            });
          }
        }
        return remoteIncidents;
      }
    } catch (error) {
      console.warn('Network request failed for getMyIncidents, retrieving from local offline db:', error);
    }

    const cached = await offlineDb.incidents.toArray();
    return cached
      .map(c => c.payload as ConservationIncident)
      .sort((a, b) => new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime());
  },

  async getIncidentById(incidentId: string): Promise<ConservationIncident> {
    try {
      const response = await http.get(`/incidents/${incidentId}`);
      if (response.data?.success) {
        return response.data.data;
      }
    } catch (error) {
      console.warn('Network failed for getIncidentById, fetching from local storage:', error);
      const local = await findLocalIncidentByRemoteId(incidentId);
      if (local && local.payload) {
        return local.payload as ConservationIncident;
      }
    }
    throw new Error('Conservation incident report not found.');
  },

  async syncIncidentPayload(payload: unknown): Promise<ConservationIncident> {
    const inc = payload as ConservationIncident;
    const response = await http.post('/incidents', {
      clientIncidentId: inc.clientIncidentId || inc._id,
      incidentType: inc.incidentType,
      otherTypeDescription: inc.otherTypeDescription,
      description: inc.description,
      latitude: inc.location.latitude,
      longitude: inc.location.longitude,
      locationSource: inc.location.source,
      patrolSessionId: typeof inc.patrolSession === 'object' ? inc.patrolSession?._id : inc.patrolSession,
      evidence: inc.evidence.map(ev => ({
        imageUrl: ev.imageUrl,
        capturedAt: ev.capturedAt,
        fileSize: ev.fileSize,
        mimeType: ev.mimeType
      }))
    });

    const synced: ConservationIncident = response.data.data;

    const local = await findLocalIncidentByRemoteId(inc._id);
    if (local && local.id) {
      await offlineDb.incidents.update(local.id, {
        syncStatus: SyncStatus.SYNCED,
        updatedAt: new Date().toISOString(),
        payload: synced
      });
    }

    return synced;
  },

  async retrySyncIncident(clientIncidentId: string): Promise<ConservationIncident> {
    const localRecord = await findLocalIncidentByRemoteId(clientIncidentId);
    if (!localRecord || !localRecord.payload) {
      throw new Error('Local incident record not found for sync retry.');
    }
    return await this.syncIncidentPayload(localRecord.payload);
  }
};

// Register transport with SyncService
syncService.registerTransport('INCIDENT', async item => {
  if (item.payload) {
    await incidentApi.syncIncidentPayload(item.payload);
  }
});
