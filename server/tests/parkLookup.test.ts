import { jest } from '@jest/globals';
import request from 'supertest';
import { prisma, resetAnalyticsPrisma } from './analyticsPrismaMock.js';

const { createApp } = await import('../src/app.js');
const app = createApp();
const parks = [{ id: 'c67a000000000000000000001', name: 'Known Park', code: 'KNOWN' }];

beforeEach(() => {
  resetAnalyticsPrisma();
  jest.mocked(prisma.park.findMany).mockResolvedValue(parks);
});

test.each([undefined, 'RANGER', 'MANAGER'])(
  'shared park lookup returns only selection metadata with role %s',
  async (role) => {
    const lookup = request(app).get('/api/parks');
    if (role) lookup.set('x-user-role', role);
    const response = await lookup;
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: parks });
    expect(prisma.park.findMany).toHaveBeenCalledWith({
      select: { id: true, name: true, code: true },
      orderBy: { name: 'asc' },
    });
    expect(prisma.patrolRoute.findMany).not.toHaveBeenCalled();
    expect(prisma.patrolSession.findMany).not.toHaveBeenCalled();
    expect(prisma.conservationIncident.findMany).not.toHaveBeenCalled();
    expect(prisma.wildlifeConflictAlert.findMany).not.toHaveBeenCalled();
  },
);

test('shared lookup supports an empty park list', async () => {
  jest.mocked(prisma.park.findMany).mockResolvedValue([]);
  const response = await request(app).get('/api/parks');
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ success: true, data: [] });
});

test('shared lookup does not expose database errors', async () => {
  jest.mocked(prisma.park.findMany).mockRejectedValue(new Error('private database details'));
  const response = await request(app).get('/api/parks');
  expect(response.status).toBe(500);
  expect(response.body).toEqual({
    success: false,
    error: { message: 'Unable to load parks. Please try again.' },
  });
});

test('shared lookup exposes no park mutation routes', async () => {
  const responses = await Promise.all([
    request(app).post('/api/parks').send({ name: 'Unexpected write' }),
    request(app).patch('/api/parks'),
    request(app).delete('/api/parks'),
  ]);
  expect(responses.map((response) => response.status)).toEqual([404, 404, 404]);
  expect(prisma.park.findMany).not.toHaveBeenCalled();
});

test.each([undefined, 'RANGER'])(
  'shared lookup does not grant analytics access with role %s',
  async (role) => {
    for (const path of ['/api/analytics/parks', '/api/analytics']) {
      const lookup = request(app).get(path);
      if (role) lookup.set('x-user-role', role);
      expect((await lookup).status).toBe(403);
    }
    expect(prisma.park.findMany).not.toHaveBeenCalled();
  },
);

test('manager park lookup remains compatible', async () => {
  const response = await request(app)
    .get('/api/analytics/parks')
    .set('x-user-role', 'MANAGER');
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ success: true, data: parks });
});
