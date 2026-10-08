import type { AnalyticsGroup } from './contract.js';

export function groupBy<T>(rows: T[], key: keyof T): AnalyticsGroup[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const name = String(row[key] ?? 'UNKNOWN');
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
