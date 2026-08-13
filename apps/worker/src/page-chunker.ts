import { createHash } from 'node:crypto';

export const CHUNK_SIZE_CHARACTERS = 1_200;
export const CHUNK_OVERLAP_CHARACTERS = 150;

export interface PageForChunking {
  id: string;
  pageNumber: number;
  sectionMetadata: unknown;
  text: string;
}

export interface GeneratedChunk {
  content: string;
  contentSha256: string;
  pageId: string;
  section: string | null;
}

export function chunkPages(
  pages: readonly PageForChunking[],
): GeneratedChunk[] {
  return pages.flatMap((page) => chunkPage(page));
}

function chunkPage(page: PageForChunking): GeneratedChunk[] {
  const characters = Array.from(page.text);
  if (characters.length === 0) return [];
  const chunks: GeneratedChunk[] = [];
  let start = 0;
  while (start < characters.length) {
    let end = Math.min(start + CHUNK_SIZE_CHARACTERS, characters.length);
    if (end < characters.length) {
      const boundary = findBoundary(characters, start, end);
      if (boundary > start) end = boundary;
    }
    const content = characters.slice(start, end).join('').trim();
    if (content !== '') {
      chunks.push({
        content,
        contentSha256: createHash('sha256').update(content).digest('hex'),
        pageId: page.id,
        section: readHeading(page.sectionMetadata),
      });
    }
    if (end >= characters.length) break;
    const next = Math.max(end - CHUNK_OVERLAP_CHARACTERS, start + 1);
    start = next;
  }
  return chunks;
}

function findBoundary(
  characters: readonly string[],
  start: number,
  end: number,
): number {
  const lowerBound = Math.max(start + 1, end - 200);
  for (let index = end; index >= lowerBound; index -= 1) {
    if (/\s/u.test(characters[index - 1] ?? '')) return index;
  }
  return end;
}

function readHeading(metadata: unknown): string | null {
  if (
    typeof metadata !== 'object' ||
    metadata === null ||
    !('heading' in metadata)
  )
    return null;
  return typeof metadata.heading === 'string' ? metadata.heading : null;
}
