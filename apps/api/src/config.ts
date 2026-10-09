import { z } from 'zod';

const optionalUrl = z.preprocess(
  (value) => (typeof value === 'string' && value.trim().length === 0 ? undefined : value),
  z.url().optional(),
);

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.string().default('info'),
  SENTRY_DSN: optionalUrl,
  SENTRY_ENVIRONMENT: z.string().default('development'),
  API_HOST: z.string().default('0.0.0.0'),
  API_PORT: z.coerce.number().int().positive().default(4100),
  TRUSTED_PROXY_CIDRS: z.string().default(''),
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
  ALLOW_DEVELOPMENT_OTP_DISPLAY: z.enum(['true', 'false']).default('false'),
  ALLOW_DEVELOPMENT_SEED: z.enum(['true', 'false']).default('false'),
  OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().min(30).default(30),
  OTP_EMAIL_REQUESTS_PER_15_MINUTES: z.coerce.number().int().positive().default(5),
  OTP_IP_REQUESTS_PER_15_MINUTES: z.coerce.number().int().positive().default(20),
  OTP_FAILED_ATTEMPTS_PER_15_MINUTES: z.coerce.number().int().positive().default(10),
  ACCOUNT_CREATION_PER_IP_PER_DAY: z.coerce.number().int().positive().default(5),
  DEPLOYMENT_ACCOUNT_CAP: z.coerce.number().int().positive().default(50),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().default('ORBIT <hello@example.com>'),
  PHONE_OTP_PROVIDER: z.enum(['disabled', 'log', 'twilio']).default('log'),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM_PHONE: z.string().optional(),
  GMAIL_INTEGRATION_ENABLED: z.enum(['true', 'false']).default('false'),
  SEARCH_API_ENDPOINT: z.url().default('https://api.search.brave.com/res/v1/web/search'),
  SEARCH_API_KEY: z.string().optional(),
  GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),
  GOOGLE_OAUTH_REDIRECT_URI: optionalUrl,
  ORBIT_MOBILE_REDIRECT_URL: z.string().default('orbit://connections'),
  FIELD_ENCRYPTION_KEY: z.string().default('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='),
  EXPORT_SIGNING_SECRET: z.string().min(12).default('development-export-signing-secret'),
  INTRODUCTIONS_PER_USER_PER_DAY: z.coerce.number().int().positive().default(12),
  DELETION_GRACE_DAYS: z.coerce.number().int().positive().default(7),
  ADMIN_EMAILS: z.string().default('admin@example.com'),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
  EMBEDDING_INPUT_COST_CENTS_PER_MILLION_TOKENS: z.coerce.number().positive().default(20),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_BASE_URL: z.url().default('https://openrouter.ai/api/v1'),
  OPENROUTER_HTTP_REFERER: optionalUrl,
  OPENROUTER_APP_TITLE: z.string().default('ORBIT'),
  OPENROUTER_EMBEDDING_MODEL: z.string().default('openai/text-embedding-3-small'),
  ANTHROPIC_API_KEY: z.string().optional(),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().optional(),
  LLM_DEFAULT_PROVIDER: z
    .enum(['stub', 'openai', 'openrouter', 'anthropic', 'google'])
    .default('stub'),
  USER_DAILY_COST_CAP_CENTS: z.coerce.number().nonnegative().default(35),
  GLOBAL_DAILY_COST_CAP_CENTS: z.coerce.number().nonnegative().default(2_500),
});

export type ApiConfig = z.infer<typeof environmentSchema>;

const productionError = (name: string, requirement: string): never => {
  throw new Error(`Production configuration error: ${name} ${requirement}`);
};

const assertProductionConfig = (config: ApiConfig): void => {
  if (config.NODE_ENV !== 'production') return;
  if (
    config.TRUSTED_PROXY_CIDRS.split(',').some((entry) =>
      ['true', '*', '0.0.0.0/0', '::/0'].includes(entry.trim()),
    )
  ) {
    productionError(
      'TRUSTED_PROXY_CIDRS',
      'must name only trusted ingress addresses, never all peers',
    );
  }
  if (config.ALLOW_DEVELOPMENT_OTP_DISPLAY !== 'false') {
    productionError('ALLOW_DEVELOPMENT_OTP_DISPLAY', 'must be false');
  }
  if (config.ALLOW_DEVELOPMENT_SEED !== 'false') {
    productionError('ALLOW_DEVELOPMENT_SEED', 'must be false');
  }
  if (config.OTP_DELIVERY_MODE !== 'resend') {
    productionError('OTP_DELIVERY_MODE', 'must be resend');
  }
  if (!config.RESEND_API_KEY) productionError('RESEND_API_KEY', 'is required');
  if (config.RESEND_FROM_EMAIL.includes('example.com')) {
    productionError('RESEND_FROM_EMAIL', 'must use a verified non-example domain');
  }
  if (config.PHONE_OTP_PROVIDER === 'log') {
    productionError('PHONE_OTP_PROVIDER', 'must be disabled or twilio');
  }
  if (
    config.PHONE_OTP_PROVIDER === 'twilio' &&
    (!config.TWILIO_ACCOUNT_SID || !config.TWILIO_AUTH_TOKEN || !config.TWILIO_FROM_PHONE)
  ) {
    productionError('TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_FROM_PHONE', 'are required');
  }
  if (!config.PUBLIC_API_URL.startsWith('https://')) {
    productionError('PUBLIC_API_URL', 'must be an HTTPS URL');
  }
  if (config.DATABASE_URL.includes('localhost') || config.DATABASE_URL.includes('orbit:orbit@')) {
    productionError('DATABASE_URL', 'must be an explicit production database URL');
  }
  if (config.REDIS_URL.includes('localhost')) {
    productionError('REDIS_URL', 'must be an explicit production Redis URL');
  }
  if (
    config.JWT_ACCESS_SECRET.includes('development') ||
    config.JWT_ACCESS_SECRET.includes('change-me')
  ) {
    productionError('JWT_ACCESS_SECRET', 'must be a fresh production secret');
  }
  if (
    config.JWT_REFRESH_SECRET.includes('development') ||
    config.JWT_REFRESH_SECRET.includes('change-me')
  ) {
    productionError('JWT_REFRESH_SECRET', 'must be a fresh production secret');
  }
  if (config.JWT_ACCESS_SECRET === config.JWT_REFRESH_SECRET) {
    productionError('JWT_ACCESS_SECRET/JWT_REFRESH_SECRET', 'must be different');
  }
  const fieldKey = Buffer.from(config.FIELD_ENCRYPTION_KEY, 'base64');
  if (fieldKey.length !== 32 || fieldKey.every((byte) => byte === 0)) {
    productionError('FIELD_ENCRYPTION_KEY', 'must be 32 fresh random bytes encoded as base64');
  }
  if (
    config.EXPORT_SIGNING_SECRET.length < 32 ||
    config.EXPORT_SIGNING_SECRET.includes('development') ||
    config.EXPORT_SIGNING_SECRET.includes('change-me')
  ) {
    productionError('EXPORT_SIGNING_SECRET', 'must be a fresh secret of at least 32 characters');
  }
  if (!config.SENTRY_DSN) productionError('SENTRY_DSN', 'is required');
  if (config.LLM_DEFAULT_PROVIDER === 'stub') {
    productionError('LLM_DEFAULT_PROVIDER', 'must select a real provider');
  }
  const providerKey =
    config.LLM_DEFAULT_PROVIDER === 'openai'
      ? config.OPENAI_API_KEY
      : config.LLM_DEFAULT_PROVIDER === 'openrouter'
        ? config.OPENROUTER_API_KEY
        : config.LLM_DEFAULT_PROVIDER === 'anthropic'
          ? config.ANTHROPIC_API_KEY
          : config.LLM_DEFAULT_PROVIDER === 'google'
            ? config.GOOGLE_GENERATIVE_AI_API_KEY
            : undefined;
  if (!providerKey) {
    productionError(`${config.LLM_DEFAULT_PROVIDER.toUpperCase()}_API_KEY`, 'is required');
  }
  if (
    config.GMAIL_INTEGRATION_ENABLED === 'true' &&
    (!config.GOOGLE_OAUTH_CLIENT_ID ||
      !config.GOOGLE_OAUTH_CLIENT_SECRET ||
      !config.GOOGLE_OAUTH_REDIRECT_URI)
  ) {
    productionError(
      'GOOGLE_OAUTH_CLIENT_ID/GOOGLE_OAUTH_CLIENT_SECRET/GOOGLE_OAUTH_REDIRECT_URI',
      'are required when GMAIL_INTEGRATION_ENABLED=true',
    );
  }
};

export const loadConfig = (environment: NodeJS.ProcessEnv = process.env): ApiConfig => {
  const config = environmentSchema.parse({
    ...environment,
    // Railway injects PORT for the public service. API_PORT remains available
    // for Docker/local use and wins when explicitly set.
    ...(environment.API_PORT === undefined && environment.PORT !== undefined
      ? { API_PORT: environment.PORT }
      : {}),
  });
  assertProductionConfig(config);
  return config;
};
