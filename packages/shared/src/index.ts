import { z } from 'zod';

export * from './analysis';
export * from './document';
export * from './document-upload';
export * from './object-cleanup';

export const healthResponseSchema = z.object({
  service: z.string().min(1),
  status: z.literal('ok'),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

const passwordSchema = z.string().min(12).max(128);

export const registerRequestSchema = z.object({
  displayName: z.string().trim().min(1).max(80).optional(),
  email: emailSchema,
  password: passwordSchema,
});

export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export const loginRequestSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const authUserSchema = z.object({
  displayName: z.string().nullable(),
  email: z.email(),
  id: z.uuid(),
  isDemo: z.boolean(),
});

export type AuthUser = z.infer<typeof authUserSchema>;

export const authResponseSchema = z.object({
  accessToken: z.string().min(1),
  expiresIn: z.number().int().positive(),
  user: authUserSchema,
});

export type AuthResponse = z.infer<typeof authResponseSchema>;

export const authEnvironmentSchema = z.object({
  ACCESS_TOKEN_AUDIENCE: z.string().min(1).default('stocklens-web'),
  ACCESS_TOKEN_EXPIRES_IN_SECONDS: z.coerce
    .number()
    .int()
    .min(300)
    .max(3600)
    .default(900),
  ACCESS_TOKEN_ISSUER: z.string().min(1).default('stocklens-api'),
  ACCESS_TOKEN_SECRET: z.string().min(32),
  CORS_ORIGIN: z.url().default('http://localhost:3000'),
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  REFRESH_TOKEN_EXPIRES_IN_DAYS: z.coerce
    .number()
    .int()
    .min(1)
    .max(90)
    .default(30),
});

export type AuthEnvironment = z.infer<typeof authEnvironmentSchema>;
