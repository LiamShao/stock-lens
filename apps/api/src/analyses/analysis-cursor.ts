import { z } from 'zod';

import type { AnalysisListCursor } from '../database/analysis.repository';

const CURSOR_PATTERN = /^[A-Za-z0-9_-]+$/u;

const cursorPayloadSchema = z
  .object({
    createdAt: z.iso.datetime(),
    id: z.uuid(),
    version: z.literal(1),
  })
  .strict();

export function encodeAnalysisCursor(cursor: AnalysisListCursor): string {
  return Buffer.from(
    JSON.stringify({
      createdAt: cursor.createdAt.toISOString(),
      id: cursor.id,
      version: 1,
    }),
  ).toString('base64url');
}

export function decodeAnalysisCursor(
  encoded: string,
): AnalysisListCursor | null {
  if (!CURSOR_PATTERN.test(encoded)) {
    return null;
  }
  try {
    const payload: unknown = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8'),
    );
    const result = cursorPayloadSchema.safeParse(payload);
    if (!result.success) {
      return null;
    }
    return {
      createdAt: new Date(result.data.createdAt),
      id: result.data.id,
    };
  } catch {
    return null;
  }
}
