import { HttpStatus, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

import { ApiException } from './api-exception';

export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new ApiException(
        'VALIDATION_ERROR',
        'Request validation failed.',
        HttpStatus.BAD_REQUEST,
        {
          issues: result.error.issues.map((issue) => ({
            code: issue.code,
            message: issue.message,
            path: issue.path.join('.'),
          })),
        },
      );
    }
    return result.data;
  }
}
