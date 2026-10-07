import { jest } from '@jest/globals';
import {
  analysisCriteriaSchema,
  analysisDateRange,
} from '../src/modules/analytics/validation.js';
import {
  includesElapsedAnalysisDay,
  MIN_ANALYSIS_DATE,
  FUTURE_PERIOD_MESSAGE,
  SUPPORTED_DATE_MESSAGE,
} from '../src/modules/analytics/contract.js';
import { updateStatisticalReportSchema } from '../src/modules/analytics/savedReportValidation.js';
import { metadataIssueErrors } from '../src/modules/analytics/metadataValidation.js';
import { reportFilename } from '../src/modules/analytics/reportContract.js';

const criteria = {
  parkId: 'c67a000000000000000000001',
  categories: ['PATROL_COVERAGE'],
  start: '2026-10-07',
  end: '2026-10-07',
};

beforeEach(() =>
  jest.useFakeTimers({ now: new Date('2026-10-07T00:01:00.000Z') }),
);
afterEach(() => jest.useRealTimers());

test.each([
  ['historical', '2026-09-01', '2026-09-30', true],
  ['today', '2026-10-07', '2026-10-07', true],
  ['today through future', '2026-10-07', '2026-10-30', true],
  ['tomorrow', '2026-10-08', '2026-10-08', false],
  ['entirely future', '2026-10-20', '2026-10-30', false],
  ['reversed', '2026-10-07', '2026-10-06', false],
])(
  '%s period validation is evaluated at parse time',
  (_name, start, end, valid) => {
    const parsed = analysisCriteriaSchema.safeParse({
      ...criteria,
      start,
      end,
    });
    expect(parsed.success).toBe(valid);
    if (!parsed.success && start > '2026-10-07')
      expect(parsed.error.issues).toContainEqual(
        expect.objectContaining({
          path: ['start'],
          message: FUTURE_PERIOD_MESSAGE,
        }),
      );
  },
);

test('UTC day rollover is independent of local timezone and schema creation time', () => {
  expect(
    includesElapsedAnalysisDay(
      '2026-10-07',
      new Date('2026-10-08T00:15:00+05:30'),
    ),
  ).toBe(true);
  expect(
    includesElapsedAnalysisDay(
      '2026-10-08',
      new Date('2026-10-08T00:15:00+05:30'),
    ),
  ).toBe(false);
  jest.setSystemTime(new Date('2026-10-08T00:00:00Z'));
  expect(
    analysisCriteriaSchema.safeParse({
      ...criteria,
      start: '2026-10-08',
      end: '2026-10-08',
    }).success,
  ).toBe(true);
  expect(analysisDateRange(criteria)).toEqual({
    start: new Date('2026-10-07T00:00:00.000Z'),
    end: new Date('2026-10-07T23:59:59.999Z'),
  });
});

test.each([
  ['0000-01-01', false],
  ['not-a-date', false],
  ['2026-02-30', false],
  [MIN_ANALYSIS_DATE, true],
  ['2026-09-01', true],
])('supported boundary %s', (start, valid) => {
  const parsed = analysisCriteriaSchema.safeParse({ ...criteria, start });
  expect(parsed.success).toBe(valid);
  if (start.startsWith('0000') && !parsed.success)
    expect(parsed.error.issues[0].message).toBe(SUPPORTED_DATE_MESSAGE);
});

test.each([
  [{ title: '  Manager review  ', notes: '  Evidence  ' }, true],
  [{ notes: null }, true],
  [{ title: ' ' }, false],
  [{ title: 'x'.repeat(201) }, false],
  [{ notes: 'x'.repeat(5001) }, false],
  [{ title: 123 }, false],
  [{ notes: {} }, false],
  [{ title: 'Valid', version: 9 }, false],
  [{ title: 'Valid', criteria }, false],
  [{ snapshot: {} }, false],
])('metadata keeps the strict allow-list: %j', (metadata, valid) => {
  expect(updateStatisticalReportSchema.safeParse(metadata).success).toBe(valid);
});

test('metadata errors contain only approved field messages', () => {
  const parsed = updateStatisticalReportSchema.safeParse({
    title: '',
    notes: 'x'.repeat(5001),
  });
  expect(parsed.success).toBe(false);
  if (!parsed.success)
    expect(metadataIssueErrors(parsed.error.issues)).toEqual({
      title: 'Enter a report title (1-200 characters).',
      notes: 'Notes must be at most 5000 characters.',
    });
  expect(
    metadataIssueErrors([
      { path: ['title'], message: 'private database stack' },
    ]),
  ).toEqual({});
});

test('filename versions reject unsafe runtime values', () => {
  for (const version of [
    0,
    -1,
    1.5,
    NaN,
    '1\r\nInjected: yes' as unknown as number,
  ])
    expect(() =>
      reportFilename({
        park: { id: criteria.parkId, name: 'Park', code: '../Park\r\nName' },
        generatedAt: '2026-10-07T00:00:00Z',
        version,
      }),
    ).toThrow('Invalid saved report version');
});
