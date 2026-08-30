import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiAcceptedResponse,
  ApiConflictResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  analysisListQuerySchema,
  analysisPathParamsSchema,
  analysisStatusSchema,
  createAnalysisRequestSchema,
  renameAnalysisRequestSchema,
  type AnalysisListQuery,
  type AnalysisPageResponse,
  type AnalysisPathParams,
  type AnalysisResource,
  type AnalysisViewsResource,
  type AuthUser,
  type CreateAnalysisRequest,
  type RenameAnalysisRequest,
  type ProcessAnalysisResponse,
} from '@stocklens/shared';

import { AccessTokenGuard } from '../auth/access-token.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ApiErrorOpenApi } from '../auth/auth.openapi';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  AnalysisPageOpenApi,
  AnalysisResourceOpenApi,
  AnalysisViewsResourceOpenApi,
  CreateAnalysisOpenApi,
  RenameAnalysisOpenApi,
  ProcessAnalysisOpenApi,
} from './analyses.openapi';
import { AnalysesService } from './analyses.service';
import { AnalysisViewsService } from './analysis-views.service';

@Controller('analyses')
@UseGuards(AccessTokenGuard)
@ApiTags('analyses')
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  description: 'Bearer access token is missing or invalid',
  type: ApiErrorOpenApi,
})
@ApiTooManyRequestsResponse({
  description: 'Rate limit exceeded',
  type: ApiErrorOpenApi,
})
export class AnalysesController {
  constructor(
    private readonly analysesService: AnalysesService,
    private readonly analysisViewsService: AnalysisViewsService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create an analysis draft' })
  @ApiBody({ type: CreateAnalysisOpenApi })
  @ApiCreatedResponse({
    description: 'Analysis draft created',
    type: AnalysisResourceOpenApi,
  })
  @ApiBadRequestResponse({
    description: 'Request validation failed',
    type: ApiErrorOpenApi,
  })
  @ApiNotFoundResponse({
    description: 'Company was not found',
    type: ApiErrorOpenApi,
  })
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createAnalysisRequestSchema))
    body: CreateAnalysisRequest,
  ): Promise<AnalysisResource> {
    return this.analysesService.create(user.id, body);
  }

  @Post(':analysisId/process')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Start asynchronous document processing' })
  @ApiParam({ format: 'uuid', name: 'analysisId' })
  @ApiAcceptedResponse({
    description: 'Processing accepted',
    type: ProcessAnalysisOpenApi,
  })
  @ApiConflictResponse({
    description: 'Analysis has no documents or is not processable',
    type: ApiErrorOpenApi,
  })
  @ApiNotFoundResponse({
    description: 'Analysis was not found',
    type: ApiErrorOpenApi,
  })
  process(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(analysisPathParamsSchema))
    params: AnalysisPathParams,
  ): Promise<ProcessAnalysisResponse> {
    return this.analysesService.process(user.id, params.analysisId);
  }

  @Get()
  @ApiOperation({ summary: 'List analysis history' })
  @ApiQuery({ maximum: 50, minimum: 1, name: 'limit', required: false })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({
    enum: analysisStatusSchema.options,
    name: 'status',
    required: false,
  })
  @ApiOkResponse({
    description: 'Owner-scoped analysis history',
    type: AnalysisPageOpenApi,
  })
  @ApiBadRequestResponse({
    description: 'Request query validation failed',
    type: ApiErrorOpenApi,
  })
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(analysisListQuerySchema))
    query: AnalysisListQuery,
  ): Promise<AnalysisPageResponse> {
    return this.analysesService.list(user.id, query);
  }

  @Get(':analysisId/views')
  @ApiOperation({ summary: 'Get completed analysis views and evidence' })
  @ApiParam({ format: 'uuid', name: 'analysisId' })
  @ApiOkResponse({
    description: 'Completed owner-scoped analysis views',
    type: AnalysisViewsResourceOpenApi,
  })
  @ApiBadRequestResponse({
    description: 'Path validation failed',
    type: ApiErrorOpenApi,
  })
  @ApiConflictResponse({
    description: 'Analysis views are not ready',
    type: ApiErrorOpenApi,
  })
  @ApiNotFoundResponse({
    description: 'Analysis was not found',
    type: ApiErrorOpenApi,
  })
  @ApiInternalServerErrorResponse({
    description: 'Persisted analysis views are invalid or unavailable',
    type: ApiErrorOpenApi,
  })
  getViews(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(analysisPathParamsSchema))
    params: AnalysisPathParams,
  ): Promise<AnalysisViewsResource> {
    return this.analysisViewsService.get(user.id, params.analysisId);
  }

  @Get(':analysisId')
  @ApiOperation({ summary: 'Get analysis metadata' })
  @ApiParam({ format: 'uuid', name: 'analysisId' })
  @ApiOkResponse({
    description: 'Analysis metadata',
    type: AnalysisResourceOpenApi,
  })
  @ApiBadRequestResponse({
    description: 'Path validation failed',
    type: ApiErrorOpenApi,
  })
  @ApiNotFoundResponse({
    description: 'Analysis was not found',
    type: ApiErrorOpenApi,
  })
  get(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(analysisPathParamsSchema))
    params: AnalysisPathParams,
  ): Promise<AnalysisResource> {
    return this.analysesService.get(user.id, params.analysisId);
  }

  @Patch(':analysisId')
  @ApiOperation({ summary: 'Rename an analysis' })
  @ApiBody({ type: RenameAnalysisOpenApi })
  @ApiParam({ format: 'uuid', name: 'analysisId' })
  @ApiOkResponse({
    description: 'Analysis renamed',
    type: AnalysisResourceOpenApi,
  })
  @ApiBadRequestResponse({
    description: 'Request validation failed',
    type: ApiErrorOpenApi,
  })
  @ApiNotFoundResponse({
    description: 'Analysis was not found',
    type: ApiErrorOpenApi,
  })
  rename(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(analysisPathParamsSchema))
    params: AnalysisPathParams,
    @Body(new ZodValidationPipe(renameAnalysisRequestSchema))
    body: RenameAnalysisRequest,
  ): Promise<AnalysisResource> {
    return this.analysesService.rename(user.id, params.analysisId, body);
  }

  @Delete(':analysisId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete an analysis' })
  @ApiParam({ format: 'uuid', name: 'analysisId' })
  @ApiNoContentResponse({ description: 'Analysis deleted' })
  @ApiBadRequestResponse({
    description: 'Path validation failed',
    type: ApiErrorOpenApi,
  })
  @ApiNotFoundResponse({
    description: 'Analysis was not found',
    type: ApiErrorOpenApi,
  })
  delete(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(analysisPathParamsSchema))
    params: AnalysisPathParams,
  ): Promise<void> {
    return this.analysesService.delete(user.id, params.analysisId);
  }
}
