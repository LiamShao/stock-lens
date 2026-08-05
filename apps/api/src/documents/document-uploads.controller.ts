import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  documentUploadItemPathParamsSchema,
  documentUploadPathParamsSchema,
  startDocumentUploadRequestSchema,
  type AuthUser,
  type DocumentUploadItemPathParams,
  type DocumentUploadPathParams,
  type PresignedPdfUploadResponse,
  type StartDocumentUploadRequest,
  type StartDocumentUploadResponse,
} from '@stocklens/shared';

import { AccessTokenGuard } from '../auth/access-token.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ApiErrorOpenApi } from '../auth/auth.openapi';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  PresignedPdfUploadOpenApi,
  StartDocumentUploadOpenApi,
  StartDocumentUploadResponseOpenApi,
} from './document-uploads.openapi';
import { DocumentUploadsService } from './document-uploads.service';

@Controller('analyses/:analysisId/document-uploads')
@UseGuards(AccessTokenGuard)
@ApiTags('document-uploads')
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  description: 'Bearer access token is missing or invalid',
  type: ApiErrorOpenApi,
})
@ApiTooManyRequestsResponse({
  description: 'Rate limit exceeded',
  type: ApiErrorOpenApi,
})
export class DocumentUploadsController {
  constructor(private readonly service: DocumentUploadsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a PDF upload session and presigned URL' })
  @ApiParam({ format: 'uuid', name: 'analysisId' })
  @ApiBody({ type: StartDocumentUploadOpenApi })
  @ApiCreatedResponse({
    description: 'Upload session and constrained PUT URL created',
    type: StartDocumentUploadResponseOpenApi,
  })
  @ApiBadRequestResponse({
    description: 'Path or PDF metadata validation failed',
    type: ApiErrorOpenApi,
  })
  @ApiNotFoundResponse({
    description: 'Analysis was not found',
    type: ApiErrorOpenApi,
  })
  @ApiConflictResponse({
    description: 'Three active document/upload slots are already reserved',
    type: ApiErrorOpenApi,
  })
  @ApiServiceUnavailableResponse({
    description: 'Object storage could not issue the upload URL',
    type: ApiErrorOpenApi,
  })
  start(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(documentUploadPathParamsSchema))
    params: DocumentUploadPathParams,
    @Body(new ZodValidationPipe(startDocumentUploadRequestSchema))
    body: StartDocumentUploadRequest,
  ): Promise<StartDocumentUploadResponse> {
    return this.service.start(user.id, params.analysisId, body);
  }

  @Post(':uploadId/presign')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reissue a URL for an active upload session' })
  @ApiParam({ format: 'uuid', name: 'analysisId' })
  @ApiParam({ format: 'uuid', name: 'uploadId' })
  @ApiOkResponse({
    description: 'A new constrained PUT URL was issued',
    type: PresignedPdfUploadOpenApi,
  })
  @ApiBadRequestResponse({
    description: 'Path validation failed',
    type: ApiErrorOpenApi,
  })
  @ApiNotFoundResponse({
    description: 'Upload session was not found for this owner and analysis',
    type: ApiErrorOpenApi,
  })
  @ApiConflictResponse({
    description: 'Upload session is expired or no longer active',
    type: ApiErrorOpenApi,
  })
  @ApiServiceUnavailableResponse({
    description: 'Object storage could not issue the upload URL',
    type: ApiErrorOpenApi,
  })
  presignAgain(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(documentUploadItemPathParamsSchema))
    params: DocumentUploadItemPathParams,
  ): Promise<PresignedPdfUploadResponse> {
    return this.service.presignAgain(
      user.id,
      params.analysisId,
      params.uploadId,
    );
  }
}
