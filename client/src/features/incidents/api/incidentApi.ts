/**
 * UC-B incident API client - the only place the app talks to /api/incidents.
 *
 * Offline-first: a report that cannot reach the server is saved in IndexedDB (offlineDb.incidents) as PENDING and
 * queued in offlineDb.syncQueue; syncService sends it when the device is back online (see registerTransport below).
 * Server answers (4xx/5xx with a body) are surfaced as ApiError with the server's `code`, never queued.
 *
 *  - CREATE  createIncident, syncIncidentPayload (offline queue), retrySyncIncident (manual retry)
 *  - READ    getMyIncidents, getIncidentById
 *  - UPDATE  updateIncident
 *  - DELETE  deleteIncident (withdraw), restoreIncident (undo), discardLocalDraft (unsynced drafts)
 */
import { http } from '../../../shared/api/http';
import { ApiError, toApiError } from '../../../shared/api/apiError';
import { offlineDb, type OfflineRecord } from '../../../offline/db';
import { syncService } from '../../../offline/syncService';
import { SyncStatus, IncidentStatus, LocationSource } from '../../../shared/types/enums';
import type { ConservationIncident, CreateIncidentPayload, DeleteIncidentPayload, UpdateIncidentPayload } from '../types/incident';

/** Keeps the device copy of a report in step with the server's latest version (used after create/edit/delete). */
async function cacheSyncedIncident(incident: ConservationIncident): Promise<void> {
  try {
    const local = await findLocalIncidentByRemoteId(incident._id);
    const record = {
      remoteId: incident._id,
      syncStatus: SyncStatus.SYNCED,
      createdAt: incident.reportedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      payload: incident
    };
    if (local?.id !== undefined) {
      await offlineDb.incidents.update(local.id, record);
    } else {
      await offlineDb.incidents.put(record);
    }
  } catch (dbErr) {
    console.warn('Could not cache incident to local storage:', dbErr);
  }
}

/** Finds the device copy of a report by server id or client id (offline reports only have a client id). */
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
  /**
   * CREATE - submits a new report. Online: returns the server's report (cached as SYNCED).
   * No connection: saves it on the device as PENDING, queues it for sync and returns the local copy.
   * A server error (e.g. validation) is thrown as ApiError so the ranger can fix it.
   */
  async createIncident(payload: CreateIncidentPayload): Promise<ConservationIncident> {
    const clientIncidentId = payload.clientIncidentId || `inc-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    // The moment the ranger submitted - captured before the network attempt, which can take a long time to fail
    const reportedAt = payload.reportedAt || new Date().toISOString();
    // Online the server's clock is authoritative, so the device time is only sent when the report is synced later
    const { reportedAt: _deviceTime, ...fullPayload } = { ...payload, clientIncidentId };

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
      // The server answered with an error: surface it instead of queueing invalid data offline
      const apiError = toApiError(error);
      if (apiError) throw apiError;

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
          timestamp: reportedAt,
          source: payload.locationSource || LocationSource.GPS
        },
        reportedBy: 'R-101',
        rangerName: 'Ranger John',
        reportedAt,
        patrolSession: payload.patrolSessionId,
        parkId: payload.parkId,
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

  /**
   * READ - the ranger's reports for the history page. Flushes the sync queue first, then merges the server list
   * with unsynced drafts from the device (offline: the cached copies are shown instead).
   */
  async getMyIncidents(): Promise<ConservationIncident[]> {
    let remoteIncidents: ConservationIncident[] = [];
    let remoteFetchSucceeded = false;
    let serverAnswered = false;
    if (syncService.getIsOnline()) {
      await syncService.processAll();
    }

    try {
      const response = await http.get('/incidents/my');
      if (response.data?.success) {
        remoteFetchSucceeded = true;
        remoteIncidents = response.data.data;
        serverAnswered = true;

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
      }
    } catch (error) {
      console.warn('Network request failed for getMyIncidents, retrieving from local offline db:', error);
    }

    // Retrieve cached local incidents (including pending/failed offline items)
    let cached: OfflineRecord[] = [];
    try {
      if (typeof indexedDB !== 'undefined') {
        cached = await offlineDb.incidents.toArray();
      }
    } catch (e) {
      console.warn('Error reading local offline database:', e);
    }

    // When the server responded successfully, its result is authoritative.
    // Remove stale synced browser-cache records that no longer exist remotely,
    // but preserve pending/failed offline reports for synchronization.
    if (remoteFetchSucceeded) {
      const remoteKeys = new Set(remoteIncidents.flatMap(inc => [inc._id, inc.clientIncidentId].filter(Boolean)));
      const staleCached = cached.filter(record => {
        const incident = record.payload as ConservationIncident;
        const key = incident?.clientIncidentId || incident?._id;
        return record.syncStatus === SyncStatus.SYNCED && !!key && !remoteKeys.has(key);
      });
      if (staleCached.length > 0) {
        await offlineDb.transaction('rw', [offlineDb.incidents, offlineDb.syncQueue], async () => {
          for (const record of staleCached) {
            if (record.id !== undefined) {
              await offlineDb.incidents.delete(record.id);
              await offlineDb.syncQueue.where('entity').equals('INCIDENT').filter(item => item.recordId === record.id).delete();
            }
          }
        });
        cached = cached.filter(record => !staleCached.some(stale => stale.id === record.id));
      }
    }

    // Clean up repeated demo/test copies of the same SNARE report while
    // retaining the newest local copy. Genuine reports with other content
    // are not affected, and unsynced reports are never removed: they exist only on this device.
    const duplicateSnareDescription = 'Wire snare found attached to acacia tree near waterhole.';
    const duplicateSnareRecords = cached
      .filter(record => {
        const incident = record.payload as ConservationIncident;
        return (
          record.syncStatus === SyncStatus.SYNCED &&
          incident?.incidentType === 'SNARE' &&
          incident.description?.trim() === duplicateSnareDescription
        );
      })
      .sort((a, b) => new Date((b.payload as ConservationIncident).reportedAt).getTime() - new Date((a.payload as ConservationIncident).reportedAt).getTime());

    if (duplicateSnareRecords.length > 1) {
      const duplicates = duplicateSnareRecords.slice(1).filter(record => record.id !== undefined);
      await offlineDb.transaction('rw', [offlineDb.incidents, offlineDb.syncQueue], async () => {
        for (const duplicate of duplicates) {
          if (duplicate.id !== undefined) await offlineDb.incidents.delete(duplicate.id);
          await offlineDb.syncQueue
            .where('entity').equals('INCIDENT')
            .filter(item => item.recordId === duplicate.id)
            .delete();
        }
      });
      cached = cached.filter(record => !duplicates.some(duplicate => duplicate.id === record.id));
    }

    const itemsMap = new Map<string, ConservationIncident>();

    // Add remote incidents
    for (const inc of remoteIncidents) {
      const key = inc.clientIncidentId || inc._id;
      itemsMap.set(key, inc);
    }

    // Merge local cached items (prioritizing local pending/failed status if unsynced)
    for (const c of cached) {
      const inc = c.payload as ConservationIncident;
      if (!inc || inc.deletedAt) continue;
      const key = inc.clientIncidentId || inc._id;
      const isUnsynced = c.syncStatus === SyncStatus.PENDING || c.syncStatus === SyncStatus.FAILED;
      // When the server answered it is the source of truth for synced reports (e.g. ones withdrawn on another device);
      // only unsynced local drafts are added on top. Offline, the cached copies are all we have.
      if (isUnsynced || (!serverAnswered && !itemsMap.has(key))) {
        itemsMap.set(key, { ...inc, syncStatus: c.syncStatus });
      }
    }

    return Array.from(itemsMap.values()).sort(
      (a, b) => new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime()
    );
  },

  /** READ - one report (used by the edit page). Falls back to the device copy only when offline. */
  async getIncidentById(incidentId: string): Promise<ConservationIncident> {
    try {
      const response = await http.get(`/incidents/${incidentId}`);
      if (response.data?.success) {
        return response.data.data;
      }
    } catch (error) {
      // 403/404 etc. are real answers from the server; only fall back to the device copy when offline
      const apiError = toApiError(error);
      if (apiError) throw apiError;

      console.warn('Network failed for getIncidentById, fetching from local storage:', error);
      const local = await findLocalIncidentByRemoteId(incidentId);
      if (local && local.payload) {
        return { ...(local.payload as ConservationIncident), syncStatus: local.syncStatus };
      }
    }
    throw new ApiError('Conservation incident report not found.', 404, 'INCIDENT_NOT_FOUND');
  },

  /** Withdraws (soft-deletes) a synced report. Requires a connection for now (offline deletes come with the offline queue step). */
  async deleteIncident(incidentId: string, payload: DeleteIncidentPayload): Promise<ConservationIncident> {
    try {
      const response = await http.delete(`/incidents/${incidentId}`, { data: payload });
      const withdrawn: ConservationIncident = response.data.data;
      await cacheSyncedIncident(withdrawn);
      return withdrawn;
    } catch (error) {
      const apiError = toApiError(error);
      if (apiError) throw apiError;
      throw new ApiError('Deleting a report needs an internet connection. Try again when you are back online.', 0, 'OFFLINE');
    }
  },

  /** Undo of a withdrawal. */
  async restoreIncident(incidentId: string): Promise<ConservationIncident> {
    try {
      const response = await http.post(`/incidents/${incidentId}/restore`, {
        restoredAt: new Date().toISOString(),
        clientRestoreId: `restore-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
      });
      const restored: ConservationIncident = response.data.data;
      await cacheSyncedIncident(restored);
      return restored;
    } catch (error) {
      const apiError = toApiError(error);
      if (apiError) throw apiError;
      throw new ApiError('Restoring a report needs an internet connection. Try again when you are back online.', 0, 'OFFLINE');
    }
  },

  /**
   * Discards a report that never reached the server: removes the device copy and its queued upload.
   * Refused while the upload is in flight, because the server may already be creating it.
   */
  async discardLocalDraft(clientIncidentId: string): Promise<void> {
    const local = await findLocalIncidentByRemoteId(clientIncidentId);
    if (!local || local.id === undefined) return;
    if (local.syncStatus === SyncStatus.SYNCED) {
      throw new ApiError('This report has already synced. Delete it instead.', 0, 'ALREADY_SYNCED');
    }

    const queueItems = await offlineDb.syncQueue.where('entity').equals('INCIDENT').filter(item => item.recordId === local.id).toArray();
    if (queueItems.some(item => item.status === SyncStatus.SYNCING)) {
      throw new ApiError('This report is uploading right now. Wait a moment, then delete it.', 0, 'SYNC_IN_PROGRESS');
    }

    await offlineDb.transaction('rw', [offlineDb.incidents, offlineDb.syncQueue], async () => {
      await offlineDb.syncQueue.bulkDelete(queueItems.map(item => item.id!).filter(id => id !== undefined));
      await offlineDb.incidents.delete(local.id!);
    });
  },

  /** Saves edits to a synced report. Editing currently requires a connection (offline edits come in a later step). */
  async updateIncident(incidentId: string, payload: UpdateIncidentPayload): Promise<ConservationIncident> {
    try {
      const response = await http.patch(`/incidents/${incidentId}`, payload);
      const updated: ConservationIncident = response.data.data;
      await cacheSyncedIncident(updated);
      return updated;
    } catch (error) {
      const apiError = toApiError(error);
      if (apiError) throw apiError;
      throw new ApiError(
        'Saving changes needs an internet connection. Your edits are still on this screen, so try again when you are back online.',
        0,
        'OFFLINE'
      );
    }
  },

  /**
   * CREATE (offline sync) - sends a queued offline report to the server. Same clientIncidentId, so a retry never
   * creates a duplicate; the original reportedAt keeps the real report time. Marks the device copy SYNCED/FAILED.
   */
  async syncIncidentPayload(payload: unknown): Promise<ConservationIncident> {
    const inc = payload as ConservationIncident;
    const local = await findLocalIncidentByRemoteId(inc._id);
    try {
      const response = await http.post('/incidents', {
        clientIncidentId: inc.clientIncidentId || inc._id,
        // Keep the real time the ranger reported it, not the time the device came back online
        reportedAt: inc.reportedAt,
        incidentType: inc.incidentType,
        parkId: inc.parkId || undefined,
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
      if (local && local.id) {
        await offlineDb.incidents.update(local.id, {
          remoteId: synced._id,
          syncStatus: SyncStatus.SYNCED,
          updatedAt: new Date().toISOString(),
          payload: { ...synced, syncStatus: SyncStatus.SYNCED }
        });
      }

      return synced;
    } catch (error) {
      if (local && local.id) {
        await offlineDb.incidents.update(local.id, {
          syncStatus: SyncStatus.FAILED,
          updatedAt: new Date().toISOString(),
          payload: { ...inc, syncStatus: SyncStatus.FAILED }
        });
      }
      throw error;
    }
  },

  /** "Retry Sync" button on the history page: re-sends one PENDING/FAILED report now and updates its queue items. */
  async retrySyncIncident(clientIncidentId: string): Promise<ConservationIncident> {
    const localRecord = await findLocalIncidentByRemoteId(clientIncidentId);
    if (!localRecord || !localRecord.payload) {
      throw new Error('Local incident record not found for sync retry.');
    }

    const queueItems = localRecord.id
      ? await offlineDb.syncQueue
          .where('entity')
          .equals('INCIDENT')
          .filter(item => item.recordId === localRecord.id)
          .toArray()
      : [];

    for (const item of queueItems) {
      if (item.id !== undefined) {
        await offlineDb.syncQueue.update(item.id, { status: SyncStatus.SYNCING });
      }
    }

    try {
      const synced = await this.syncIncidentPayload(localRecord.payload);
      for (const item of queueItems) {
        if (item.id !== undefined) {
          await offlineDb.syncQueue.update(item.id, { status: SyncStatus.SYNCED, lastError: undefined });
        }
      }
      return synced;
    } catch (error) {
      for (const item of queueItems) {
        if (item.id !== undefined) {
          await offlineDb.syncQueue.update(item.id, {
            status: SyncStatus.FAILED,
            attempts: item.attempts + 1,
            lastError: error instanceof Error ? error.message : 'Incident sync failed'
          });
        }
      }
      throw error;
    }
  }
};

// Register transport with SyncService
// Lets the background sync service send queued INCIDENT items (offline reports) when the device is online
syncService.registerTransport('INCIDENT', async item => {
  if (item.payload) {
    await incidentApi.syncIncidentPayload(item.payload);
  }
});
