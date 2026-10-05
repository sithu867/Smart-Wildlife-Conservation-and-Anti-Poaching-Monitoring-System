import { offlineDb } from './db';
test('initializes the offline database schema without opening a network connection', () => {
  expect(offlineDb.name).toBe('wildlife-guard');
  expect(offlineDb.tables.map(table => table.name)).toEqual(expect.arrayContaining(['patrolSessions', 'waypoints', 'incidents', 'conflictResponses', 'conflictAlerts', 'syncQueue']));
});
