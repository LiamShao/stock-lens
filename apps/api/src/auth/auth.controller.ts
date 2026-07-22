import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { RouteConfig } from '@nestjs/platform-fastify';
import {
  loginRequestSchema,
  registerRequestSchema,
  type AuthResponse,
  type AuthUser,
  type LoginRequest,
  type RegisterRequest,
} from '@stocklens/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AccessTokenGuard } from './access-token.guard';
import { AUTH_CONFIG, type AuthConfig } from './auth.config';
import { AuthService, type AuthResult } from './auth.service';
import {
  ApiErrorOpenApi,
  AuthResponseOpenApi,
  AuthUserOpenApi,
  REFRESH_COOKIE_RESPONSE_HEADER,
} from './auth.openapi';
import { CurrentUser } from './current-user.decorator';

export const REFRESH_TOKEN_COOKIE = 'stocklens_refresh_token';

@Controller('auth')
@ApiTags('auth')
@ApiTooManyRequestsResponse({
  description: 'Rate limit exceeded',
  type: ApiErrorOpenApi,
})
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  @Post('register')
  @RouteConfig({ rateLimit: { max: 5, timeWindow: '1 minute' } })
  @ApiOperation({ summary: 'Register an account' })
  @ApiBody({
    schema: {
      properties: {
        displayName: { maxLength: 80, type: 'string' },
        email: { format: 'email', type: 'string' },
        password: { minLength: 12, type: 'string' },
      },
      required: ['email', 'password'],
      type: 'object',
    },
  })
  @ApiCreatedResponse({
    description: 'Account created',
    headers: REFRESH_COOKIE_RESPONSE_HEADER,
    type: AuthResponseOpenApi,
  })
  @ApiBadRequestResponse({
    description: 'Request validation failed',
    type: ApiErrorOpenApi,
  })
  @ApiConflictResponse({
    description: 'Email is already registered',
    type: ApiErrorOpenApi,
  })
  async register(
    @Body(new ZodValidationPipe(registerRequestSchema)) body: RegisterRequest,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<AuthResponse> {
    const result = await this.authService.register(
      body,
      request.headers['user-agent'],
    );
    this.setRefreshCookie(reply, result);
    return result.response;
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @RouteConfig({ rateLimit: { max: 10, timeWindow: '1 minute' } })
  @ApiOperation({ summary: 'Log in with email and password' })
  @ApiBody({
    schema: {
      properties: {
        email: { format: 'email', type: 'string' },
        password: { minLength: 12, type: 'string' },
      },
      required: ['email', 'password'],
      type: 'object',
    },
  })
  @ApiOkResponse({
    description: 'Authenticated',
    headers: REFRESH_COOKIE_RESPONSE_HEADER,
    type: AuthResponseOpenApi,
  })
  @ApiBadRequestResponse({
    description: 'Request validation failed',
    type: ApiErrorOpenApi,
  })
  @ApiUnauthorizedResponse({
    description: 'Email or password is incorrect',
    type: ApiErrorOpenApi,
  })
  async login(
    @Body(new ZodValidationPipe(loginRequestSchema)) body: LoginRequest,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<AuthResponse> {
    const result = await this.authService.login(
      body,
      request.headers['user-agent'],
    );
    this.setRefreshCookie(reply, result);
    return result.response;
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @RouteConfig({ rateLimit: { max: 20, timeWindow: '1 minute' } })
  @ApiCookieAuth(REFRESH_TOKEN_COOKIE)
  @ApiOperation({ summary: 'Rotate the refresh token' })
  @ApiOkResponse({
    description: 'Token rotated',
    headers: REFRESH_COOKIE_RESPONSE_HEADER,
    type: AuthResponseOpenApi,
  })
  @ApiUnauthorizedResponse({
    description: 'Refresh token is invalid, expired, or reused',
    type: ApiErrorOpenApi,
  })
  async refresh(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<AuthResponse> {
    const result = await this.authService.refresh(
      request.cookies[REFRESH_TOKEN_COOKIE],
      request.headers['user-agent'],
    );
    this.setRefreshCookie(reply, result);
    return result.response;
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiCookieAuth(REFRESH_TOKEN_COOKIE)
  @ApiOperation({ summary: 'Revoke the current refresh token family' })
  @ApiNoContentResponse({ description: 'Logged out' })
  async logout(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    await this.authService.logout(request.cookies[REFRESH_TOKEN_COOKIE]);
    reply.clearCookie(REFRESH_TOKEN_COOKIE, {
      path: '/api/auth',
    });
  }

  @Get('me')
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the authenticated user' })
  @ApiOkResponse({
    description: 'Authenticated user',
    type: AuthUserOpenApi,
  })
  @ApiUnauthorizedResponse({
    description: 'Bearer access token is missing or invalid',
    type: ApiErrorOpenApi,
  })
  me(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }

  private setRefreshCookie(reply: FastifyReply, result: AuthResult): void {
    reply.setCookie(REFRESH_TOKEN_COOKIE, result.refreshToken, {
      httpOnly: true,
      maxAge: this.config.refreshTokenExpiresInDays * 86_400,
      path: '/api/auth',
      sameSite: 'strict',
      secure: this.config.isProduction,
    });
  }
}
