import { describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config.js';

const productionEnvironment = (): NodeJS.ProcessEnv => ({
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://service:private@db.internal:5432/orbit?sslmode=require',
  REDIS_URL: 'rediss://redis.internal:6380',
  FIELD_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'),
  SENTRY_DSN: 'https://public@sentry.test/2',
  LLM_DEFAULT_PROVIDER: 'openrouter',
  OPENROUTER_API_KEY: 'server-only-openrouter-key',
});

describe('worker production configuration', () => {
  it('accepts explicit production-only settings', () => {
    expect(loadConfig(productionEnvironment()).NODE_ENV).toBe('production');
  });

  it.each([
    ['DATABASE_URL', { DATABASE_URL: 'postgresql://orbit:orbit@localhost:5432/orbit' }],
    ['REDIS_URL', { REDIS_URL: 'redis://localhost:6379' }],
    ['FIELD_ENCRYPTION_KEY', { FIELD_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64') }],
    ['SENTRY_DSN', { SENTRY_DSN: '' }],
    ['LLM_DEFAULT_PROVIDER', { LLM_DEFAULT_PROVIDER: 'stub' }],
  ])('names %s when an unsafe production value is supplied', (name, override) => {
    expect(() => loadConfig({ ...productionEnvironment(), ...override })).toThrow(name);
  });
});
