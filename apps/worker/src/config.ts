import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  LLM_DEFAULT_PROVIDER: z.enum(['stub', 'openai', 'anthropic', 'google']).default('stub'),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().optional(),
  FIELD_ENCRYPTION_KEY: z.string().default('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='),
  USER_DAILY_COST_CAP_CENTS: z.coerce.number().nonnegative().default(35),
  GLOBAL_DAILY_COST_CAP_CENTS: z.coerce.number().nonnegative().default(2_500),
  INTRODUCTIONS_PER_USER_PER_DAY: z.coerce.number().int().positive().default(12),
  DELETION_GRACE_DAYS: z.coerce.number().int().positive().default(7),
  RUN_WORKER_ONCE: z.string().optional(),
  NIGHTLY_MATCH_CRON: z.string().default('0 3 * * *'),
  WATCHER_TICK_CRON: z.string().default('*/15 * * * *'),
  CONSOLIDATION_CRON: z.string().default('30 4 * * *'),
  DELETION_CRON: z.string().default('0 4 * * *'),
});

export type WorkerConfig = z.infer<typeof schema>;
export const loadConfig = (environment: NodeJS.ProcessEnv = process.env): WorkerConfig =>
  schema.parse(environment);
