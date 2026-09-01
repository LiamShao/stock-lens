import { apiErrorResponseSchema } from './index';

describe('API error response contract', () => {
  it('VIEW-FR-016 validates the unified API error envelope strictly', () => {
    expect(
      apiErrorResponseSchema.parse({
        code: 'INVALID_CREDENTIALS',
        details: {},
        message: 'Email or password is incorrect.',
        requestId: 'request-id',
      }),
    ).toEqual({
      code: 'INVALID_CREDENTIALS',
      details: {},
      message: 'Email or password is incorrect.',
      requestId: 'request-id',
    });
    expect(() =>
      apiErrorResponseSchema.parse({
        code: 'INVALID_CREDENTIALS',
        details: {},
        message: 'Email or password is incorrect.',
        requestId: 'request-id',
        token: 'must-not-pass',
      }),
    ).toThrow();
  });
});
