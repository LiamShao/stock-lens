import {
  analysisPageResponseSchema,
  analysisResourceSchema,
  analysisViewsResourceSchema,
  apiErrorResponseSchema,
  authResponseSchema,
  loginRequestSchema,
  presignedDocumentDownloadSchema,
  type AnalysisPageResponse,
  type AnalysisResource,
  type AnalysisStatus,
  type AnalysisViewsResource,
  type AuthResponse,
  type AuthUser,
  type LoginRequest,
  type PresignedDocumentDownload,
} from '@stocklens/shared';
import type { ZodType } from 'zod';

const DEFAULT_API_BASE_URL = 'http://localhost:3001/api';

export interface AuthState {
  user: AuthUser;
}

export interface ListAnalysesInput {
  cursor?: string;
  limit?: number;
  status?: AnalysisStatus;
}

export interface ApiClientOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
}

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly requestId: string | null,
  ) {
    super(toSafeErrorMessage(code, status));
    this.name = 'ApiClientError';
  }
}

export function toUserFacingErrorMessage(error: unknown): string {
  return error instanceof ApiClientError
    ? error.message
    : '通信に失敗しました。時間をおいて再度お試しください。';
}

type AuthListener = (state: AuthState | null) => void;

interface JsonRequestOptions<T> {
  body?: unknown;
  method?: 'GET' | 'POST';
  schema: ZodType<T>;
  signal?: AbortSignal | undefined;
}

export class ApiClient {
  private accessToken: string | null = null;
  private readonly baseUrl: string;
  private readonly fetchImplementation: typeof fetch;
  private readonly listeners = new Set<AuthListener>();
  private refreshPromise: Promise<AuthResponse> | null = null;

  constructor(options: ApiClientOptions = {}) {
    this.baseUrl = normalizeBaseUrl(
      options.baseUrl ??
        process.env.NEXT_PUBLIC_API_BASE_URL ??
        DEFAULT_API_BASE_URL,
    );
    this.fetchImplementation =
      options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  subscribe(listener: AuthListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async login(input: LoginRequest): Promise<AuthResponse> {
    const body = loginRequestSchema.parse(input);
    const response = await this.rawJsonRequest('/auth/login', {
      body,
      method: 'POST',
      schema: authResponseSchema,
    });
    this.applyAuth(response);
    return response;
  }

  refreshSession(): Promise<AuthResponse> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    const refresh = this.rawJsonRequest('/auth/refresh', {
      method: 'POST',
      schema: authResponseSchema,
    })
      .then((response) => {
        this.applyAuth(response);
        return response;
      })
      .catch((error: unknown) => {
        this.clearAuth();
        throw error;
      })
      .finally(() => {
        this.refreshPromise = null;
      });

    this.refreshPromise = refresh;
    return refresh;
  }

  async logout(): Promise<void> {
    try {
      await this.rawNoContentRequest('/auth/logout', { method: 'POST' });
    } finally {
      this.clearAuth();
    }
  }

  listAnalyses(
    input: ListAnalysesInput = {},
    signal?: AbortSignal,
  ): Promise<AnalysisPageResponse> {
    const search = new URLSearchParams();
    if (input.cursor) search.set('cursor', input.cursor);
    if (input.limit) search.set('limit', String(input.limit));
    if (input.status) search.set('status', input.status);
    const query = search.size > 0 ? `?${search.toString()}` : '';

    return this.authenticatedJsonRequest(`/analyses${query}`, {
      method: 'GET',
      schema: analysisPageResponseSchema,
      signal,
    });
  }

  getAnalysis(
    analysisId: string,
    signal?: AbortSignal,
  ): Promise<AnalysisResource> {
    return this.authenticatedJsonRequest(
      `/analyses/${encodeURIComponent(analysisId)}`,
      {
        method: 'GET',
        schema: analysisResourceSchema,
        signal,
      },
    );
  }

  getAnalysisViews(
    analysisId: string,
    signal?: AbortSignal,
  ): Promise<AnalysisViewsResource> {
    return this.authenticatedJsonRequest(
      `/analyses/${encodeURIComponent(analysisId)}/views`,
      {
        method: 'GET',
        schema: analysisViewsResourceSchema,
        signal,
      },
    );
  }

  createDocumentDownloadUrl(
    analysisId: string,
    documentId: string,
    signal?: AbortSignal,
  ): Promise<PresignedDocumentDownload> {
    return this.authenticatedJsonRequest(
      `/analyses/${encodeURIComponent(analysisId)}/documents/${encodeURIComponent(documentId)}/download-url`,
      {
        method: 'POST',
        schema: presignedDocumentDownloadSchema,
        signal,
      },
    );
  }

  private async authenticatedJsonRequest<T>(
    path: string,
    options: JsonRequestOptions<T>,
    canRecover = true,
  ): Promise<T> {
    const tokenAtRequest = this.accessToken;
    const response = await this.fetchImplementation(
      this.url(path),
      this.requestInit(options, tokenAtRequest),
    );

    if (response.status === 401 && canRecover) {
      if (tokenAtRequest === this.accessToken || this.accessToken === null) {
        await this.refreshSession();
      }
      return this.authenticatedJsonRequest(path, options, false);
    }

    if (!response.ok) {
      if (response.status === 401) this.clearAuth();
      throw await toApiClientError(response);
    }

    return parseResponse(response, options.schema);
  }

  private async rawJsonRequest<T>(
    path: string,
    options: JsonRequestOptions<T>,
  ): Promise<T> {
    const response = await this.fetchImplementation(
      this.url(path),
      this.requestInit(options, null),
    );

    if (!response.ok) throw await toApiClientError(response);
    return parseResponse(response, options.schema);
  }

  private async rawNoContentRequest(
    path: string,
    options: { method: 'POST' },
  ): Promise<void> {
    const response = await this.fetchImplementation(this.url(path), {
      cache: 'no-store',
      credentials: 'include',
      method: options.method,
    });
    if (!response.ok) throw await toApiClientError(response);
  }

  private applyAuth(response: AuthResponse): void {
    this.accessToken = response.accessToken;
    this.emit({ user: response.user });
  }

  private clearAuth(): void {
    this.accessToken = null;
    this.emit(null);
  }

  private emit(state: AuthState | null): void {
    for (const listener of this.listeners) listener(state);
  }

  private headers(token: string | null, hasBody: boolean): Headers {
    const headers = new Headers();
    if (hasBody) headers.set('content-type', 'application/json');
    if (token) headers.set('authorization', `Bearer ${token}`);
    return headers;
  }

  private requestInit<T>(
    options: JsonRequestOptions<T>,
    token: string | null,
  ): RequestInit {
    const init: RequestInit = {
      cache: 'no-store',
      credentials: 'include',
      headers: this.headers(token, options.body !== undefined),
      method: options.method ?? 'GET',
    };
    if (options.body !== undefined) init.body = JSON.stringify(options.body);
    if (options.signal) init.signal = options.signal;
    return init;
  }

  private url(path: string): string {
    return `${this.baseUrl}${path}`;
  }
}

async function parseResponse<T>(
  response: Response,
  schema: ZodType<T>,
): Promise<T> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ApiClientError(response.status, 'INVALID_API_RESPONSE', null);
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiClientError(response.status, 'INVALID_API_RESPONSE', null);
  }
  return parsed.data;
}

async function toApiClientError(response: Response): Promise<ApiClientError> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return new ApiClientError(response.status, 'API_REQUEST_FAILED', null);
  }

  const parsed = apiErrorResponseSchema.safeParse(body);
  if (!parsed.success) {
    return new ApiClientError(response.status, 'API_REQUEST_FAILED', null);
  }
  return new ApiClientError(
    response.status,
    parsed.data.code,
    parsed.data.requestId,
  );
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

function toSafeErrorMessage(code: string, status: number): string {
  if (code === 'INVALID_CREDENTIALS') {
    return 'メールアドレスまたはパスワードが正しくありません。';
  }
  if (code === 'RATE_LIMIT_EXCEEDED') {
    return 'リクエストが多すぎます。時間をおいて再度お試しください。';
  }
  if (status === 401) {
    return 'セッションの有効期限が切れました。もう一度ログインしてください。';
  }
  if (code === 'ANALYSIS_NOT_FOUND') {
    return '分析が見つかりません。';
  }
  return '通信に失敗しました。時間をおいて再度お試しください。';
}
