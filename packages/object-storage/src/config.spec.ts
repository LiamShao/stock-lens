import {
  DEFAULT_PRESIGN_EXPIRES_IN_SECONDS,
  getObjectStorageConfig,
} from './config';

describe('getObjectStorageConfig', () => {
  it('parses MinIO-compatible configuration', () => {
    expect(
      getObjectStorageConfig({
        S3_ACCESS_KEY_ID: 'stocklens',
        S3_BUCKET: 'stocklens-dev',
        S3_ENDPOINT: 'http://localhost:9000/',
        S3_FORCE_PATH_STYLE: 'true',
        S3_REGION: 'ap-northeast-1',
        S3_SECRET_ACCESS_KEY: 'secret',
      }),
    ).toEqual({
      bucket: 'stocklens-dev',
      credentials: {
        accessKeyId: 'stocklens',
        secretAccessKey: 'secret',
      },
      endpoint: 'http://localhost:9000',
      forcePathStyle: true,
      presignExpiresInSeconds: DEFAULT_PRESIGN_EXPIRES_IN_SECONDS,
      region: 'ap-northeast-1',
    });
  });

  it('supports AWS default credentials without a custom endpoint', () => {
    expect(
      getObjectStorageConfig({
        S3_BUCKET: 'stocklens-private',
        S3_REGION: 'ap-northeast-1',
      }),
    ).toEqual({
      bucket: 'stocklens-private',
      credentials: undefined,
      endpoint: undefined,
      forcePathStyle: false,
      presignExpiresInSeconds: DEFAULT_PRESIGN_EXPIRES_IN_SECONDS,
      region: 'ap-northeast-1',
    });
  });

  it('rejects partial static credentials', () => {
    expect(() =>
      getObjectStorageConfig({
        S3_ACCESS_KEY_ID: 'stocklens',
        S3_BUCKET: 'stocklens-dev',
        S3_REGION: 'ap-northeast-1',
      }),
    ).toThrow(
      'S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY must be provided together.',
    );
  });

  it('rejects presign expiry longer than the approved five minutes', () => {
    expect(() =>
      getObjectStorageConfig({
        S3_BUCKET: 'stocklens-dev',
        S3_PRESIGN_EXPIRES_IN_SECONDS: '301',
        S3_REGION: 'ap-northeast-1',
      }),
    ).toThrow(
      'S3_PRESIGN_EXPIRES_IN_SECONDS must be an integer between 1 and 300.',
    );
  });
});
