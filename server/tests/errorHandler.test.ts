import { jest } from '@jest/globals';
import express, { type RequestHandler } from 'express';
import request from 'supertest';
import { z } from 'zod';
import { errorHandler, notFound } from '../src/middleware/errors.js';
import { AppError } from '../src/modules/shared/appError.js';

// Shared Express error handling used by every module (UC-A to UC-D).
// Known application errors keep their intended status and message; anything unexpected
// becomes a generic 500 so database or internal details never reach the client.

function appThrowing(thrown: unknown) {
  const app = express();
  app.use(express.json({ limit: '1kb' }));
  const fail: RequestHandler = () => {
    throw thrown;
  };
  app.get('/fail', fail);
  app.post('/echo', (req, res) => res.json(req.body));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

let consoleError: ReturnType<typeof jest.spyOn>;
beforeEach(() => {
  consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('known application errors', () => {
  test('an AppError keeps its status, message, code and details', async () => {
    const details = { currentVersion: 3 };
    const res = await request(appThrowing(new AppError(409, 'EDIT_CONFLICT', 'This report was changed by someone else.', details))).get('/fail');

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ success: false, error: { message: 'This report was changed by someone else.', code: 'EDIT_CONFLICT', details } });
  });

  test('an AppError without details does not add a details field', async () => {
    const res = await request(appThrowing(new AppError(403, 'FORBIDDEN', 'Only the reporting ranger can edit this incident.'))).get('/fail');

    expect(res.status).toBe(403);
    expect(res.body.error).toEqual({ message: 'Only the reporting ranger can edit this incident.', code: 'FORBIDDEN' });
  });

  test('a zod validation error is a 400 listing each field', async () => {
    const parsed = z.object({ latitude: z.number().max(90, 'Latitude must be between -90 and 90'), notes: z.string({ required_error: 'Notes are required' }) }).safeParse({ latitude: 120 });

    const res = await request(appThrowing(parsed.error)).get('/fail');

    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({
      message: 'Latitude must be between -90 and 90, Notes are required',
      code: 'VALIDATION_ERROR',
      details: [
        { path: 'latitude', message: 'Latitude must be between -90 and 90' },
        { path: 'notes', message: 'Notes are required' }
      ]
    });
  });

  test('a legacy "not found" error is a 404 with its message', async () => {
    const res = await request(appThrowing(new Error('Alert not found'))).get('/fail');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, error: { message: 'Alert not found' } });
  });

  test('a legacy "Unauthorized" error is a 403 with its message', async () => {
    const res = await request(appThrowing(new Error('Unauthorized: only the responder can edit this response'))).get('/fail');

    expect(res.status).toBe(403);
    expect(res.body.error.message).toBe('Unauthorized: only the responder can edit this response');
  });

  test('an unknown route is a 404 with a stable code', async () => {
    const res = await request(appThrowing(new Error('unused'))).get('/no-such-route');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, error: { message: 'Route not found', code: 'ROUTE_NOT_FOUND' } });
  });
});

describe('request body errors', () => {
  test('malformed JSON is a 400 that does not echo the body', async () => {
    const res = await request(appThrowing(null)).post('/echo').set('Content-Type', 'application/json').send('{"password": "hunter2"');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: { message: 'Request must contain valid JSON.' } });
    expect(JSON.stringify(res.body)).not.toContain('hunter2');
  });

  test('a body over the size limit is a 413 with a stable code', async () => {
    const res = await request(appThrowing(null)).post('/echo').send({ data: 'x'.repeat(2048) });

    expect(res.status).toBe(413);
    expect(res.body.error).toEqual({ message: 'Request body exceeds the 8 MB limit.', code: 'PAYLOAD_TOO_LARGE' });
  });
});

describe('unexpected internal errors', () => {
  test('an internal error message is not returned to the client', async () => {
    const res = await request(appThrowing(new Error('database password xyz'))).get('/fail');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, error: { message: 'Internal server error' } });
    expect(JSON.stringify(res.body)).not.toContain('database password xyz');
  });

  test('a database driver error exposes neither its message nor its stack trace', async () => {
    const dbError = Object.assign(new Error('Invalid `prisma.incident.create()` invocation: connect ECONNREFUSED 10.0.0.5:5432'), { code: 'P1001' });

    const res = await request(appThrowing(dbError)).get('/fail');

    const body = JSON.stringify(res.body);
    expect(res.status).toBe(500);
    expect(body).not.toContain('prisma');
    expect(body).not.toContain('10.0.0.5');
    expect(body).not.toContain('P1001');
    expect(body).not.toContain('at ');
  });

  test('the original error is still logged on the server for diagnosis', async () => {
    const internal = new Error('database password xyz');

    await request(appThrowing(internal)).get('/fail');

    expect(consoleError).toHaveBeenCalledWith('Unhandled API error:', internal);
  });

  test.each([
    ['a thrown string', 'raw failure text'],
    ['a thrown object', { message: 'object message', secret: 's3cr3t' }]
  ])('%s becomes a generic 500', async (_label, thrown) => {
    const res = await request(appThrowing(thrown)).get('/fail');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, error: { message: 'Internal server error' } });
  });

  test('an error raised after the response started is passed on to Express instead of writing a second response', () => {
    const error = new Error('stream broke');
    const res = { headersSent: true, status: jest.fn(), json: jest.fn() };
    const next = jest.fn();

    errorHandler(error, {} as never, res as never, next);

    expect(next).toHaveBeenCalledWith(error);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});
