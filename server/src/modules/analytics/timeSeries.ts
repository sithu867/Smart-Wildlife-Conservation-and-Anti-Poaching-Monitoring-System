import type { AnalyticsTimeSeries, TimeBucket } from './contract.js';

const DAY_MS = 86_400_000;
function chooseBucket(start: Date, end: Date): TimeBucket {
  const days = Math.ceil((end.getTime() - start.getTime() + 1) / DAY_MS);
  return days <= 31
    ? 'DAY'
    : days <= 180
      ? 'WEEK'
      : days <= 730
        ? 'MONTH'
        : 'YEAR';
}
function bucketStart(value: Date, bucket: TimeBucket): Date {
  const date = new Date(value);
  date.setUTCHours(0, 0, 0, 0);
  if (bucket === 'WEEK')
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  if (bucket === 'MONTH' || bucket === 'YEAR') date.setUTCDate(1);
  if (bucket === 'YEAR') date.setUTCMonth(0);
  return date;
}
function advance(date: Date, bucket: TimeBucket): void {
  if (bucket === 'YEAR') date.setUTCFullYear(date.getUTCFullYear() + 1);
  else if (bucket === 'MONTH') date.setUTCMonth(date.getUTCMonth() + 1);
  else date.setUTCDate(date.getUTCDate() + (bucket === 'WEEK' ? 7 : 1));
}

export function buildTimeSeries(
  values: Array<Date | string>,
  start: Date,
  end: Date,
): AnalyticsTimeSeries {
  const bucket = chooseBucket(start, end);
  const counts = new Map<string, number>();
  // Calendar-aligned UTC buckets are zero-filled to expose quiet periods rather
  // than visually joining unrelated active dates. First/last buckets may be
  // partial; only events inside the inclusive applied range contribute.
  // Year buckets bound output for very long ranges accepted by Batch 1.
  for (
    const cursor = bucketStart(start, bucket);
    cursor <= end;
    advance(cursor, bucket)
  ) {
    counts.set(cursor.toISOString().slice(0, 10), 0);
  }
  for (const value of values) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime()) || date < start || date > end)
      continue;
    const key = bucketStart(date, bucket).toISOString().slice(0, 10);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return {
    bucket,
    points: [...counts].map(([date, count]) => ({ date, count })),
  };
}
