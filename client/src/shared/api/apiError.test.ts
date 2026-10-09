import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios';
import { ApiError, toApiError } from './apiError';

// Shared by UC-A, UC-B and UC-C: an HTTP answer becomes an ApiError shown to the user,
// while a request with no answer returns null so the caller can fall back to offline mode.

function responseError(status: number, data: unknown): AxiosError {
  const config = { headers: new AxiosHeaders() };
  const response = { status, statusText: '', headers: {}, config, data } as AxiosResponse;
  return new AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_RESPONSE', config, {}, response);
}

describe('toApiError', () => {
  test('keeps the server message, status, code and details', () => {
    const details = [{ path: 'latitude', message: 'Latitude must be between -90 and 90' }];
    const error = toApiError(responseError(400, { success: false, error: { message: 'Invalid location', code: 'VALIDATION_ERROR', details } }));

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({ name: 'ApiError', message: 'Invalid location', status: 400, code: 'VALIDATION_ERROR', details });
  });

  test.each([401, 403, 404, 409, 429, 500, 503])('HTTP %i is converted with its status', status => {
    expect(toApiError(responseError(status, { error: { message: 'Server said no' } }))).toMatchObject({ status, message: 'Server said no' });
  });

  test.each([
    ['an empty body', undefined],
    ['a body without an error object', { success: false }],
    ['an error object without a message', { error: { code: 'X' } }],
    ['an empty message', { error: { message: '' } }],
    ['an HTML error page', '<html>502 Bad Gateway</html>']
  ])('%s falls back to a message with the status', (_label, body) => {
    const error = toApiError(responseError(502, body));

    expect(error?.message).toBe('Request failed (502).');
    expect(error?.status).toBe(502);
  });

  test('a response without details does not invent them', () => {
    const error = toApiError(responseError(409, { error: { message: 'Conflict', code: 'EDIT_CONFLICT' } }));
    expect(error?.details).toBeUndefined();
  });

  test.each([
    ['a network failure (no response)', new AxiosError('Network Error', 'ERR_NETWORK', { headers: new AxiosHeaders() }, {})],
    ['a timeout', new AxiosError('timeout of 10000ms exceeded', 'ECONNABORTED', { headers: new AxiosHeaders() }, {})],
    ['a plain Error', new Error('boom')],
    ['a thrown string', 'offline'],
    ['undefined', undefined]
  ])('%s returns null so the caller can treat it as offline', (_label, thrown) => {
    expect(toApiError(thrown)).toBeNull();
  });
});

describe('http client', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  test('uses the configured API address', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.test/api');
    vi.resetModules();
    const { http } = await import('./http');
    expect(http.defaults.baseURL).toBe('https://api.example.test/api');
  });

  test('falls back to the local development API when none is configured', async () => {
    vi.stubEnv('VITE_API_URL', undefined as unknown as string);
    vi.resetModules();
    const { http } = await import('./http');
    expect(http.defaults.baseURL).toBe('http://localhost:5000/api');
  });
});
