import {
  buildReportDocument,
  type ConservationReportSnapshot,
} from './reportContract.js';

import { escapePdfText, serializePdfPages } from './pdfPrimitives.js';

function wrapText(value: string, width: number): string[] {
  // Long filter values/route names may have no spaces. Split those tokens as
  // well as normal prose, guaranteeing every line remains within the margins.
  const words = value.match(new RegExp(`\\S{1,${width}}`, 'g')) ?? [''];
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (line && line.length + word.length + 1 > width) {
      lines.push(line);
      line = '';
    }
    line += `${line ? ' ' : ''}${word}`;
  }
  lines.push(line);
  return lines;
}

export function generateReportPdf(
  snapshot: ConservationReportSnapshot,
): Buffer {
  const report = buildReportDocument(snapshot);
  const pages: string[][] = [[]];
  let y = 740;
  const text = (value: string, size: number, position: number, bold = false) =>
    `0.08 0.22 0.16 rg BT /${bold ? 'F2' : 'F1'} ${size} Tf 48 ${position} Td (${escapePdfText(value)}) Tj ET`;
  function newPage() {
    pages.push([]);
    y = 724;
    pages
      .at(-1)!
      .push(text('Statistical Conservation Report (continued)', 12, 752));
  }
  function line(value: string, heading = false, size = heading ? 12 : 10) {
    // Courier's fixed glyph width gives a conservative, deterministic wrap width.
    const wrapped = wrapText(value, Math.floor(500 / (size * 0.6)));
    if (heading && y - (wrapped.length + 2) * (size + 6) < 60) newPage();
    for (const part of wrapped) {
      if (y < 60) newPage();
      if (heading)
        pages
          .at(-1)!
          .push(`0.88 0.95 0.90 rg 44 ${y - 5} 524 ${size + 8} re f`);
      pages.at(-1)!.push(text(part, size, y, heading));
      y -= size + 6;
    }
    if (heading) y -= 4;
  }
  function section(title: string, lines: string[]) {
    y -= 10;
    line(title, true);
    lines.forEach((value) => line(value));
  }
  line(report.title, true, 18);
  report.header.forEach((value) => line(value));
  section(
    'Report Includes',
    report.includes.map((value, index) => `${index + 1}. ${value}`),
  );
  section('Analysis Scope', report.scope);
  section('Executive Summary', report.summary);
  report.sections.forEach((item) => section(item.title, item.lines));
  if (report.limitations.length)
    section('Data Scope and Limitations', report.limitations);

  pages.forEach((commands, index) => {
    commands.push(
      text(
        `WildlifeGuard | Page ${index + 1} of ${pages.length} | ${snapshot.park.code.slice(0, 40)}`,
        8,
        28,
      ),
    );
  });
  return serializePdfPages(
    pages.map((commands) => commands.join('\n')),
    'Courier',
  );
}
