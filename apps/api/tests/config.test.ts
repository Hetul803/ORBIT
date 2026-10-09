import { describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config.js';

const productionEnvironment = (): NodeJS.ProcessEnv => ({
  NODE_ENV: 'production',
  PUBLIC_API_URL: 'https://api.orbit.test',
  ALLOWED_ORIGINS: 'https://orbit.test',
  DATABASE_URL: 'postgresql://service:private@db.internal:5432/orbit?sslmode=require',
  REDIS_URL: 'rediss://redis.internal:6380',
  JWT_ACCESS_SECRET: 'a'.repeat(48),
  JWT_REFRESH_SECRET: 'b'.repeat(48),
  OTP_DELIVERY_MODE: 'resend',
  ALLOW_DEVELOPMENT_OTP_DISPLAY: 'false',
  ALLOW_DEVELOPMENT_SEED: 'false',
  RESEND_API_KEY: 'server-only-resend-key',
  RESEND_FROM_EMAIL: 'ORBIT <sign-in@orbit.test>',
  PHONE_OTP_PROVIDER: 'disabled',
  FIELD_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  EXPORT_SIGNING_SECRET: 'c'.repeat(48),
  SENTRY_DSN: 'https://public@sentry.test/1',
  LLM_DEFAULT_PROVIDER: 'openrouter',
  OPENROUTER_API_KEY: 'server-only-openrouter-key',
});

describe('API production configuration', () => {
  it('accepts explicit production-only settings', () => {
    expect(loadConfig(productionEnvironment()).NODE_ENV).toBe('production');
  });

  it.each([
    ['ALLOW_DEVELOPMENT_OTP_DISPLAY', { ALLOW_DEVELOPMENT_OTP_DISPLAY: 'true' }],
    ['ALLOW_DEVELOPMENT_SEED', { ALLOW_DEVELOPMENT_SEED: 'true' }],
    ['OTP_DELIVERY_MODE', { OTP_DELIVERY_MODE: 'log' }],
    ['PHONE_OTP_PROVIDER', { PHONE_OTP_PROVIDER: 'log' }],
    ['SENTRY_DSN', { SENTRY_DSN: '' }],
    ['LLM_DEFAULT_PROVIDER', { LLM_DEFAULT_PROVIDER: 'stub' }],
    ['TRUSTED_PROXY_CIDRS', { TRUSTED_PROXY_CIDRS: '0.0.0.0/0' }],
  ])('names %s when an unsafe production value is supplied', (name, override) => {
    expect(() => loadConfig({ ...productionEnvironment(), ...override })).toThrow(name);
  });

  it('allows local development without production credentials', () => {
    expect(loadConfig({ NODE_ENV: 'development' }).OTP_DELIVERY_MODE).toBe('log');
  });
});
