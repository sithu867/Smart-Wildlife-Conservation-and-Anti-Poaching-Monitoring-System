import type { ReportCell, ReportTableSection } from './reportTables.js';

function csvCell(value: ReportCell): string {
  let text = String(value);
  // Quoting does not stop spreadsheet formula injection. Protect text from
  // manager metadata and stored names while keeping numeric values numeric.
  if (typeof value === 'string' && /^[\s\u0000-\u001f]*[=+@-]/.test(text))
    text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function generateReportCsv(sections: ReportTableSection[]): Buffer {
  // A fixed-width CSV with explicit section/table markers is readable both as
  // a spreadsheet and by a standard CSV parser; no JSON is hidden in cells.
  const width =
    2 +
    Math.max(
      ...sections.flatMap((section) =>
        section.tables.map((table) => table.columns.length),
      ),
    );
  const rows: ReportCell[][] = [['Section', 'Table', 'Values']];
  for (const section of sections) {
    for (const table of section.tables) {
      rows.push([section.title, table.title, ...table.columns]);
      for (const row of table.rows)
        rows.push([section.title, table.title, ...row]);
    }
  }
  return Buffer.from(
    '\uFEFF' +
      rows
        .map((row) =>
          Array.from({ length: width }, (_, index) =>
            csvCell(row[index] ?? ''),
          ).join(','),
        )
        .join('\r\n') +
      '\r\n',
    'utf8',
  );
}
