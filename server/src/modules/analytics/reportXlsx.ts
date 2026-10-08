import writeExcelFile, {
  type Cell,
  type SheetData,
} from 'write-excel-file/node';
import type { ReportTableSection } from './reportTables.js';

function sheetData(section: ReportTableSection): SheetData {
  const rows: SheetData = [];
  for (const table of section.tables) {
    rows.push([{ value: table.title, fontWeight: 'bold' }]);
    rows.push(table.columns.map((value) => ({ value, fontWeight: 'bold' })));
    for (const row of table.rows)
      rows.push(
        row.map((value): Cell =>
          // Explicit string cells keep metadata/names as text, never formulas.
          typeof value === 'number'
            ? { value, type: Number }
            : { value, type: String, wrap: true },
        ),
      );
    rows.push([]);
  }
  return rows;
}

export async function generateReportXlsx(
  sections: ReportTableSection[],
): Promise<Buffer> {
  return writeExcelFile(
    sections.map((section) => ({
      sheet: section.title,
      data: sheetData(section),
      columns: Array.from(
        {
          length: Math.max(
            ...section.tables.map((table) => table.columns.length),
          ),
        },
        (_, index) => ({ width: index === 0 ? 30 : index === 1 ? 54 : 22 }),
      ),
    })),
  ).toBuffer();
}
