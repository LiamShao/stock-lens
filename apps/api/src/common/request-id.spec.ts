import { MAX_REQUEST_ID_LENGTH, resolveRequestId } from './request-id';

describe('resolveRequestId', () => {
  it('PLATFORM-DEV-001 keeps a valid bounded client request ID', () => {
    expect(resolveRequestId('client.request-123:abc')).toBe(
      'client.request-123:abc',
    );
  });

  it.each([
    '',
    'contains a space',
    'contains\ncontrol',
    'x'.repeat(MAX_REQUEST_ID_LENGTH + 1),
  ])('PLATFORM-DEV-001 replaces an unsafe request ID', (value) => {
    expect(resolveRequestId(value)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});
