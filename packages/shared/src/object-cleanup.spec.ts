import {
  createObjectCleanupIdempotencyKey,
  objectCleanupJobDataSchema,
} from './object-cleanup';

describe('object cleanup queue contract', () => {
  const id = '68fb17e9-5978-4d82-82e1-03bc061be725';

  it('creates a stable key without storage coordinates', () => {
    expect(
      createObjectCleanupIdempotencyKey({ id, kind: 'document-upload' }),
    ).toBe(`object-cleanup:document-upload:${id}:v1`);
  });

  it('accepts only a UUID job execution identifier', () => {
    expect(objectCleanupJobDataSchema.parse({ jobExecutionId: id })).toEqual({
      jobExecutionId: id,
    });
    expect(() =>
      objectCleanupJobDataSchema.parse({
        jobExecutionId: 'invalid',
        storageKey: 'must-not-cross-the-queue-boundary',
      }),
    ).toThrow();
  });
});
