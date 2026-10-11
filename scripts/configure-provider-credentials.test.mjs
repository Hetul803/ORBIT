import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  mergeProviderCredentials,
  persistProviderCredentials,
  rotateResendSendingKey,
  validateProviderCredentials,
} from './configure-provider-credentials.mjs';

const sentry = {
  SENTRY_ORG: 'gsin-bb',
  SENTRY_AUTH_TOKEN: `sntrys_${'synthetic'.repeat(8)}`,
  SENTRY_DSN_API: `https://${'a'.repeat(32)}@o123.ingest.us.sentry.io/111`,
  SENTRY_DSN_WORKER: `https://${'b'.repeat(32)}@o123.ingest.us.sentry.io/222`,
  SENTRY_DSN_MOBILE: `https://${'c'.repeat(32)}@o123.ingest.us.sentry.io/333`,
};

test('imports only approved provider keys and distinct DSNs', () => {
  assert.equal(validateProviderCredentials(sentry), sentry);
  for (const values of [
    { ...sentry, GOOGLE_OAUTH_CLIENT_SECRET: 'no' },
    { ...sentry, SENTRY_ORG: 'another-org' },
    { ...sentry, SENTRY_DSN_WORKER: sentry.SENTRY_DSN_API },
    { ...sentry, SENTRY_DSN_API: sentry.SENTRY_DSN_API.replace('sentry.io', 'example.com') },
    { ...sentry, SENTRY_AUTH_TOKEN: 'personal-token' },
  ])
    assert.throws(() => validateProviderCredentials(values));
});

test('rejects alternate sender domains, malformed keys and multiline imports', () => {
  assert.throws(() =>
    validateProviderCredentials({ RESEND_API_KEY: 'bad', RESEND_FROM_EMAIL: 'x' }),
  );
  assert.throws(() => mergeProviderCredentials('', { SENTRY_AUTH_TOKEN: 'value\nBAD=true' }));
  assert.match(
    mergeProviderCredentials('RESEND_FROM_EMAIL="ORBIT <hello@example.com>"\n', {
      RESEND_FROM_EMAIL: 'ORBIT <hello@notify.orbitapp.world>',
    }),
    /hello@notify\.orbitapp\.world/u,
  );
});

test('preserves unrelated values and refuses replacement or duplicate credentials', () => {
  const merged = mergeProviderCredentials('GOOGLE_OAUTH_CLIENT_SECRET=untouched\nSENTRY_DSN=\n', {
    SENTRY_DSN: sentry.SENTRY_DSN_API,
  });
  assert.match(merged, /^GOOGLE_OAUTH_CLIENT_SECRET=untouched\n/u);
  assert.throws(() =>
    mergeProviderCredentials('SENTRY_AUTH_TOKEN=old\n', { SENTRY_AUTH_TOKEN: 'new' }),
  );
  assert.throws(() => mergeProviderCredentials('SENTRY_DSN=\nSENTRY_DSN=\n', { SENTRY_DSN: 'x' }));
});

test('writes private files without placing upload token in runtime root env and is idempotent', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'orbit-provider-import-'));
  try {
    const paths = {
      rootPath: join(directory, '.env'),
      providerPath: join(directory, '.env.providers.local'),
    };
    await writeFile(paths.rootPath, 'NODE_ENV=development\nOPENROUTER_API_KEY=untouched\n');
    assert.deepEqual(await persistProviderCredentials(sentry, paths), {
      stored: true,
      files: 2,
      permissions: '0600',
    });
    const root = await readFile(paths.rootPath, 'utf8');
    assert.doesNotMatch(root, /SENTRY_AUTH_TOKEN=/u);
    assert.match(root, /EXPO_PUBLIC_SENTRY_DSN=/u);
    assert.match(root, /OPENROUTER_API_KEY=untouched/u);
    for (const path of Object.values(paths)) assert.equal((await stat(path)).mode & 0o777, 0o600);
    await persistProviderCredentials(sentry, paths);
    assert.equal(await readFile(paths.rootPath, 'utf8'), root);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('refuses symlink destinations and leaves local environment intact', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'orbit-provider-symlink-'));
  try {
    const rootPath = join(directory, '.env');
    await writeFile(rootPath, 'NODE_ENV=development\n');
    const providerPath = join(directory, '.env.providers.local');
    await symlink(rootPath, providerPath);
    await assert.rejects(persistProviderCredentials(sentry, { rootPath, providerPath }));
    assert.equal(await readFile(rootPath, 'utf8'), 'NODE_ENV=development\n');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('approved Resend rotation compares the old key and preserves all other providers', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'orbit-provider-rotation-'));
  try {
    const paths = {
      rootPath: join(directory, '.env'),
      providerPath: join(directory, '.env.providers.local'),
    };
    const oldKey = `re_${'oldsynthetic'.repeat(3)}`;
    const newKey = `re_${'newsynthetic'.repeat(3)}`;
    const original = `GOOGLE_OAUTH_CLIENT_SECRET=untouched\nRESEND_API_KEY="${oldKey}"\nSENTRY_AUTH_TOKEN=untouched\n`;
    for (const path of Object.values(paths)) await writeFile(path, original);
    assert.deepEqual(await rotateResendSendingKey(newKey, oldKey, paths), {
      rotated: true,
      files: 2,
      permissions: '0600',
    });
    await rotateResendSendingKey(newKey, oldKey, paths);
    for (const path of Object.values(paths)) {
      assert.equal(await readFile(path, 'utf8'), original.replace(oldKey, newKey));
      assert.equal((await stat(path)).mode & 0o777, 0o600);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('Resend rotation refuses mismatched or duplicate keys without changing either file', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'orbit-provider-rotation-guard-'));
  try {
    const paths = {
      rootPath: join(directory, '.env'),
      providerPath: join(directory, '.env.providers.local'),
    };
    const oldKey = `re_${'oldsynthetic'.repeat(3)}`;
    const newKey = `re_${'newsynthetic'.repeat(3)}`;
    const original = `RESEND_API_KEY="${oldKey}"\n`;
    for (const path of Object.values(paths)) await writeFile(path, original);
    await assert.rejects(rotateResendSendingKey(newKey, `re_${'different'.repeat(4)}`, paths));
    await assert.rejects(rotateResendSendingKey('malformed', oldKey, paths));
    for (const path of Object.values(paths)) assert.equal(await readFile(path, 'utf8'), original);
    await writeFile(paths.providerPath, original.repeat(2));
    await assert.rejects(rotateResendSendingKey(newKey, oldKey, paths));
    assert.equal(await readFile(paths.rootPath, 'utf8'), original);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
