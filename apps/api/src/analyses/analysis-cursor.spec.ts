import { decodeAnalysisCursor, encodeAnalysisCursor } from './analysis-cursor';

describe('analysis cursor', () => {
  it('ANALYSIS-AC-004 round-trips a versioned opaque cursor', () => {
    const cursor = {
      createdAt: new Date('2026-07-24T12:00:00.000Z'),
      id: '2f7cbd41-9fb4-42c6-94b8-e10ee9642947',
    };

    const encoded = encodeAnalysisCursor(cursor);

    expect(encoded).not.toContain(cursor.id);
    expect(decodeAnalysisCursor(encoded)).toEqual(cursor);
  });

  it.each(['not base64!', 'e30', 'eyJ2ZXJzaW9uIjoyfQ'])(
    'ANALYSIS-AC-007 rejects an invalid cursor: %s',
    (cursor) => {
      expect(decodeAnalysisCursor(cursor)).toBeNull();
    },
  );
});
