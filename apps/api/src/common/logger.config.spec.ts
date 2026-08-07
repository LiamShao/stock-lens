import {
  getFastifyLoggerOptions,
  REDACTED_LOG_VALUE,
  SENSITIVE_LOG_PATHS,
} from './logger.config';

describe('getFastifyLoggerOptions', () => {
  it('PLATFORM-DEV-002/PDF-SEC-005 explicitly redacts credentials and PDF storage data', () => {
    const config = getFastifyLoggerOptions();

    expect(config.redact.censor).toBe(REDACTED_LOG_VALUE);
    expect(config.redact.paths).toEqual(
      expect.arrayContaining([
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
        'req.body.password',
        'accessToken',
        'refreshToken',
        '*.storageKey',
        '*.pdfText',
        '*.upload.url',
      ]),
    );
    expect(config.redact.paths).toHaveLength(SENSITIVE_LOG_PATHS.length);
  });

  it('PLATFORM-DEV-002 removes sensitive values from emitted JSON logs', async () => {
    const output: string[] = [];
    const adapter = new FastifyAdapter({
      logger: {
        ...getFastifyLoggerOptions(),
        stream: { write: (message: string) => output.push(message) },
      },
    });
    const server = adapter.getInstance();

    server.log.info({
      accessToken: 'secret-access-token',
      req: {
        body: { password: 'secret-password' },
        headers: {
          authorization: 'Bearer secret-access-token',
          cookie: 'stocklens_refresh_token=secret-refresh-token',
        },
      },
    });
    await server.close();

    const serialized = output.join('');
    expect(serialized).toContain(REDACTED_LOG_VALUE);
    expect(serialized).not.toContain('secret-access-token');
    expect(serialized).not.toContain('secret-password');
    expect(serialized).not.toContain('secret-refresh-token');
  });

  it('PDF-SEC-005 removes upload URLs, storage coordinates, filenames, and PDF text from emitted JSON logs', async () => {
    const output: string[] = [];
    const adapter = new FastifyAdapter({
      logger: {
        ...getFastifyLoggerOptions(),
        stream: { write: (message: string) => output.push(message) },
      },
    });
    const server = adapter.getInstance();

    server.log.info({
      payload: {
        chunkText: 'secret-chunk-text',
        fullPdfText: 'secret-full-pdf-text',
        objectBody: 'secret-object-body',
        originalName: 'secret-results.pdf',
        storageBucket: 'secret-private-bucket',
        storageKey: 'secret/private/object.pdf',
        upload: { url: 'https://storage.test/secret-presigned-query' },
      },
    });
    await server.close();

    const serialized = output.join('');
    expect(serialized).toContain(REDACTED_LOG_VALUE);
    for (const secret of [
      'secret-chunk-text',
      'secret-full-pdf-text',
      'secret-object-body',
      'secret-results.pdf',
      'secret-private-bucket',
      'secret/private/object.pdf',
      'secret-presigned-query',
    ]) {
      expect(serialized).not.toContain(secret);
    }
  });
});
import { FastifyAdapter } from '@nestjs/platform-fastify';
