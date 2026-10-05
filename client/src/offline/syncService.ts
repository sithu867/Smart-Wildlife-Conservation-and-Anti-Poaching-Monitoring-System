import { SyncStatus } from '../shared/types/enums';
import { offlineDb, type SyncQueueItem, type OfflineRecord } from './db';

export type { SyncQueueItem };
export type SyncTransport = (item: SyncQueueItem) => Promise<void>;

export class SyncService {
  private online = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private transports: Map<string, SyncTransport> = new Map();
  private isProcessing = false;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.online = true;
        void this.processAll();
      });
      window.addEventListener('offline', () => {
        this.online = false;
      });
    }
  }

  public registerTransport(entity: string, transport: SyncTransport) {
    this.transports.set(entity, transport);
  }

  public getIsOnline(): boolean {
    return this.online;
  }

  public async retryFailed(): Promise<void> {
    await offlineDb.syncQueue
      .where('status')
      .equals(SyncStatus.FAILED)
      .modify({ status: SyncStatus.PENDING, lastError: undefined });
    await this.processAll();
  }

  public async getQueueCounts(entity?: string): Promise<{ pending: number; syncing: number; failed: number }> {
    const items = entity
      ? await offlineDb.syncQueue.where('entity').equals(entity).toArray()
      : await offlineDb.syncQueue.toArray();
    return {
      pending: items.filter(item => item.status === SyncStatus.PENDING).length,
      syncing: items.filter(item => item.status === SyncStatus.SYNCING).length,
      failed: items.filter(item => item.status === SyncStatus.FAILED).length
    };
  }

  async enqueue(item: Omit<SyncQueueItem, 'status' | 'attempts' | 'createdAt'>) {
    const id = await offlineDb.syncQueue.add({
      ...item,
      status: SyncStatus.PENDING,
      attempts: 0,
      createdAt: new Date().toISOString()
    });

    if (this.online) {
      void this.processAll();
    }
    return id;
  }

  async processAll() {
    if (!this.online || this.isProcessing) return;
    this.isProcessing = true;

    try {
      const items = await offlineDb.syncQueue
        .where('status')
        .anyOf(SyncStatus.PENDING, SyncStatus.FAILED)
        .toArray();

      for (const item of items) {
        if (item.id === undefined) continue;
        const transport = this.transports.get(item.entity);
        if (!transport) continue;

        await offlineDb.syncQueue.update(item.id, { status: SyncStatus.SYNCING });

        try {
          await transport(item);
          await offlineDb.syncQueue.update(item.id, { status: SyncStatus.SYNCED });
        } catch (error) {
          await offlineDb.syncQueue.update(item.id, {
            status: SyncStatus.FAILED,
            attempts: (item.attempts || 0) + 1,
            lastError: error instanceof Error ? error.message : 'Sync transport failure'
          });
        }
      }
    } catch (err) {
      console.warn('SyncService batch execution error:', err);
    } finally {
      this.isProcessing = false;
    }
  }
}

export const syncService = new SyncService();
