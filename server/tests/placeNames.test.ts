import { jest } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { IncidentType, LocationSource } from '../src/types/enums.js';
import { ReverseGeocoder, formatPlaceName, reverseGeocoder } from '../src/modules/shared/reverseGeocoder.js';
import { placeNameBackfill } from '../src/modules/incidents/placeNames.js';

const app = createApp();

// Real answer from Nominatim for 6.8467, 79.9480
const PANNIPITIYA_RESPONSE = {
  name: 'Pannipitiya',
  address: { village: 'Pannipitiya', state_district: 'Colombo District', state: 'Western Province', postcode: '10230', country: 'Sri Lanka', country_code: 'lk' }
};

function fakeFetch(body: unknown, status = 200) {
  return jest.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify(body), { status }));
}

const makeGeocoder = (fetchFn: unknown, overrides: Partial<{ enabled: boolean; minIntervalMs: number }> = {}) =>
  new ReverseGeocoder({
    enabled: true,
    baseUrl: 'https://nominatim.example',
    userAgent: 'WildlifeGuard/test',
    minIntervalMs: 0,
    fetchFn: fetchFn as typeof fetch,
    ...overrides
  });

describe('formatPlaceName', () => {
  test('uses the most specific named place and the country', () => {
    expect(formatPlaceName(PANNIPITIYA_RESPONSE.address)).toBe('Pannipitiya, Sri Lanka');
    expect(formatPlaceName({ suburb: 'Kottawa', city: 'Maharagama', country: 'Sri Lanka' })).toBe('Kottawa, Sri Lanka');
  });

  test('falls back to the region, and returns null when there is nothing named', () => {
    expect(formatPlaceName({ state: 'Mara Region', country: 'Tanzania' })).toBe('Mara Region, Tanzania');
    expect(formatPlaceName({})).toBeNull();
    expect(formatPlaceName(undefined)).toBeNull();
  });
});

describe('ReverseGeocoder', () => {
  test('calls Nominatim reverse with an identifying User-Agent and caches the answer', async () => {
    const fetchFn = fakeFetch(PANNIPITIYA_RESPONSE);
    const geocoder = makeGeocoder(fetchFn);

    expect(await geocoder.lookup(6.8467, 79.948)).toBe('Pannipitiya, Sri Lanka');
    expect(await geocoder.lookup(6.84671, 79.94801)).toBe('Pannipitiya, Sri Lanka'); // same ~11 m cell
    expect(fetchFn).toHaveBeenCalledTimes(1);

    const [url, init] = fetchFn.mock.calls[0];
    expect(String(url)).toContain('https://nominatim.example/reverse?format=jsonv2');
    expect(String(url)).toContain('lat=6.8467&lon=79.948');
    expect((init?.headers as Record<string, string>)['User-Agent']).toBe('WildlifeGuard/test');
  });

  test('null when there is no named place; undefined when the service fails or is disabled', async () => {
    expect(await makeGeocoder(fakeFetch({ error: 'Unable to geocode' })).lookup(0, 0)).toBeNull();
    expect(await makeGeocoder(fakeFetch({}, 503)).lookup(1, 1)).toBeUndefined();
    expect(await makeGeocoder(jest.fn(async () => { throw new Error('offline'); })).lookup(2, 2)).toBeUndefined();
    expect(await makeGeocoder(fakeFetch(PANNIPITIYA_RESPONSE), { enabled: false }).lookup(3, 3)).toBeUndefined();
  });

  test('waits between requests (Nominatim allows 1 per second)', async () => {
    const fetchFn = fakeFetch(PANNIPITIYA_RESPONSE);
    const geocoder = makeGeocoder(fetchFn, { minIntervalMs: 150 });
    const started = Date.now();

    await Promise.all([geocoder.lookup(10, 10), geocoder.lookup(20, 20), geocoder.lookup(30, 30)]);
    expect(Date.now() - started).toBeGreaterThanOrEqual(290);
  });

  test('gives up when the wait would exceed the timeout', async () => {
    const geocoder = makeGeocoder(fakeFetch(PANNIPITIYA_RESPONSE), { minIntervalMs: 5000 });
    await geocoder.lookup(10, 10);
    expect(await geocoder.lookup(20, 20, 100)).toBeUndefined();
  });
});

describe('Place names on incident reports', () => {
  jest.setTimeout(30000);
  const payload = {
    incidentType: IncidentType.SNARE,
    description: 'Wire snare near the paddy field',
    latitude: 6.8467,
    longitude: 79.948,
    locationSource: LocationSource.GPS,
    evidence: [{ imageUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD', mimeType: 'image/jpeg' }]
  };
  const ranger = (label: string) => `R-PLACE-${label}-${Date.now()}`;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('a new report is saved with its place name', async () => {
    jest.spyOn(reverseGeocoder, 'lookup').mockResolvedValue('Pannipitiya, Sri Lanka');

    const res = await request(app).post('/api/incidents').set('x-ranger-id', ranger('NEW')).send(payload);
    expect(res.status).toBe(201);
    expect(res.body.data.location.placeName).toBe('Pannipitiya, Sri Lanka');
  });

  test('when the lookup is unavailable the report is still saved, then filled in later without changing its version', async () => {
    const rangerId = ranger('BACKFILL');
    jest.spyOn(reverseGeocoder, 'lookup').mockResolvedValueOnce(undefined);
    const created = await request(app).post('/api/incidents').set('x-ranger-id', rangerId).send(payload);
    expect(created.status).toBe(201);
    expect(created.body.data.location).not.toHaveProperty('placeName');

    jest.spyOn(reverseGeocoder, 'isEnabled').mockReturnValue(true);
    jest.spyOn(reverseGeocoder, 'lookup').mockResolvedValue('Pannipitiya, Sri Lanka');
    await request(app).get('/api/incidents/my').set('x-ranger-id', rangerId);
    await placeNameBackfill.whenIdle();

    const row = await prisma.conservationIncident.findUnique({ where: { id: created.body.data._id } });
    expect((row?.location as { placeName?: string }).placeName).toBe('Pannipitiya, Sri Lanka');
    expect(row?.updatedAt.toISOString()).toBe(created.body.data.updatedAt);
  });
});
