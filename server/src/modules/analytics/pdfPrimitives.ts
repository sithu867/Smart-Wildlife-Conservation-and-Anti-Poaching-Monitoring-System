export const escapePdfText = (value: string) =>
  value
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[^\x20-\x7E]/g, '?');

export function serializePdfPages(
  streams: string[],
  font: 'Helvetica' | 'Courier',
): Buffer {
  // Reuse the existing basic report's PDF object/xref approach, with one page
  // and content stream per entry. Count bytes after text escaping, not before.
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${streams.map((_, index) => `${5 + index * 2} 0 R`).join(' ')}] /Count ${streams.length} >>`,
    `<< /Type /Font /Subtype /Type1 /BaseFont /${font} >>`,
    `<< /Type /Font /Subtype /Type1 /BaseFont /${font}-Bold >>`,
  ];
  streams.forEach((stream, index) => {
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + index * 2} 0 R >>`,
      `<< /Length ${Buffer.byteLength(stream, 'ascii')} >>\nstream\n${stream}\nendstream`,
    );
  });
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, 'ascii'));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const start = Buffer.byteLength(pdf, 'ascii');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n `)
    .join(
      '\n',
    )}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return Buffer.from(pdf, 'ascii');
}
