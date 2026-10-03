import Dexie, { type Table } from 'dexie';
import { SyncStatus } from '../shared/types/enums';
export type OfflineRecord = { id?: number; remoteId?: string; syncStatus: SyncStatus; createdAt: string; updatedAt: string; payload: unknown };
export type SyncQueueItem = { id?: number; entity: string; operation: 'CREATE' | 'UPDATE' | 'DELETE'; recordId: number; status: SyncStatus; attempts: number; lastError?: string; createdAt: string };
export class WildlifeDatabase extends Dexie { patrolSessions!: Table<OfflineRecord, number>; waypoints!: Table<OfflineRecord, number>; incidents!: Table<OfflineRecord, number>; conflictResponses!: Table<OfflineRecord, number>; syncQueue!: Table<SyncQueueItem, number>; constructor() { super('wildlife-guard'); this.version(1).stores({ patrolSessions: '++id, syncStatus, updatedAt', waypoints: '++id, syncStatus, updatedAt', incidents: '++id, syncStatus, updatedAt', conflictResponses: '++id, syncStatus, updatedAt', syncQueue: '++id, status, entity, createdAt' }); } }
export const offlineDb = new WildlifeDatabase();
