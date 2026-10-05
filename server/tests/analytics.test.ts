import request from 'supertest';
import { createApp } from '../src/app.js';

const app = createApp();

describe('UC-D analytics API validation and authorization', () => {
  test('rejects analytics access without manager authorization', async () => {
    const response = await request(app).get('/api/analytics');
    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
    expect(response.body.error.message).toContain('manager');
  });

  test('rejects ranger analytics access', async () => {
    const response = await request(app).get('/api/analytics').set('x-user-role', 'RANGER');
    expect(response.status).toBe(403);
  });

  test('rejects an invalid date range before querying data', async () => {
    const response = await request(app).get('/api/analytics').set('x-user-role', 'MANAGER').query({ start: '2026-09-30', end: '2026-09-01' });
    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('Start date');
  });

  test('rejects malformed dates', async () => {
    const response = await request(app).get('/api/analytics/report').set('x-user-role', 'MANAGER').query({ start: 'not-a-date' });
    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });
});
