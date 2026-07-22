export const REDACTED_LOG_VALUE = '[REDACTED]';

export const SENSITIVE_LOG_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'req.body.password',
  'req.body.accessToken',
  'req.body.refreshToken',
  'password',
  'passwordHash',
  'accessToken',
  'refreshToken',
  'token',
] as const;

export function getFastifyLoggerOptions(): {
  redact: { censor: string; paths: string[] };
} {
  return {
    redact: {
      censor: REDACTED_LOG_VALUE,
      paths: [...SENSITIVE_LOG_PATHS],
    },
  };
}
