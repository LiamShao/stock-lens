import {
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiServiceUnavailableResponse,
} from '@nestjs/swagger';
import {
  documentItemPathParamsSchema,
  documentPathParamsSchema,
  type AuthUser,
  type DocumentItemPathParams,
  type DocumentListResponse,
  type DocumentPathParams,
  type PresignedDocumentDownload,
} from '@stocklens/shared';

import { AccessTokenGuard } from '../auth/access-token.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ApiErrorOpenApi } from '../auth/auth.openapi';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  DocumentListResponseOpenApi,
  PresignedDocumentDownloadOpenApi,
} from './documents.openapi';
import { DocumentsService } from './documents.service';

@Controller('analyses/:analysisId/documents')
@UseGuards(AccessTokenGuard)
@ApiTags('documents')
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  description: 'Bearer access token is missing or invalid',
  type: ApiErrorOpenApi,
})
@ApiTooManyRequestsResponse({
  description: 'Rate limit exceeded',
  type: ApiErrorOpenApi,
})
export class DocumentsController {
  constructor(private readonly service: DocumentsService) {}

  @Get()
  @ApiOperation({ summary: 'List active finalized documents' })
  @ApiParam({ format: 'uuid', name: 'analysisId' })
  @ApiOkResponse({
    description: 'Owner-scoped active finalized documents',
    type: DocumentListResponseOpenApi,
  })
  @ApiBadRequestResponse({
    description: 'Path validation failed',
    type: ApiErrorOpenApi,
  })
  @ApiNotFoundResponse({
    description: 'Analysis was not found for this owner',
    type: ApiErrorOpenApi,
  })
  list(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(documentPathParamsSchema))
    params: DocumentPathParams,
  ): Promise<DocumentListResponse> {
    return this.service.list(user.id, params.analysisId);
  }

  @Post(':documentId/download-url')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Create a short-lived read-only PDF URL' })
  @ApiParam({ format: 'uuid', name: 'analysisId' })
  @ApiParam({ format: 'uuid', name: 'documentId' })
  @ApiOkResponse({
    description:
      'Owner-scoped read-only PDF URL valid for at most five minutes',
    type: PresignedDocumentDownloadOpenApi,
  })
  @ApiBadRequestResponse({
    description: 'Path validation failed',
    type: ApiErrorOpenApi,
  })
  @ApiNotFoundResponse({
    description: 'Analysis or document was not found for this owner',
    type: ApiErrorOpenApi,
  })
  @ApiServiceUnavailableResponse({
    description: 'Document object or object storage is unavailable',
    type: ApiErrorOpenApi,
  })
  createDownloadUrl(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(documentItemPathParamsSchema))
    params: DocumentItemPathParams,
  ): Promise<PresignedDocumentDownload> {
    return this.service.createDownloadUrl(
      user.id,
      params.analysisId,
      params.documentId,
    );
  }

  @Delete(':documentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a document and queue object cleanup' })
  @ApiParam({ format: 'uuid', name: 'analysisId' })
  @ApiParam({ format: 'uuid', name: 'documentId' })
  @ApiNoContentResponse({ description: 'Document deleted' })
  @ApiBadRequestResponse({
    description: 'Path validation failed',
    type: ApiErrorOpenApi,
  })
  @ApiNotFoundResponse({
    description: 'Analysis or document was not found for this owner',
    type: ApiErrorOpenApi,
  })
  delete(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(documentItemPathParamsSchema))
    params: DocumentItemPathParams,
  ): Promise<void> {
    return this.service.delete(user.id, params.analysisId, params.documentId);
  }
}
