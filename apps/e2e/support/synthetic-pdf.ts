export function createSyntheticPdf(pageCount = 3): Uint8Array {
  if (!Number.isInteger(pageCount) || pageCount < 1 || pageCount > 20) {
    throw new Error('Synthetic PDF page count must be between 1 and 20.');
  }

  const pageObjectNumbers = Array.from(
    { length: pageCount },
    (_, index) => 4 + index * 2,
  );
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageObjectNumbers.map((number) => `${number} 0 R`).join(' ')}] /Count ${pageCount} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  for (let index = 0; index < pageCount; index += 1) {
    const contentObjectNumber = 5 + index * 2;
    const stream = `BT /F1 24 Tf 72 720 Td (StockLens Evidence Page ${index + 1}) Tj ET`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`,
      `<< /Length ${byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    );
  }

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  pdf += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}
