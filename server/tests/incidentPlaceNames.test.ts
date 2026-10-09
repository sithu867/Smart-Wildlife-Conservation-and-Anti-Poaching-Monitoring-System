import { jest } from '@jest/globals';
import { prisma, resetIncidentPrisma } from './incidentPrismaMock.js';

const { lookupPlaceName, needsPlaceName, placeNameBackfill, PLACE_NAME_REQUEST_TIMEOUT_MS } = await import('../src/modules/incidents/placeNames.js');
const { reverseGeocoder } = await import('../src/modules/shared/reverseGeocoder.js');

// UC-B place names on incident reports. The geocoder is stubbed: no request reaches OpenStreetMap.
const NOW = new Date('2026-10-08T12:00:00.000Z');
const unnamed = (id: string, latitude = 6.8467, longitude = 79.948) => ({ id, location: { latitude, longitude, source: 'GPS' } });
/** The values interpolated into the place-name UPDATE: [placeName JSON, incident id, latitude, longitude]. */
const savedValues = () => prisma.$executeRaw.mock.calls.map(call => call.slice(1));

beforeEach(() => {
  jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask', 'setTimeout', 'clearTimeout'] });
  resetIncidentPrisma();
  jest.spyOn(reverseGeocoder, 'isEnabled').mockReturnValue(true);
});
afterEach(async () => {
  await placeNameBackfill.whenIdle();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test('a new report waits at most 3 seconds for its place name', async () => {
  const lookup = jest.spyOn(reverseGeocoder, 'lookup').mockResolvedValue('Pannipitiya, Sri Lanka');

  await expect(lookupPlaceName({ latitude: 6.8467, longitude: 79.948 })).resolves.toBe('Pannipitiya, Sri Lanka');
  expect(lookup).toHaveBeenCalledWith(6.8467, 79.948, PLACE_NAME_REQUEST_TIMEOUT_MS);
  expect(PLACE_NAME_REQUEST_TIMEOUT_MS).toBe(3000);
});

test('only a location never looked up needs a place name (null means "no named place")', () => {
  expect(needsPlaceName({ latitude: 1, longitude: 2 })).toBe(true);
  expect(needsPlaceName({ latitude: 1, longitude: 2, placeName: null })).toBe(false);
  expect(needsPlaceName({ latitude: 1, longitude: 2, placeName: 'Kottawa, Sri Lanka' })).toBe(false);
  expect(needsPlaceName(null)).toBe(false);
});

test('fills in names for reports that lack one, and saves only for unchanged coordinates', async () => {
  jest.spyOn(reverseGeocoder, 'lookup').mockResolvedValueOnce('Pannipitiya, Sri Lanka').mockResolvedValueOnce(null);

  placeNameBackfill.schedule([
    unnamed('inc-1'),
    { id: 'named', location: { latitude: 1, longitude: 1, placeName: 'Known' } },
    unnamed('inc-2', 0, 0),
    { id: 'bad', location: { latitude: Number.NaN, longitude: 1 } }
  ]);
  await placeNameBackfill.whenIdle();

  expect(reverseGeocoder.lookup).toHaveBeenCalledTimes(2);
  expect(savedValues()).toEqual([
    ['"Pannipitiya, Sri Lanka"', 'inc-1', 6.8467, 79.948],
    ['null', 'inc-2', 0, 0]
  ]);
});

test('a failed save is logged and the remaining reports are still processed', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(reverseGeocoder, 'lookup').mockResolvedValue('Kottawa, Sri Lanka');
  prisma.$executeRaw.mockRejectedValueOnce(new Error('row locked'));

  placeNameBackfill.schedule([unnamed('inc-1'), unnamed('inc-2')]);
  await placeNameBackfill.whenIdle();

  expect(warn).toHaveBeenCalledWith('Could not save place name:', 'row locked');
  expect(savedValues().map(values => values[1])).toEqual(['inc-1', 'inc-2']);
});

test('does nothing while reverse geocoding is disabled', async () => {
  jest.spyOn(reverseGeocoder, 'isEnabled').mockReturnValue(false);
  const lookup = jest.spyOn(reverseGeocoder, 'lookup');

  placeNameBackfill.schedule([unnamed('inc-1')]);
  await placeNameBackfill.whenIdle();

  expect(lookup).not.toHaveBeenCalled();
});

// Runs last: it leaves the shared backfill paused until its cooldown passes.
test('pauses for 5 minutes when the lookup service is unavailable, then resumes', async () => {
  const lookup = jest.spyOn(reverseGeocoder, 'lookup').mockResolvedValue(undefined);

  placeNameBackfill.schedule([unnamed('inc-1'), unnamed('inc-2')]);
  await placeNameBackfill.whenIdle();
  // The rest of the batch is dropped instead of hammering the failing service.
  expect(lookup).toHaveBeenCalledTimes(1);
  expect(prisma.$executeRaw).not.toHaveBeenCalled();

  jest.setSystemTime(new Date(NOW.getTime() + 4 * 60 * 1000));
  placeNameBackfill.schedule([unnamed('inc-3')]);
  await placeNameBackfill.whenIdle();
  expect(lookup).toHaveBeenCalledTimes(1);

  lookup.mockResolvedValue('Maharagama, Sri Lanka');
  jest.setSystemTime(new Date(NOW.getTime() + 5 * 60 * 1000 + 1));
  placeNameBackfill.schedule([unnamed('inc-3')]);
  await placeNameBackfill.whenIdle();
  expect(savedValues()).toEqual([['"Maharagama, Sri Lanka"', 'inc-3', 6.8467, 79.948]]);
});
