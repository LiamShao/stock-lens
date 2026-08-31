export const REDACTED_LOG_VALUE = '[REDACTED]';

const PDF_SENSITIVE_FIELD_NAMES = [
  'chunkText',
  'fullPdfText',
  'objectBody',
  'objectKey',
  'originalName',
  'pageText',
  'pdfText',
  'presignedUrl',
  'storageBucket',
  'storageKey',
  'uploadUrl',
] as const;

const PDF_SENSITIVE_FIELD_PATHS = PDF_SENSITIVE_FIELD_NAMES.flatMap((field) => [
  field,
  `*.${field}`,
  `*.*.${field}`,
]);

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
  ...PDF_SENSITIVE_FIELD_PATHS,
  'upload.url',
  '*.upload.url',
  '*.*.upload.url',
  'presignedUpload.url',
  '*.presignedUpload.url',
  '*.*.presignedUpload.url',
  'documentDownload.url',
  '*.documentDownload.url',
  '*.*.documentDownload.url',
  'download.url',
  '*.download.url',
  '*.*.download.url',
  'presignedDownload.url',
  '*.presignedDownload.url',
  '*.*.presignedDownload.url',
] as const satisfies readonly string[];

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
