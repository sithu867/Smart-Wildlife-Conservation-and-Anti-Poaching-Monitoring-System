import { AxiosError, type AxiosResponse } from 'axios';
import { http } from '../../shared/api/http';
import { analyticsApi } from './api';

// UC-D analytics API wrappers called for real with the shared HTTP client mocked: manager headers,
// endpoints, query parameters, and the export safety checks (report id, format, content type, filename).
const REPORT_ID = 'c67a000000000000000000001';
const signal = () => new AbortController().signal;
const ok = (data: unknown) => ({ data: { success: true, data } });
const summary = (overrides: Record<string, unknown> = {}) => ({
  id: REPORT_ID,
  version: 2,
  generatedAt: '2026-10-09T08:00:00.000Z',
  park: { id: 'park-1', name: 'Yala National Park', code: 'YALA-NP' },
  ...overrides
}) as unknown as Parameters<typeof analyticsApi.exportReport>[0];
const blobResponse = (type: string, headers: Record<string, string> = {}, body = 'file-bytes') => ({ data: new Blob([body], { type }), headers });
const manager = { 'x-user-role': 'MANAGER' };

let clicked: HTMLAnchorElement[];
beforeEach(() => {
  clicked = [];
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    clicked.push(this);
  });
  URL.createObjectURL = vi.fn(() => 'blob:report');
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => vi.restoreAllMocks());

describe('analytics requests', () => {
  test('listParks reads the park list without the manager header', async () => {
    const get = vi.spyOn(http, 'get').mockResolvedValue(ok([{ id: 'park-1' }]));
    const abort = signal();
    expect(await analyticsApi.listParks(abort)).toEqual([{ id: 'park-1' }]);
    expect(get).toHaveBeenCalledWith('/parks', { signal: abort });
  });

  test('analyze sends the criteria as repeated query parameters with the manager role', async () => {
    const get = vi.spyOn(http, 'get').mockResolvedValue(ok({ status: 'DATA' }));
    const criteria = { parkId: 'park-1', start: '2026-10-01', end: '2026-10-07', categories: ['INCIDENT_FREQUENCY', 'HWC_TRENDS'] } as unknown as Parameters<typeof analyticsApi.analyze>[0];

    expect(await analyticsApi.analyze(criteria, signal())).toEqual({ status: 'DATA' });

    const [url, config] = get.mock.calls[0] as [string, { params: Record<string, unknown>; headers: unknown; paramsSerializer: unknown }];
    expect(url).toBe('/analytics');
    expect(config.headers).toEqual(manager);
    expect(config.paramsSerializer).toEqual({ indexes: false });
    expect(config.params).toMatchObject({ parkId: 'park-1', start: '2026-10-01', end: '2026-10-07', categories: ['INCIDENT_FREQUENCY', 'HWC_TRENDS'] });
  });

  test('saved-report calls use the matching endpoints and send only criteria / metadata', async () => {
    const post = vi.spyOn(http, 'post').mockResolvedValue(ok({ id: REPORT_ID }));
    const get = vi.spyOn(http, 'get').mockResolvedValue(ok({ items: [] }));
    const patch = vi.spyOn(http, 'patch').mockResolvedValue(ok({ id: REPORT_ID, title: 'New title' }));
    const del = vi.spyOn(http, 'delete').mockResolvedValue({ data: {} });
    const input = { criteria: { parkId: 'park-1' }, metadata: { title: 'Q3' } } as unknown as Parameters<typeof analyticsApi.generateReport>[0];

    await analyticsApi.generateReport(input, signal());
    await analyticsApi.listReports(signal());
    await analyticsApi.listReports(signal(), 'cursor-2');
    await analyticsApi.getReport(REPORT_ID, signal());
    expect(await analyticsApi.updateReport(REPORT_ID, { title: 'New title' } as never, signal())).toEqual({ id: REPORT_ID, title: 'New title' });
    await analyticsApi.archiveReport(REPORT_ID, signal());
    await analyticsApi.regenerateReport(REPORT_ID, signal());

    expect(post.mock.calls.map(call => [call[0], call[1]])).toEqual([['/analytics/reports', input], [`/analytics/reports/${REPORT_ID}/regenerate`, {}]]);
    expect(get.mock.calls.map(call => [call[0], (call[1] as { params?: unknown }).params])).toEqual([
      ['/analytics/reports', {}],
      ['/analytics/reports', { cursor: 'cursor-2' }],
      [`/analytics/reports/${REPORT_ID}`, undefined]
    ]);
    expect(patch).toHaveBeenCalledWith(`/analytics/reports/${REPORT_ID}`, { title: 'New title' }, expect.objectContaining({ headers: manager }));
    expect(del).toHaveBeenCalledWith(`/analytics/reports/${REPORT_ID}`, expect.objectContaining({ headers: manager }));
  });

  test('a server error (e.g. 409 report changed elsewhere) is passed to the caller unchanged', async () => {
    const conflict = new AxiosError('Request failed with status code 409', 'ERR_BAD_REQUEST', undefined, undefined, { status: 409, data: {} } as AxiosResponse);
    vi.spyOn(http, 'patch').mockRejectedValue(conflict);
    await expect(analyticsApi.updateReport(REPORT_ID, {} as never, signal())).rejects.toBe(conflict);
  });
});

describe('exportReport', () => {
  test('a PDF export downloads the file under the server-issued filename', async () => {
    const get = vi.spyOn(http, 'get').mockResolvedValue(blobResponse('application/pdf', { 'content-disposition': 'attachment; filename="conservation-report-yala-np-2026-10-09-v2.pdf"' }));

    const filename = await analyticsApi.exportReport(summary(), signal());

    expect(get).toHaveBeenCalledWith(`/analytics/reports/${REPORT_ID}/pdf`, expect.objectContaining({ responseType: 'blob', headers: manager }));
    expect(filename).toBe('conservation-report-yala-np-2026-10-09-v2.pdf');
    expect(clicked).toHaveLength(1);
    expect(clicked[0].download).toBe(filename);
    expect(clicked[0].href).toBe('blob:report');
    expect(document.querySelector('a[download]')).toBeNull();
  });

  test.each([
    ['csv', 'text/csv; charset=utf-8'],
    ['xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
  ] as const)('a %s export uses the export endpoint with the format parameter', async (format, type) => {
    const get = vi.spyOn(http, 'get').mockResolvedValue(blobResponse(type));
    expect(await analyticsApi.exportReport(summary(), signal(), format)).toBe(`conservation-report-yala-np-2026-10-09-v2.${format}`);
    expect(get).toHaveBeenCalledWith(`/analytics/reports/${REPORT_ID}/export`, expect.objectContaining({ params: { format } }));
  });

  test.each([
    ['a path traversal name', 'attachment; filename="../../etc/passwd.pdf"'],
    ['a name with spaces and capitals', 'attachment; filename="My Report.pdf"'],
    ['a name with the wrong extension', 'attachment; filename="report.exe"']
  ])('%s from the server is not used; a safe local name is built instead', async (_label, disposition) => {
    vi.spyOn(http, 'get').mockResolvedValue(blobResponse('application/pdf', { 'content-disposition': disposition }));
    expect(await analyticsApi.exportReport(summary(), signal())).toBe('conservation-report-yala-np-2026-10-09-v2.pdf');
  });

  test.each([
    ['an invalid report id', summary({ id: '../reports' }), 'pdf'],
    ['an unsupported format', summary(), 'html']
  ])('%s is refused before any request is made', async (_label, report, format) => {
    const get = vi.spyOn(http, 'get');
    await expect(analyticsApi.exportReport(report, signal(), format as 'pdf')).rejects.toThrow('Invalid report ID or export format');
    expect(get).not.toHaveBeenCalled();
  });

  test.each([
    ['an HTML error page instead of a PDF', blobResponse('text/html')],
    ['an empty file', blobResponse('application/pdf', {}, '')]
  ])('%s is rejected and nothing is downloaded', async (_label, response) => {
    vi.spyOn(http, 'get').mockResolvedValue(response);
    await expect(analyticsApi.exportReport(summary(), signal())).rejects.toThrow('Invalid or cancelled export response');
    expect(clicked).toHaveLength(0);
  });

  test('an export cancelled while downloading is not saved', async () => {
    const controller = new AbortController();
    vi.spyOn(http, 'get').mockImplementation(async () => {
      controller.abort();
      return blobResponse('application/pdf');
    });
    await expect(analyticsApi.exportReport(summary(), controller.signal)).rejects.toThrow('Invalid or cancelled export response');
    expect(clicked).toHaveLength(0);
  });

  test('a failed download request is passed to the caller', async () => {
    vi.spyOn(http, 'get').mockRejectedValue(new AxiosError('Network Error', 'ERR_NETWORK'));
    await expect(analyticsApi.exportReport(summary(), signal())).rejects.toThrow('Network Error');
    expect(clicked).toHaveLength(0);
  });
});
