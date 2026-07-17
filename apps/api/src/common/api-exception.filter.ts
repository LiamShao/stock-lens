import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  type ExceptionFilter,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { ApiException } from './api-exception';

interface ApiErrorResponse {
  code: string;
  details: Record<string, unknown>;
  message: string;
  requestId: string;
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<FastifyRequest>();
    const reply = context.getResponse<FastifyReply>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let response: ApiErrorResponse = {
      code: 'INTERNAL_SERVER_ERROR',
      details: {},
      message: 'An unexpected error occurred.',
      requestId: request.id,
    };

    if (exception instanceof ApiException) {
      status = exception.getStatus();
      response = {
        code: exception.code,
        details: exception.details,
        message: exception.message,
        requestId: request.id,
      };
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      response = {
        code:
          status === HttpStatus.NOT_FOUND ? 'ROUTE_NOT_FOUND' : 'HTTP_ERROR',
        details: {},
        message: this.getHttpMessage(exception),
        requestId: request.id,
      };
    }

    void reply.status(status).send(response);
  }

  private getHttpMessage(exception: HttpException): string {
    const body: unknown = exception.getResponse();
    if (typeof body === 'string') {
      return body;
    }
    if (
      typeof body === 'object' &&
      body !== null &&
      'message' in body &&
      typeof body.message === 'string'
    ) {
      return body.message;
    }
    return exception.message;
  }
}
