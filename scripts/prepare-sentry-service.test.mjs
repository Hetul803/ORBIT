import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareSentryService } from './prepare-sentry-service.mjs';

test('local startup does not upload to a remote project', () => {
  assert.deepEqual(prepareSentryService('api', { NODE_ENV: 'development' }), { skipped: true });
});

test('production refuses missing source-map settings by variable name', () => {
  assert.throws(() => prepareSentryService('worker', { NODE_ENV: 'production' }), /SENTRY_ORG/);
});

test('injects before uploading exactly the service and shared package builds', () => {
  const calls = [];
  const result = prepareSentryService(
    'api',
    {
      NODE_ENV: 'production',
      SENTRY_ORG: 'test-org',
      SENTRY_PROJECT: 'test-api',
      SENTRY_AUTH_TOKEN: 'test-private-token',
      SENTRY_RELEASE: 'test-release',
    },
    (_command, args, options) => {
      calls.push({ args, options });
      return { status: 0 };
    },
  );
  assert.equal(result.sourceMaps, 'uploaded');
  assert.equal(calls.length, 2);
  assert.ok(calls[0].args.includes('inject'));
  assert.ok(calls[1].args.includes('upload'));
  assert.ok(calls[1].args.includes('apps/api/dist'));
  assert.ok(!calls[1].args.includes('apps/worker/dist'));
  assert.ok(!calls[1].args.includes('test-private-token'));
});

test('failed remote upload blocks startup without echoing diagnostics', () => {
  assert.throws(
    () =>
      prepareSentryService(
        'worker',
        {
          NODE_ENV: 'production',
          SENTRY_ORG: 'test-org',
          SENTRY_PROJECT: 'test-worker',
          SENTRY_AUTH_TOKEN: 'test-private-token',
          SENTRY_RELEASE: 'test-release',
        },
        () => ({ status: 1, stderr: 'test-private-token message-body person@example.test' }),
      ),
    (error) => error.message.includes('failed') && !error.message.includes('test-private-token'),
  );
});
