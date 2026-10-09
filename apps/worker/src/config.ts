import { z } from 'zod';

const optionalUrl = z.preprocess(
  (value) => (typeof value === 'string' && value.trim().length === 0 ? undefined : value),
  z.url().optional(),
);

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  SENTRY_DSN: optionalUrl,
  SENTRY_ENVIRONMENT: z.string().default('development'),
  DATABASE_URL: z.string().default('postgresql://orbit:orbit@localhost:5432/orbit?schema=public'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  LLM_DEFAULT_PROVIDER: z
    .enum(['stub', 'openai', 'openrouter', 'anthropic', 'google'])
    .default('stub'),
  OPENAI_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_BASE_URL: z.url().default('https://openrouter.ai/api/v1'),
  OPENROUTER_HTTP_REFERER: optionalUrl,
  OPENROUTER_APP_TITLE: z.string().default('ORBIT'),
  ANTHROPIC_API_KEY: z.string().optional(),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().optional(),
  FIELD_ENCRYPTION_KEY: z.string().default('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='),
  SEARCH_API_ENDPOINT: z.url().default('https://api.search.brave.com/res/v1/web/search'),
  SEARCH_API_KEY: z.string().optional(),
  USER_DAILY_COST_CAP_CENTS: z.coerce.number().nonnegative().default(35),
  GLOBAL_DAILY_COST_CAP_CENTS: z.coerce.number().nonnegative().default(2_500),
  INTRODUCTIONS_PER_USER_PER_DAY: z.coerce.number().int().positive().default(12),
  DELETION_GRACE_DAYS: z.coerce.number().int().positive().default(7),
  RUN_WORKER_ONCE: z.string().optional(),
  WORKER_ONCE_JOBS: z.string().optional(),
  NIGHTLY_MATCH_CRON: z.string().default('0 3 * * *'),
  WATCHER_TICK_CRON: z.string().default('*/15 * * * *'),
  CONSOLIDATION_CRON: z.string().default('30 4 * * *'),
  DELETION_CRON: z.string().default('0 4 * * *'),
  PUSH_TICK_CRON: z.string().default('* * * * *'),
  PROACTIVE_TICK_CRON: z.string().default('15 * * * *'),
  PROACTIVE_DAILY_CAP: z.coerce.number().int().positive().max(12).default(6),
});

export type WorkerConfig = z.infer<typeof schema>;

const fail = (name: string, requirement: string): never => {
  throw new Error(`Production configuration error: ${name} ${requirement}`);
};

export const loadConfig = (environment: NodeJS.ProcessEnv = process.env): WorkerConfig => {
  const config = schema.parse(environment);
  if (config.NODE_ENV !== 'production') return config;
  if (config.DATABASE_URL.includes('localhost') || config.DATABASE_URL.includes('orbit:orbit@')) {
    fail('DATABASE_URL', 'must be an explicit production database URL');
  }
  if (config.REDIS_URL.includes('localhost')) {
    fail('REDIS_URL', 'must be an explicit production Redis URL');
  }
  const fieldKey = Buffer.from(config.FIELD_ENCRYPTION_KEY, 'base64');
  if (fieldKey.length !== 32 || fieldKey.every((byte) => byte === 0)) {
    fail('FIELD_ENCRYPTION_KEY', 'must be 32 fresh random bytes encoded as base64');
  }
  if (!config.SENTRY_DSN) fail('SENTRY_DSN', 'is required');
  if (config.LLM_DEFAULT_PROVIDER === 'stub') {
    fail('LLM_DEFAULT_PROVIDER', 'must select a real provider');
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
  if (!providerKey) fail(`${config.LLM_DEFAULT_PROVIDER.toUpperCase()}_API_KEY`, 'is required');
  return config;
};
