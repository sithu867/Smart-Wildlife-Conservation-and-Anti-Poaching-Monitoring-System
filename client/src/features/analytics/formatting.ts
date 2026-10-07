export function formatEnumLabel(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

const utcTimestamp = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'long',
  timeZone: 'UTC',
});

export function formatAnalysisTimestamp(value: string): string {
  const date = new Date(value);
  // This is presentation only: retain ISO evidence and UTC filter boundaries.
  return Number.isFinite(date.getTime())
    ? utcTimestamp.format(date)
    : 'Date unavailable';
}

export const REPORT_PRESENTATION = {
  enumLabel: formatEnumLabel,
  timestamp: formatAnalysisTimestamp,
};

export function formatReportCell(
  value: string | number,
  column: string,
): string | number {
  if (typeof value !== 'string') return value;
  // Format only typed analytical columns; route names, IDs, notes and exact
  // exported cells must never be rewritten by a generic text replacement.
  if (
    ['Category', 'Type', 'Status', 'Concentration', 'Bucket size'].includes(
      column,
    )
  )
    return formatEnumLabel(value);
  if (column === 'Last activity (UTC)' && value !== 'None')
    return formatAnalysisTimestamp(value);
  return value;
}
