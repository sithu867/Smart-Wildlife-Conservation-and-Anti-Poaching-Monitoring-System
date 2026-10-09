import { offlineDb, type OfflineRecord } from './db';
import { SyncStatus } from '../shared/types/enums';

// Local device storage shared by UC-A (patrols), UC-B (incidents) and UC-C (conflict alerts).

const record = (overrides: Partial<OfflineRecord> = {}): OfflineRecord => ({
  syncStatus: SyncStatus.PENDING,
  createdAt: '2026-10-09T08:00:00.000Z',
  updatedAt: '2026-10-09T08:00:00.000Z',
  payload: { description: 'Snare found near water hole' },
  ...overrides
});

beforeEach(async () => {
  await Promise.all(offlineDb.tables.map(table => table.clear()));
});

test('initializes the offline database schema without opening a network connection', () => {
  expect(offlineDb.name).toBe('wildlife-guard');
  expect(offlineDb.tables.map(table => table.name)).toEqual(expect.arrayContaining(['patrolSessions', 'waypoints', 'incidents', 'conflictResponses', 'conflictAlerts', 'syncQueue']));
});

test('business tables index remote id, sync status and update time; the queue indexes status, entity and creation time', () => {
  for (const name of ['patrolSessions', 'waypoints', 'incidents', 'conflictResponses', 'conflictAlerts']) {
    const schema = offlineDb.table(name).schema;
    expect(schema.primKey).toMatchObject({ name: 'id', auto: true });
    expect(schema.indexes.map(index => index.name).sort()).toEqual(['remoteId', 'syncStatus', 'updatedAt']);
  }
  expect(offlineDb.syncQueue.schema.indexes.map(index => index.name).sort()).toEqual(['createdAt', 'entity', 'status']);
});

test('a record is stored with a generated id and read back unchanged', async () => {
  const id = await offlineDb.incidents.add(record());

  expect(id).toEqual(expect.any(Number));
  expect(await offlineDb.incidents.get(id)).toEqual({ ...record(), id });
});

test('updating a record keeps unchanged fields and persists the new sync status', async () => {
  const id = await offlineDb.conflictAlerts.add(record({ remoteId: 'alert-1' }));

  await offlineDb.conflictAlerts.update(id, { syncStatus: SyncStatus.SYNCED, updatedAt: '2026-10-09T09:00:00.000Z' });

  expect(await offlineDb.conflictAlerts.get(id)).toMatchObject({ remoteId: 'alert-1', syncStatus: SyncStatus.SYNCED, updatedAt: '2026-10-09T09:00:00.000Z', payload: record().payload });
});

test('records can be found by sync status and by remote id', async () => {
  await offlineDb.patrolSessions.bulkAdd([
    record({ remoteId: 's-1', syncStatus: SyncStatus.SYNCED }),
    record({ remoteId: 's-2', syncStatus: SyncStatus.PENDING }),
    record({ remoteId: 's-3', syncStatus: SyncStatus.FAILED })
  ]);

  const unsynced = await offlineDb.patrolSessions.where('syncStatus').anyOf(SyncStatus.PENDING, SyncStatus.FAILED).toArray();
  expect(unsynced.map(item => item.remoteId).sort()).toEqual(['s-2', 's-3']);
  expect((await offlineDb.patrolSessions.where('remoteId').equals('s-1').first())?.syncStatus).toBe(SyncStatus.SYNCED);
});

test('deleting a record removes only that record', async () => {
  const keep = await offlineDb.waypoints.add(record());
  const remove = await offlineDb.waypoints.add(record());

  await offlineDb.waypoints.delete(remove);

  expect(await offlineDb.waypoints.get(remove)).toBeUndefined();
  expect(await offlineDb.waypoints.get(keep)).toBeDefined();
});

test('a failed transaction saves neither the record nor its queue item', async () => {
  await expect(
    offlineDb.transaction('rw', offlineDb.incidents, offlineDb.syncQueue, async () => {
      const recordId = await offlineDb.incidents.add(record());
      await offlineDb.syncQueue.add({ entity: 'INCIDENT', operation: 'CREATE', recordId, status: SyncStatus.PENDING, attempts: 0, createdAt: 'now' });
      throw new Error('quota exceeded');
    })
  ).rejects.toThrow('quota exceeded');

  expect(await offlineDb.incidents.count()).toBe(0);
  expect(await offlineDb.syncQueue.count()).toBe(0);
});

test('a successful transaction saves the record and its queue item together', async () => {
  await offlineDb.transaction('rw', offlineDb.incidents, offlineDb.syncQueue, async () => {
    const recordId = await offlineDb.incidents.add(record());
    await offlineDb.syncQueue.add({ entity: 'INCIDENT', operation: 'CREATE', recordId, status: SyncStatus.PENDING, attempts: 0, createdAt: 'now' });
  });

  const [stored] = await offlineDb.incidents.toArray();
  expect(await offlineDb.syncQueue.where('entity').equals('INCIDENT').first()).toMatchObject({ recordId: stored.id, status: SyncStatus.PENDING });
});
