import { randomUUID } from 'node:crypto';

export const MAX_REQUEST_ID_LENGTH = 128;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]+$/;

export function resolveRequestId(
  requestId: string | string[] | undefined,
): string {
  if (
    typeof requestId === 'string' &&
    requestId.length > 0 &&
    requestId.length <= MAX_REQUEST_ID_LENGTH &&
    REQUEST_ID_PATTERN.test(requestId)
  ) {
    return requestId;
  }
  return randomUUID();
}
