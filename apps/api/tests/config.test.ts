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
  MODERATION_OPERATOR_EMAILS: 'operator@orbit.test',
  SUPPORT_EMAIL: 'support@orbit.test',
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
    ['MODERATION_OPERATOR_EMAILS', { MODERATION_OPERATOR_EMAILS: '' }],
    ['SUPPORT_EMAIL', { SUPPORT_EMAIL: '' }],
    ['MODERATION_COVERAGE_CONFIRMED', { PUBLIC_ALPHA_SIGNUPS_OPEN: 'true' }],
    ['GOOGLE_CLOUD_PROJECT_ID', { GMAIL_INTEGRATION_ENABLED: 'true' }],
  ])('names %s when an unsafe production value is supplied', (name, override) => {
    expect(() => loadConfig({ ...productionEnvironment(), ...override })).toThrow(name);
  });

  it('allows local development without production credentials', () => {
    expect(loadConfig({ NODE_ENV: 'development' }).OTP_DELIVERY_MODE).toBe('log');
  });

  it('never allows a configured account cap above 100', () => {
    expect(loadConfig({ NODE_ENV: 'test' }).DEPLOYMENT_ACCOUNT_CAP).toBe(100);
    expect(() => loadConfig({ NODE_ENV: 'test', DEPLOYMENT_ACCOUNT_CAP: '101' })).toThrow();
  });

  it('requires named Google testers until verification is actually complete', () => {
    const google = {
      ...productionEnvironment(),
      GMAIL_INTEGRATION_ENABLED: 'true',
      GOOGLE_CLOUD_PROJECT_ID: 'fresh-orbit-project',
      GOOGLE_OAUTH_CLIENT_ID: 'orbit-only-client',
      GOOGLE_OAUTH_CLIENT_SECRET: 'test-server-secret',
      GOOGLE_OAUTH_REDIRECT_URI: 'https://api.orbit.test/v1/connections/gmail/callback',
    };
    expect(() => loadConfig(google)).toThrow('GOOGLE_TEST_USER_EMAILS');
    expect(
      loadConfig({ ...google, GOOGLE_TEST_USER_EMAILS: 'founder@orbit.test' })
        .GOOGLE_OAUTH_VERIFICATION_STATUS,
    ).toBe('testing');
    expect(
      loadConfig({ ...google, GOOGLE_OAUTH_VERIFICATION_STATUS: 'verified' })
        .GOOGLE_TEST_USER_EMAILS,
    ).toBe('');
  });
});
