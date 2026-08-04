import { z } from 'zod';

export const OBJECT_CLEANUP_QUEUE_NAME = 'object-cleanup';
export const OBJECT_CLEANUP_JOB_NAME = 'delete-object';
export const OBJECT_CLEANUP_MAX_ATTEMPTS = 3;
export const OBJECT_CLEANUP_BACKOFF_DELAY_MS = 1_000;

export const objectCleanupJobDataSchema = z
  .object({
    jobExecutionId: z.uuid(),
  })
  .strict();

export type ObjectCleanupJobData = z.infer<typeof objectCleanupJobDataSchema>;

export type ObjectCleanupTarget =
  { id: string; kind: 'document' } | { id: string; kind: 'document-upload' };

export function createObjectCleanupIdempotencyKey(
  target: ObjectCleanupTarget,
): string {
  const id = z.uuid().parse(target.id);
  return `object-cleanup:${target.kind}:${id}:v1`;
}
