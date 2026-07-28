export const DEFAULT_PRESIGN_EXPIRES_IN_SECONDS = 5 * 60;

export interface ObjectStorageCredentials {
  accessKeyId: string;
  secretAccessKey: string;
}

export interface ObjectStorageConfig {
  bucket: string;
  credentials: ObjectStorageCredentials | undefined;
  endpoint: string | undefined;
  forcePathStyle: boolean;
  presignExpiresInSeconds: number;
  region: string;
}

function readRequired(
  environment: NodeJS.ProcessEnv,
  key: 'S3_BUCKET' | 'S3_REGION',
): string {
  const value = environment[key]?.trim();
  if (!value) {
    throw new Error(`${key} is required.`);
  }
  return value;
}

function parseEndpoint(value: string | undefined): string | undefined {
  if (value === undefined || value.trim() === '') {
    return undefined;
  }

  let endpoint: URL;
  try {
    endpoint = new URL(value);
  } catch {
    throw new Error('S3_ENDPOINT must be a valid URL.');
  }

  if (endpoint.protocol !== 'http:' && endpoint.protocol !== 'https:') {
    throw new Error('S3_ENDPOINT must use the http or https protocol.');
  }

  return endpoint.toString().replace(/\/$/, '');
}

function parseBoolean(
  value: string | undefined,
  defaultValue: boolean,
): boolean {
  if (value === undefined || value.trim() === '') {
    return defaultValue;
  }
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  throw new Error('S3_FORCE_PATH_STYLE must be true or false.');
}

function parsePresignExpiry(value: string | undefined): number {
  const seconds =
    value === undefined || value.trim() === ''
      ? DEFAULT_PRESIGN_EXPIRES_IN_SECONDS
      : Number(value);

  if (
    !Number.isInteger(seconds) ||
    seconds < 1 ||
    seconds > DEFAULT_PRESIGN_EXPIRES_IN_SECONDS
  ) {
    throw new Error(
      `S3_PRESIGN_EXPIRES_IN_SECONDS must be an integer between 1 and ${DEFAULT_PRESIGN_EXPIRES_IN_SECONDS}.`,
    );
  }

  return seconds;
}

function parseCredentials(
  environment: NodeJS.ProcessEnv,
): ObjectStorageCredentials | undefined {
  const accessKeyId = environment.S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = environment.S3_SECRET_ACCESS_KEY?.trim();

  if (!accessKeyId && !secretAccessKey) {
    return undefined;
  }
  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      'S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY must be provided together.',
    );
  }

  return { accessKeyId, secretAccessKey };
}

export function getObjectStorageConfig(
  environment: NodeJS.ProcessEnv = process.env,
): ObjectStorageConfig {
  return {
    bucket: readRequired(environment, 'S3_BUCKET'),
    credentials: parseCredentials(environment),
    endpoint: parseEndpoint(environment.S3_ENDPOINT),
    forcePathStyle: parseBoolean(environment.S3_FORCE_PATH_STYLE, false),
    presignExpiresInSeconds: parsePresignExpiry(
      environment.S3_PRESIGN_EXPIRES_IN_SECONDS,
    ),
    region: readRequired(environment, 'S3_REGION'),
  };
}
