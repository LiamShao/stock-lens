import { NonRetryablePdfError, extractPdfPages } from './pdf-text-extractor';

describe('extractPdfPages', () => {
  it('PROC-AC-002 extracts one-based page text and a stable hash', async () => {
    const pages = await extractPdfPages(createTextPdf('Hello StockLens'));

    expect(pages).toHaveLength(1);
    expect(pages[0]).toMatchObject({
      pageNumber: 1,
      text: 'Hello StockLens',
    });
    expect(pages[0]?.textSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('PROC-AC-007 classifies malformed PDF input as non-retryable', async () => {
    await expect(
      extractPdfPages(new TextEncoder().encode('%PDF-not-valid')),
    ).rejects.toBeInstanceOf(NonRetryablePdfError);
  });
});

function createTextPdf(text: string): Uint8Array {
  const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  pdf += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}
