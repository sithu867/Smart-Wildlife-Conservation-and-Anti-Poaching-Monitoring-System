import request from 'supertest';
import { createApp } from '../src/app.js';
test('GET /api/health returns structured HTTP 200 response', async () => { const response = await request(createApp()).get('/api/health'); expect(response.status).toBe(200); expect(response.body).toMatchObject({ success: true, data: { status: 'ok' } }); });
