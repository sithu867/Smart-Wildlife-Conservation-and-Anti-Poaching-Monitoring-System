import { SyncService } from './syncService';
import { offlineDb, type SyncQueueItem } from './db';
import { SyncStatus } from '../shared/types/enums';

// Shared offline queue used by UC-A, UC-B and UC-C. Runs against real Dexie on fake-indexeddb.
// Every SyncService adds window listeners that outlive its test, so each test uses its own
// entity name: an older instance never has a transport for a newer test's queue items.

let entityCounter = 0;
let entity: string;

function setNavigatorOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true });
}

/** Creates a service and waits for its start-up recovery pass to finish. */
async function createService(): Promise<SyncService> {
  const processAll = vi.spyOn(SyncService.prototype, 'processAll');
  const service = new SyncService();
  await vi.waitFor(() => expect(processAll).toHaveBeenCalled());
  await processAll.mock.results[0].value;
  processAll.mockRestore();
  return service;
}

function queueItem(overrides: Partial<SyncQueueItem> = {}): SyncQueueItem {
  return {
    entity,
    operation: 'CREATE',
    recordId: 1,
    clientId: `client-${Math.random()}`,
    status: SyncStatus.PENDING,
    attempts: 0,
    createdAt: new Date().toISOString(),
    payload: { value: 1 },
    ...overrides
  };
}

const httpError = (status: number, message = `Request failed with status code ${status}`) =>
  Object.assign(new Error(message), { isAxiosError: true, response: { status, data: {} } });
const noResponseError = (code?: string) => Object.assign(new Error('Network Error'), { isAxiosError: true, code });

beforeEach(async () => {
  entity = `TEST_ENTITY_${++entityCounter}`;
  setNavigatorOnline(true);
  await Promise.all([offlineDb.syncQueue.clear(), offlineDb.incidents.clear()]);
});

afterEach(() => {
  setNavigatorOnline(true);
  vi.restoreAllMocks();
});

describe('enqueue', () => {
  test('stores a PENDING item with the entity, operation, client id and payload', async () => {
    setNavigatorOnline(false);
    const service = await createService();
    const before = Date.now();

    const id = await service.enqueue({ entity, operation: 'UPDATE', recordId: 7, clientId: 'c-1', payload: { status: 'COMPLETED' } });

    const stored = await offlineDb.syncQueue.get(id);
    expect(stored).toMatchObject({ entity, operation: 'UPDATE', recordId: 7, clientId: 'c-1', payload: { status: 'COMPLETED' }, status: SyncStatus.PENDING, attempts: 0 });
    expect(Date.parse(stored!.createdAt)).toBeGreaterThanOrEqual(before);
  });

  test('an unsynced item with the same entity, operation and client id is reused and keeps its first payload', async () => {
    setNavigatorOnline(false);
    const service = await createService();

    const first = await service.enqueue({ entity, operation: 'UPDATE', recordId: 1, clientId: 'same', payload: { v: 1 } });
    const second = await service.enqueue({ entity, operation: 'UPDATE', recordId: 1, clientId: 'same', payload: { v: 2 } });

    expect(second).toBe(first);
    const items = await offlineDb.syncQueue.where('entity').equals(entity).toArray();
    expect(items).toHaveLength(1);
    // Callers that need the newest state must keep it locally (see UC-A/UC-C transports); the queue never merges payloads.
    expect(items[0].payload).toEqual({ v: 1 });
  });

  test('a FAILED item with the same client id is also reused instead of duplicated', async () => {
    setNavigatorOnline(false);
    const service = await createService();
    const failedId = await offlineDb.syncQueue.add(queueItem({ clientId: 'retry-me', operation: 'UPDATE', status: SyncStatus.FAILED }));

    expect(await service.enqueue({ entity, operation: 'UPDATE', recordId: 1, clientId: 'retry-me', payload: {} })).toBe(failedId);
    expect(await offlineDb.syncQueue.where('entity').equals(entity).count()).toBe(1);
  });

  test.each([
    ['a different client id', { clientId: 'other' }],
    ['a different operation', { operation: 'DELETE' as const }],
    ['a different entity', { entity: 'ANOTHER_ENTITY' }]
  ])('%s creates a separate queue item', async (_label, change) => {
    setNavigatorOnline(false);
    const service = await createService();
    const base = { entity, operation: 'UPDATE' as const, recordId: 1, clientId: 'c-1', payload: {} };

    const first = await service.enqueue(base);
    const second = await service.enqueue({ ...base, ...change });

    expect(second).not.toBe(first);
    expect(await offlineDb.syncQueue.count()).toBe(2);
  });

  test('once an item is SYNCED, the same client id queues a new action', async () => {
    setNavigatorOnline(false);
    const service = await createService();
    const syncedId = await offlineDb.syncQueue.add(queueItem({ clientId: 'done', status: SyncStatus.SYNCED }));

    const id = await service.enqueue({ entity, operation: 'CREATE', recordId: 1, clientId: 'done', payload: {} });

    expect(id).not.toBe(syncedId);
    expect((await offlineDb.syncQueue.get(id))?.status).toBe(SyncStatus.PENDING);
  });

  test('enqueueing while online sends the item straight away', async () => {
    const service = await createService();
    const transport = vi.fn().mockResolvedValue(undefined);
    service.registerTransport(entity, transport);

    const id = await service.enqueue({ entity, operation: 'CREATE', recordId: 1, clientId: 'now', payload: { a: 1 } });

    await vi.waitFor(async () => expect((await offlineDb.syncQueue.get(id))?.status).toBe(SyncStatus.SYNCED));
    expect(transport).toHaveBeenCalledWith(expect.objectContaining({ id, entity, clientId: 'now', payload: { a: 1 } }));
  });

  test('enqueueing while offline does not attempt to send', async () => {
    setNavigatorOnline(false);
    const service = await createService();
    const transport = vi.fn().mockResolvedValue(undefined);
    service.registerTransport(entity, transport);

    const id = await service.enqueue({ entity, operation: 'CREATE', recordId: 1, clientId: 'later', payload: {} });

    expect(service.getIsOnline()).toBe(false);
    expect(transport).not.toHaveBeenCalled();
    expect((await offlineDb.syncQueue.get(id))?.status).toBe(SyncStatus.PENDING);
  });
});

describe('processAll', () => {
  test('an empty queue sends nothing and announces nothing', async () => {
    const service = await createService();
    const transport = vi.fn();
    service.registerTransport(entity, transport);
    const completed = vi.fn();
    window.addEventListener('sync-completed', completed);

    await service.processAll();

    window.removeEventListener('sync-completed', completed);
    expect(transport).not.toHaveBeenCalled();
    expect(completed).not.toHaveBeenCalled();
  });

  test('a successful item becomes SYNCED and a sync-completed event is dispatched', async () => {
    const service = await createService();
    const transport = vi.fn().mockResolvedValue(undefined);
    service.registerTransport(entity, transport);
    const id = await offlineDb.syncQueue.add(queueItem());
    const completed = vi.fn();
    window.addEventListener('sync-completed', completed);

    await service.processAll();

    window.removeEventListener('sync-completed', completed);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(await offlineDb.syncQueue.get(id)).toMatchObject({ status: SyncStatus.SYNCED, attempts: 0 });
    expect(completed).toHaveBeenCalled();
  });

  test('the item is marked SYNCING while its request is in flight', async () => {
    const service = await createService();
    let release!: () => void;
    const statusesSeen: SyncStatus[] = [];
    const id = await offlineDb.syncQueue.add(queueItem());
    service.registerTransport(entity, async () => {
      statusesSeen.push((await offlineDb.syncQueue.get(id))!.status);
      await new Promise<void>(resolve => (release = resolve));
    });

    const run = service.processAll();
    await vi.waitFor(() => expect(statusesSeen).toEqual([SyncStatus.SYNCING]));
    expect(await service.getQueueCounts(entity)).toEqual({ pending: 0, syncing: 1, failed: 0 });
    release();
    await run;

    expect((await offlineDb.syncQueue.get(id))?.status).toBe(SyncStatus.SYNCED);
  });

  test('several items are sent in queue order', async () => {
    const service = await createService();
    const order: unknown[] = [];
    service.registerTransport(entity, async item => void order.push(item.payload));
    for (const n of [1, 2, 3]) await offlineDb.syncQueue.add(queueItem({ payload: n }));

    await service.processAll();

    expect(order).toEqual([1, 2, 3]);
    expect(await service.getQueueCounts(entity)).toEqual({ pending: 0, syncing: 0, failed: 0 });
  });

  test('a server rejection marks only that item FAILED and the next item is still sent', async () => {
    const service = await createService();
    const rejectedId = await offlineDb.syncQueue.add(queueItem({ payload: 'bad' }));
    const okId = await offlineDb.syncQueue.add(queueItem({ payload: 'good' }));
    service.registerTransport(entity, async item => {
      if (item.payload === 'bad') throw httpError(409, 'Alert is already resolved');
    });

    await service.processAll();

    expect(await offlineDb.syncQueue.get(rejectedId)).toMatchObject({ status: SyncStatus.FAILED, attempts: 1, lastError: 'Alert is already resolved' });
    expect((await offlineDb.syncQueue.get(okId))?.status).toBe(SyncStatus.SYNCED);
  });

  test('a lost connection keeps the item PENDING and counts the attempt', async () => {
    const service = await createService();
    const id = await offlineDb.syncQueue.add(queueItem({ attempts: 2 }));
    service.registerTransport(entity, async () => {
      throw noResponseError('ERR_NETWORK');
    });

    await service.processAll();

    expect(await offlineDb.syncQueue.get(id)).toMatchObject({ status: SyncStatus.PENDING, attempts: 3, lastError: 'Network Error' });
    expect(service.getIsOnline()).toBe(true);
  });

  test('when the device reports it went offline mid-sync, processing stops and the rest stay PENDING', async () => {
    const service = await createService();
    const firstId = await offlineDb.syncQueue.add(queueItem({ payload: 1 }));
    const secondId = await offlineDb.syncQueue.add(queueItem({ payload: 2 }));
    const transport = vi.fn(async () => {
      setNavigatorOnline(false);
      throw noResponseError('ERR_NETWORK');
    });
    service.registerTransport(entity, transport);

    await service.processAll();

    expect(transport).toHaveBeenCalledTimes(1);
    expect(service.getIsOnline()).toBe(false);
    expect((await offlineDb.syncQueue.get(firstId))?.status).toBe(SyncStatus.PENDING);
    expect(await offlineDb.syncQueue.get(secondId)).toMatchObject({ status: SyncStatus.PENDING, attempts: 0 });
  });

  test('a failed sync never deletes the queued action or the local business record', async () => {
    const service = await createService();
    const recordId = await offlineDb.incidents.add({ syncStatus: SyncStatus.PENDING, createdAt: 'c', updatedAt: 'u', payload: { description: 'Snare found' } });
    const id = await offlineDb.syncQueue.add(queueItem({ recordId }));
    service.registerTransport(entity, async () => {
      throw httpError(500);
    });

    await service.processAll();
    await service.processAll();

    expect(await offlineDb.syncQueue.get(id)).toMatchObject({ recordId, attempts: 2 });
    expect(await offlineDb.incidents.get(recordId)).toMatchObject({ payload: { description: 'Snare found' } });
  });

  test('items without a registered transport are left untouched', async () => {
    const service = await createService();
    const id = await offlineDb.syncQueue.add(queueItem({ entity: 'NOBODY_HANDLES_THIS' }));

    await service.processAll();

    expect(await offlineDb.syncQueue.get(id)).toMatchObject({ status: SyncStatus.PENDING, attempts: 0 });
  });

  test('nothing is sent while the service is offline', async () => {
    setNavigatorOnline(false);
    const service = await createService();
    const transport = vi.fn();
    service.registerTransport(entity, transport);
    await offlineDb.syncQueue.add(queueItem());

    await service.processAll();

    expect(transport).not.toHaveBeenCalled();
  });

  test('a second call while a sync is running does not send any item twice', async () => {
    const service = await createService();
    const transport = vi.fn(() => new Promise<void>(resolve => setTimeout(resolve, 10)));
    service.registerTransport(entity, transport);
    await offlineDb.syncQueue.bulkAdd([queueItem(), queueItem()]);

    await Promise.all([service.processAll(), service.processAll(), service.processAll()]);

    expect(transport).toHaveBeenCalledTimes(2);
    expect(await service.getQueueCounts(entity)).toEqual({ pending: 0, syncing: 0, failed: 0 });
  });

  test('an item queued while a sync is already running is still sent in the same session', async () => {
    const service = await createService();
    let release!: () => void;
    const sent: unknown[] = [];
    service.registerTransport(entity, async item => {
      sent.push(item.payload);
      if (item.payload === 'first') await new Promise<void>(resolve => (release = resolve));
    });
    await offlineDb.syncQueue.add(queueItem({ payload: 'first' }));

    const run = service.processAll();
    await vi.waitFor(() => expect(sent).toEqual(['first']));
    // A second action is queued (e.g. a request that lost its connection) while the first is in flight.
    const lateId = await service.enqueue({ entity, operation: 'UPDATE', recordId: 2, clientId: 'late', payload: 'second' });
    release();
    await run;

    await vi.waitFor(async () => expect((await offlineDb.syncQueue.get(lateId))?.status).toBe(SyncStatus.SYNCED));
    expect(sent).toEqual(['first', 'second']);
  });

  test('a FAILED item is attempted again on the next sync run', async () => {
    const service = await createService();
    const id = await offlineDb.syncQueue.add(queueItem({ status: SyncStatus.FAILED, attempts: 1, lastError: 'old' }));
    service.registerTransport(entity, vi.fn().mockResolvedValue(undefined));

    await service.processAll();

    expect((await offlineDb.syncQueue.get(id))?.status).toBe(SyncStatus.SYNCED);
  });

  test('a transport that throws a non-Error value records a generic message', async () => {
    const service = await createService();
    const id = await offlineDb.syncQueue.add(queueItem());
    service.registerTransport(entity, async () => {
      throw { response: { status: 422 } };
    });

    await service.processAll();

    expect(await offlineDb.syncQueue.get(id)).toMatchObject({ status: SyncStatus.FAILED, lastError: 'Sync transport failure' });
  });

  test('a queue read failure is logged and the service can sync again afterwards', async () => {
    const service = await createService();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const where = vi.spyOn(offlineDb.syncQueue, 'where').mockImplementationOnce(() => {
      throw new Error('IndexedDB unavailable');
    });
    const transport = vi.fn().mockResolvedValue(undefined);
    service.registerTransport(entity, transport);
    const id = await offlineDb.syncQueue.add(queueItem());

    await service.processAll();
    expect(warn).toHaveBeenCalledWith('SyncService batch execution error:', expect.any(Error));
    expect(transport).not.toHaveBeenCalled();

    where.mockRestore();
    await service.processAll();
    expect((await offlineDb.syncQueue.get(id))?.status).toBe(SyncStatus.SYNCED);
  });
});

describe('connection failure classification', () => {
  test.each([
    ['no response (connection refused)', SyncStatus.PENDING, noResponseError()],
    ['network error code', SyncStatus.PENDING, noResponseError('ERR_NETWORK')],
    ['request timeout (ECONNABORTED)', SyncStatus.PENDING, noResponseError('ECONNABORTED')],
    ['HTTP 400', SyncStatus.FAILED, httpError(400)],
    ['HTTP 401', SyncStatus.FAILED, httpError(401)],
    ['HTTP 403', SyncStatus.FAILED, httpError(403)],
    ['HTTP 404', SyncStatus.FAILED, httpError(404)],
    ['HTTP 408', SyncStatus.PENDING, httpError(408)],
    ['HTTP 409', SyncStatus.FAILED, httpError(409)],
    ['HTTP 429', SyncStatus.PENDING, httpError(429)],
    ['HTTP 500', SyncStatus.PENDING, httpError(500)],
    ['HTTP 502', SyncStatus.PENDING, httpError(502)],
    ['HTTP 503', SyncStatus.PENDING, httpError(503)]
  ])('%s leaves the item %s', async (_label, expected, error) => {
    const service = await createService();
    const id = await offlineDb.syncQueue.add(queueItem());
    service.registerTransport(entity, async () => {
      throw error;
    });

    await service.processAll();

    expect(await offlineDb.syncQueue.get(id)).toMatchObject({ status: expected, attempts: 1 });
  });

  test('any failure while the browser reports offline is treated as a lost connection, even an HTTP 400', async () => {
    const service = await createService();
    const id = await offlineDb.syncQueue.add(queueItem());
    service.registerTransport(entity, async () => {
      setNavigatorOnline(false);
      throw httpError(400);
    });

    await service.processAll();

    expect((await offlineDb.syncQueue.get(id))?.status).toBe(SyncStatus.PENDING);
  });
});

describe('retryFailed and queue counts', () => {
  test('retryFailed resets FAILED items to PENDING, clears the error and sends them', async () => {
    setNavigatorOnline(false);
    const service = await createService();
    const id = await offlineDb.syncQueue.add(queueItem({ status: SyncStatus.FAILED, attempts: 3, lastError: 'Server rejected' }));
    const transport = vi.fn().mockResolvedValue(undefined);
    service.registerTransport(entity, transport);

    // Offline: the reset still happens, the send waits for connectivity.
    await service.retryFailed();
    const reset = await offlineDb.syncQueue.get(id);
    expect(reset).toMatchObject({ status: SyncStatus.PENDING, attempts: 3 });
    expect(reset?.lastError).toBeUndefined();
    expect(transport).not.toHaveBeenCalled();

    setNavigatorOnline(true);
    window.dispatchEvent(new Event('online'));
    await vi.waitFor(async () => expect((await offlineDb.syncQueue.get(id))?.status).toBe(SyncStatus.SYNCED));
  });

  test('a retry that fails again is marked FAILED with the new error', async () => {
    const service = await createService();
    const id = await offlineDb.syncQueue.add(queueItem({ status: SyncStatus.FAILED, attempts: 1, lastError: 'first' }));
    service.registerTransport(entity, async () => {
      throw httpError(403, 'Not your alert');
    });

    await service.retryFailed();

    expect(await offlineDb.syncQueue.get(id)).toMatchObject({ status: SyncStatus.FAILED, attempts: 2, lastError: 'Not your alert' });
  });

  test('queue counts are reported per entity and in total; SYNCED items are not counted', async () => {
    setNavigatorOnline(false);
    const service = await createService();
    await offlineDb.syncQueue.bulkAdd([
      queueItem({ status: SyncStatus.PENDING }),
      queueItem({ status: SyncStatus.PENDING }),
      queueItem({ status: SyncStatus.FAILED }),
      queueItem({ status: SyncStatus.SYNCING }),
      queueItem({ status: SyncStatus.SYNCED }),
      queueItem({ entity: 'OTHER', status: SyncStatus.FAILED })
    ]);

    expect(await service.getQueueCounts(entity)).toEqual({ pending: 2, syncing: 1, failed: 1 });
    expect(await service.getQueueCounts()).toEqual({ pending: 2, syncing: 1, failed: 2 });
    expect(await service.getQueueCounts('NO_ITEMS')).toEqual({ pending: 0, syncing: 0, failed: 0 });
  });
});

describe('connectivity events and interrupted syncs', () => {
  test('items left SYNCING by a closed tab are recovered on start-up and sent', async () => {
    const id = await offlineDb.syncQueue.add(queueItem({ status: SyncStatus.SYNCING }));
    const transport = vi.fn().mockResolvedValue(undefined);
    // Register before start-up processing runs, as the feature modules do at import time.
    const register = vi.spyOn(SyncService.prototype, 'processAll');
    const service = new SyncService();
    service.registerTransport(entity, transport);
    await vi.waitFor(() => expect(register).toHaveBeenCalled());
    await register.mock.results[0].value;

    expect(transport).toHaveBeenCalledTimes(1);
    expect(await offlineDb.syncQueue.get(id)).toMatchObject({ status: SyncStatus.SYNCED, lastError: 'Recovered after interrupted sync' });
  });

  test('a recovery failure on start-up is logged and does not break the service', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(offlineDb.syncQueue, 'where').mockImplementationOnce(() => ({
      equals: () => ({ modify: () => Promise.reject(new Error('blocked')) })
    }) as never);

    const service = new SyncService();

    await vi.waitFor(() => expect(warn).toHaveBeenCalledWith('Unable to recover interrupted sync items:', expect.any(Error)));
    expect(service.getIsOnline()).toBe(true);
  });

  test('going offline stops sending and returns in-flight items to PENDING', async () => {
    const service = await createService();
    const id = await offlineDb.syncQueue.add(queueItem({ status: SyncStatus.SYNCING }));

    setNavigatorOnline(false);
    window.dispatchEvent(new Event('offline'));

    expect(service.getIsOnline()).toBe(false);
    await vi.waitFor(async () => expect((await offlineDb.syncQueue.get(id))?.status).toBe(SyncStatus.PENDING));
  });

  test('coming back online sends pending items once, even after repeated online events', async () => {
    setNavigatorOnline(false);
    const service = await createService();
    const transport = vi.fn(() => new Promise<void>(resolve => setTimeout(resolve, 5)));
    service.registerTransport(entity, transport);
    const id = await offlineDb.syncQueue.add(queueItem());

    setNavigatorOnline(true);
    window.dispatchEvent(new Event('online'));
    window.dispatchEvent(new Event('online'));
    window.dispatchEvent(new Event('online'));

    await vi.waitFor(async () => expect((await offlineDb.syncQueue.get(id))?.status).toBe(SyncStatus.SYNCED));
    expect(service.getIsOnline()).toBe(true);
    expect(transport).toHaveBeenCalledTimes(1);
  });
});
