import {
  CHUNK_OVERLAP_CHARACTERS,
  CHUNK_SIZE_CHARACTERS,
  chunkPages,
} from './page-chunker';

describe('chunkPages', () => {
  it('PROC-AC-004 keeps chunks inside one page with stable overlap', () => {
    const first = 'あ'.repeat(CHUNK_SIZE_CHARACTERS + 300);
    const chunks = chunkPages([
      {
        id: 'page-1',
        pageNumber: 1,
        sectionMetadata: { heading: '第1章 事業概要' },
        text: first,
      },
      {
        id: 'page-2',
        pageNumber: 2,
        sectionMetadata: null,
        text: '別ページ',
      },
    ]);

    expect(chunks).toHaveLength(3);
    expect(Array.from(chunks[0]?.content ?? '')).toHaveLength(
      CHUNK_SIZE_CHARACTERS,
    );
    expect(
      chunks[1]?.content.startsWith('あ'.repeat(CHUNK_OVERLAP_CHARACTERS)),
    ).toBe(true);
    expect(chunks[0]?.pageId).toBe('page-1');
    expect(chunks[1]?.pageId).toBe('page-1');
    expect(chunks[2]?.pageId).toBe('page-2');
    expect(chunks[0]?.section).toBe('第1章 事業概要');
  });

  it('PROC-FR-003 produces no chunks for an empty page', () => {
    expect(
      chunkPages([
        { id: 'page-1', pageNumber: 1, sectionMetadata: null, text: '' },
      ]),
    ).toEqual([]);
  });
});
