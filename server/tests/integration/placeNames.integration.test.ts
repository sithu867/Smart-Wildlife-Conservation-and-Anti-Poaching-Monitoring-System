import { jest } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/config/prisma.js';
import { IncidentType, LocationSource } from '../../src/types/enums.js';
import { reverseGeocoder } from '../../src/modules/shared/reverseGeocoder.js';
import { placeNameBackfill } from '../../src/modules/incidents/placeNames.js';

const app = createApp();

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
