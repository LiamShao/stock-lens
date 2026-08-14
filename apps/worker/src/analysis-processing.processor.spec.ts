import { Readable } from 'node:stream';

import { MAX_PDF_SIZE_BYTES } from '@stocklens/object-storage';

import { readPdfStreamBounded } from './analysis-processing.processor';
import type { NonRetryablePdfError } from './pdf-text-extractor';

describe('readPdfStreamBounded', () => {
  it('PROC-SEC-004/PROC-SEC-007 accepts exactly 20 MB', async () => {
    const bytes = await readPdfStreamBounded(
      Readable.from([Buffer.alloc(MAX_PDF_SIZE_BYTES)]),
    );

    expect(bytes.byteLength).toBe(MAX_PDF_SIZE_BYTES);
  });

  it('PROC-AC-007/PROC-SEC-007 destroys an over-limit stream with a stable error', async () => {
    const stream = Readable.from([
      Buffer.alloc(MAX_PDF_SIZE_BYTES),
      Buffer.from([0]),
    ]);

    await expect(readPdfStreamBounded(stream)).rejects.toEqual(
      expect.objectContaining<Partial<NonRetryablePdfError>>({
        code: 'PDF_SIZE_LIMIT_EXCEEDED',
        message: 'PDF size limit exceeded.',
      }),
    );
    expect(stream.destroyed).toBe(true);
  });

  it('PROC-SEC-005 rejects invalid stream data without echoing its value', async () => {
    await expect(
      readPdfStreamBounded(
        Readable.from([{ secret: 'raw-provider-value' }], { objectMode: true }),
      ),
    ).rejects.toEqual(
      expect.objectContaining<Partial<NonRetryablePdfError>>({
        code: 'PDF_STREAM_INVALID',
        message: 'PDF stream is invalid.',
      }),
    );
  });
});
