import { randomUUID } from 'node:crypto';

const SAFE_SEGMENT_PATTERN = /^[a-zA-Z0-9_-]+$/;

export interface PdfObjectKeyInput {
  analysisId: string;
  ownerId: string;
  uploadId: string;
}

function requireSafeSegment(value: string, name: string): string {
  if (!SAFE_SEGMENT_PATTERN.test(value)) {
    throw new Error(`${name} must contain only letters, numbers, _ or -.`);
  }
  return value;
}

export function createPdfObjectKey(
  input: PdfObjectKeyInput,
  randomId: () => string = randomUUID,
): string {
  const ownerId = requireSafeSegment(input.ownerId, 'ownerId');
  const analysisId = requireSafeSegment(input.analysisId, 'analysisId');
  const uploadId = requireSafeSegment(input.uploadId, 'uploadId');
  const nonce = requireSafeSegment(randomId(), 'randomId');

  return `owners/${ownerId}/analyses/${analysisId}/uploads/${uploadId}/${nonce}.pdf`;
}
