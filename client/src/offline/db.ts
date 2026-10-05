import Dexie, { type Table } from 'dexie';
import { SyncStatus } from '../shared/types/enums';

export type OfflineRecord = {
  id?: number;
  remoteId?: string;
  syncStatus: SyncStatus;
  createdAt: string;
  updatedAt: string;
  payload: unknown;
};

export type SyncQueueItem = {
  id?: number;
  entity: string;
  operation: 'CREATE' | 'UPDATE' | 'DELETE' | 'ACKNOWLEDGE_ALERT' | 'ADD_RESPONSE' | 'RESOLVE_ALERT';
  recordId: number;
  clientId?: string;
  status: SyncStatus;
  attempts: number;
  lastError?: string;
  createdAt: string;
  payload?: unknown;
};

export class WildlifeDatabase extends Dexie {
  patrolSessions!: Table<OfflineRecord, number>;
  waypoints!: Table<OfflineRecord, number>;
  incidents!: Table<OfflineRecord, number>;
  conflictResponses!: Table<OfflineRecord, number>;
  conflictAlerts!: Table<OfflineRecord, number>;
  syncQueue!: Table<SyncQueueItem, number>;

  constructor() {
    super('wildlife-guard');
    this.version(2).stores({
      patrolSessions: '++id, remoteId, syncStatus, updatedAt',
      waypoints: '++id, remoteId, syncStatus, updatedAt',
      incidents: '++id, remoteId, syncStatus, updatedAt',
      conflictResponses: '++id, remoteId, syncStatus, updatedAt',
      conflictAlerts: '++id, remoteId, syncStatus, updatedAt',
      syncQueue: '++id, status, entity, createdAt'
    });
  }
}

export const offlineDb = new WildlifeDatabase();
