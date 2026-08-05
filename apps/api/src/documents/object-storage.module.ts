import { Module } from '@nestjs/common';
import {
  getObjectStorageConfig,
  S3ObjectStorageAdapter,
  type ObjectStorageConfig,
} from '@stocklens/object-storage';

export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');
export const OBJECT_STORAGE_BUCKET = Symbol('OBJECT_STORAGE_BUCKET');
const OBJECT_STORAGE_CONFIG = Symbol('OBJECT_STORAGE_CONFIG');

@Module({
  exports: [OBJECT_STORAGE, OBJECT_STORAGE_BUCKET],
  providers: [
    {
      provide: OBJECT_STORAGE_CONFIG,
      useFactory: (): ObjectStorageConfig => getObjectStorageConfig(),
    },
    {
      inject: [OBJECT_STORAGE_CONFIG],
      provide: OBJECT_STORAGE,
      useFactory: (config: ObjectStorageConfig): S3ObjectStorageAdapter =>
        new S3ObjectStorageAdapter(config),
    },
    {
      inject: [OBJECT_STORAGE_CONFIG],
      provide: OBJECT_STORAGE_BUCKET,
      useFactory: (config: ObjectStorageConfig): string => config.bucket,
    },
  ],
})
export class ObjectStorageModule {}
