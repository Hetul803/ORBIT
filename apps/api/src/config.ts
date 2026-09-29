import { z } from 'zod';

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.string().default('info'),
  API_HOST: z.string().default('0.0.0.0'),
  API_PORT: z.coerce.number().int().positive().default(4100),
  PUBLIC_API_URL: z.url().default('http://localhost:4100'),
  ALLOWED_ORIGINS: z.string().default('http://localhost:8081,http://localhost:19006'),
  DATABASE_URL: z.string().default('postgresql://orbit:orbit@localhost:5432/orbit?schema=public'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_ACCESS_SECRET: z.string().min(32).default('development-access-secret-change-me-32'),
  JWT_REFRESH_SECRET: z.string().min(32).default('development-refresh-secret-change-me-32'),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(2_592_000),
  OTP_TTL_SECONDS: z.coerce.number().int().positive().default(600),
  OTP_DELIVERY_MODE: z.enum(['log', 'resend']).default('log'),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().default('ORBIT <hello@example.com>'),
  FIELD_ENCRYPTION_KEY: z.string().default('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='),
  EXPORT_SIGNING_SECRET: z.string().min(12).default('development-export-signing-secret'),
  INTRODUCTIONS_PER_USER_PER_DAY: z.coerce.number().int().positive().default(12),
  DELETION_GRACE_DAYS: z.coerce.number().int().positive().default(7),
  ADMIN_EMAILS: z.string().default('admin@example.com'),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().optional(),
  LLM_DEFAULT_PROVIDER: z.enum(['stub', 'openai', 'anthropic', 'google']).default('stub'),
  USER_DAILY_COST_CAP_CENTS: z.coerce.number().nonnegative().default(35),
  GLOBAL_DAILY_COST_CAP_CENTS: z.coerce.number().nonnegative().default(2_500),
});

export type ApiConfig = z.infer<typeof environmentSchema>;

export const loadConfig = (environment: NodeJS.ProcessEnv = process.env): ApiConfig =>
  environmentSchema.parse(environment);
