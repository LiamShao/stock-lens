import { createHash } from 'node:crypto';

export const MAX_PDF_PAGES = 500;
export const MAX_PAGE_TEXT_BYTES = 2 * 1024 * 1024;
export const MAX_DOCUMENT_TEXT_BYTES = 50 * 1024 * 1024;

export interface ExtractedPage {
  pageNumber: number;
  sectionMetadata: { heading: string; detectorVersion: 'heading-v1' } | null;
  text: string;
  textSha256: string;
}

export class NonRetryablePdfError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function extractPdfPages(
  data: Uint8Array,
): Promise<ExtractedPage[]> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({
    data: new Uint8Array(data),
    disableFontFace: true,
    useSystemFonts: false,
    useWorkerFetch: false,
    verbosity: 0,
  });
  try {
    const document = await task.promise;
    if (document.numPages > MAX_PDF_PAGES) {
      throw new NonRetryablePdfError(
        'PDF_PAGE_LIMIT_EXCEEDED',
        'PDF page limit exceeded.',
      );
    }

    const pages: ExtractedPage[] = [];
    let totalBytes = 0;
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent({
        disableNormalization: false,
      });
      const pieces: string[] = [];
      for (const item of content.items) {
        if (!('str' in item)) continue;
        pieces.push(item.str);
        pieces.push(item.hasEOL ? '\n' : ' ');
      }
      const text = pieces
        .join('')
        .replace(/[ \t]+\n/g, '\n')
        .trim();
      const size = Buffer.byteLength(text, 'utf8');
      if (size > MAX_PAGE_TEXT_BYTES) {
        throw new NonRetryablePdfError(
          'PDF_PAGE_TEXT_LIMIT_EXCEEDED',
          'PDF page text limit exceeded.',
        );
      }
      totalBytes += size;
      if (totalBytes > MAX_DOCUMENT_TEXT_BYTES) {
        throw new NonRetryablePdfError(
          'PDF_TEXT_LIMIT_EXCEEDED',
          'PDF text limit exceeded.',
        );
      }
      pages.push({
        pageNumber,
        sectionMetadata: detectSection(text),
        text,
        textSha256: createHash('sha256').update(text).digest('hex'),
      });
      page.cleanup();
    }
    return pages;
  } catch (error) {
    if (error instanceof NonRetryablePdfError) throw error;
    const name = error instanceof Error ? error.name : '';
    if (/Password|InvalidPDF|Format/i.test(name)) {
      throw new NonRetryablePdfError(
        'PDF_PARSE_INVALID',
        'PDF could not be parsed.',
      );
    }
    throw error;
  } finally {
    await task.destroy();
  }
}

function detectSection(text: string): ExtractedPage['sectionMetadata'] {
  const heading = text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find((line) => line.length >= 2 && line.length <= 80);
  if (!heading) return null;
  const looksLikeHeading =
    /^(第[一二三四五六七八九十0-9]+|[0-9０-９]+[.．、]|[（(]?[一二三四五六七八九十]+[）)]|【.+】)/u.test(
      heading,
    ) || !/[。！？.!?]$/u.test(heading);
  return looksLikeHeading ? { detectorVersion: 'heading-v1', heading } : null;
}
