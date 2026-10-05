import request from 'supertest';
import { createApp } from '../src/app.js';
import { IncidentType, LocationSource } from '../src/types/enums.js';

const app = createApp();

describe('UC-B Conservation Incidents API Endpoints', () => {
  const sampleIncidentPayload = {
    incidentType: IncidentType.SNARE,
    description: 'Wire snare found attached to acacia tree near waterhole.',
    latitude: -2.1523,
    longitude: 34.8214,
    locationSource: LocationSource.GPS,
    evidence: [
      {
        imageUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD...',
        fileSize: 1024,
        mimeType: 'image/jpeg'
      }
    ]
  };

  test('POST /api/incidents creates a new incident for authenticated ranger', async () => {
    const res = await request(app)
      .post('/api/incidents')
      .set('x-ranger-id', 'R-101')
      .set('x-ranger-name', 'Ranger John')
      .send(sampleIncidentPayload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.incidentType).toBe(IncidentType.SNARE);
    expect(res.body.data.reportedBy).toBe('R-101');
    expect(res.body.data.evidence.length).toBe(1);
    expect(res.body.data.evidence[0].evidenceId).toBeDefined();
  });

  test('POST /api/incidents accepts an image payload larger than the default JSON body limit', async () => {
    const res = await request(app)
      .post('/api/incidents')
      .set('x-ranger-id', 'R-101')
      .send({
        ...sampleIncidentPayload,
        evidence: [{ ...sampleIncidentPayload.evidence[0], imageUrl: `data:image/jpeg;base64,${'A'.repeat(150 * 1024)}` }]
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  test('POST /api/incidents rejects invalid incidentType', async () => {
    const res = await request(app)
      .post('/api/incidents')
      .set('x-ranger-id', 'R-101')
      .send({
        ...sampleIncidentPayload,
        incidentType: 'INVALID_TYPE'
      });

    expect(res.status).toBe(400); // errorHandler maps Zod validation error
    expect(res.body.success).toBe(false);
  });

  test('POST /api/incidents rejects invalid coordinates (latitude out of range)', async () => {
    const res = await request(app)
      .post('/api/incidents')
      .set('x-ranger-id', 'R-101')
      .send({
        ...sampleIncidentPayload,
        latitude: 150 // Invalid
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('POST /api/incidents rejects missing photographic evidence', async () => {
    const res = await request(app)
      .post('/api/incidents')
      .set('x-ranger-id', 'R-101')
      .send({
        ...sampleIncidentPayload,
        evidence: [] // Missing evidence
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('POST /api/incidents handles idempotency with clientIncidentId', async () => {
    const clientIncidentId = `client-inc-${Date.now()}`;
    const payload = { ...sampleIncidentPayload, clientIncidentId };

    const res1 = await request(app)
      .post('/api/incidents')
      .set('x-ranger-id', 'R-101')
      .send(payload);

    expect(res1.status).toBe(201);

    const res2 = await request(app)
      .post('/api/incidents')
      .set('x-ranger-id', 'R-101')
      .send(payload);

    expect(res2.status).toBe(201);
    expect(res2.body.data._id).toBe(res1.body.data._id); // Same document returned
  });

  test('GET /api/incidents/my retrieves reported incidents for ranger', async () => {
    const res = await request(app)
      .get('/api/incidents/my')
      .set('x-ranger-id', 'R-101');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  test('GET /api/incidents/:id rejects access to another ranger incident', async () => {
    // Create incident under R-101
    const createRes = await request(app)
      .post('/api/incidents')
      .set('x-ranger-id', 'R-101')
      .send(sampleIncidentPayload);

    const incidentId = createRes.body.data._id;

    // Attempt access as R-999 (unauthorized)
    const accessRes = await request(app)
      .get(`/api/incidents/${incidentId}`)
      .set('x-ranger-id', 'R-999');

    expect(accessRes.status).toBe(403);
    expect(accessRes.body.error.message).toContain('Unauthorized');
  });

  test('POST /api/incidents accepts MANUAL location source', async () => {
    const manualPayload = {
      ...sampleIncidentPayload,
      locationSource: LocationSource.MANUAL,
      latitude: -2.1999,
      longitude: 34.8999
    };

    const res = await request(app)
      .post('/api/incidents')
      .set('x-ranger-id', 'R-101')
      .send(manualPayload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.location.source).toBe(LocationSource.MANUAL);
    expect(res.body.data.location.latitude).toBe(-2.1999);
  });
});
