import { SyncStatus } from '../shared/types/enums';
import { offlineDb, type SyncQueueItem, type OfflineRecord } from './db';

export type { SyncQueueItem };
export type SyncTransport = (item: SyncQueueItem) => Promise<void>;

export class SyncService {
  private online = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private transports: Map<string, SyncTransport> = new Map();
  private isProcessing = false;
  private rerunRequested = false;

  constructor() {
    if (typeof window !== 'undefined') {
      // A tab can close or reload while a request is in flight. Those queue
      // rows must not remain permanently stuck in SYNCING; they are safe to
      // retry because the server operations use client ids for idempotency.
      void offlineDb.syncQueue
        .where('status')
        .equals(SyncStatus.SYNCING)
        .modify({ status: SyncStatus.PENDING, lastError: 'Recovered after interrupted sync' })
        .then(() => this.processAll())
        .catch(error => console.warn('Unable to recover interrupted sync items:', error));

      window.addEventListener('online', () => {
        this.online = true;
        void this.processAll();
      });
      window.addEventListener('offline', () => {
        this.online = false;
        void offlineDb.syncQueue.where('status').equals(SyncStatus.SYNCING).modify({ status: SyncStatus.PENDING });
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
    const existing = await offlineDb.syncQueue
      .where('entity').equals(item.entity)
      .filter(queueItem => queueItem.operation === item.operation && queueItem.clientId === item.clientId && queueItem.status !== SyncStatus.SYNCED)
      .first();
    if (existing?.id !== undefined) return existing.id;
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
    if (!this.online) return;
    if (this.isProcessing) {
      // Items queued during a run were not in its snapshot; run once more afterwards.
      this.rerunRequested = true;
      return;
    }
    this.isProcessing = true;
    this.rerunRequested = false;

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
          const isNetworkFailure = this.isNetworkFailure(error);
          await offlineDb.syncQueue.update(item.id, {
            // A lost connection is expected during field work. Keep the
            // action pending so it is retried automatically when connectivity
            // returns. Only server/application errors become FAILED.
            status: isNetworkFailure ? SyncStatus.PENDING : SyncStatus.FAILED,
            attempts: (item.attempts || 0) + 1,
            lastError: error instanceof Error ? error.message : 'Sync transport failure'
          });
          if (isNetworkFailure && navigator.onLine === false) {
            this.online = false;
            break;
          }
        }
      }
      if (typeof window !== 'undefined' && items.length > 0) {
        window.dispatchEvent(new CustomEvent('sync-completed'));
      }
    } catch (err) {
      console.warn('SyncService batch execution error:', err);
    } finally {
      this.isProcessing = false;
      if (this.rerunRequested) void this.processAll();
    }
  }

  private isNetworkFailure(error: unknown): boolean {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
    const axiosError = error as { response?: unknown; code?: string };
    if (axiosError?.code === 'ERR_NETWORK' || axiosError?.code === 'ECONNABORTED') return true;
    // Axios network failures have no response; HTTP 5xx/429 are retryable too.
    if (!axiosError?.response) return true;
    const status = (axiosError.response as { status?: number })?.status;
    return status === 408 || status === 429 || (typeof status === 'number' && status >= 500);
  }
}

export const syncService = new SyncService();
