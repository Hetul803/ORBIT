import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = new URL('../', import.meta.url);

test('iOS submission targets the dedicated ORBIT record without committed upload credentials', () => {
  const config = JSON.parse(readFileSync(new URL('apps/mobile/eas.json', root), 'utf8'));
  assert.equal(config.submit.production.ios.ascAppId, '6821827369');
  for (const key of ['appleId', 'ascApiKeyPath', 'ascApiKeyIssuerId', 'ascApiKeyId'])
    assert.equal(config.submit.production.ios[key], undefined, key);
});

test('EAS upload retains every Git exclusion and excludes local evidence/signing files', () => {
  const ignored = readFileSync(new URL('.easignore', root), 'utf8').split('\n');
  const gitIgnored = readFileSync(new URL('.gitignore', root), 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0 && !line.startsWith('#'));
  for (const pattern of gitIgnored) assert.ok(ignored.includes(pattern), pattern);
  for (const pattern of ['docs/', '.git/', 'credentials.json', '*.jks', '*.p12', '*.key', '*.p8'])
    assert.ok(ignored.includes(pattern), pattern);
  for (const pattern of [
    'credentials.json',
    '*.jks',
    '*.keystore',
    '*.p12',
    '*.mobileprovision',
    '*.pem',
    '*.key',
    '*.p8',
  ])
    assert.ok(gitIgnored.includes(pattern), `Git must also exclude ${pattern}`);
});

test('cloud mobile hook builds the shared dependency and Metro enables debug IDs without replay', () => {
  const packageJson = JSON.parse(readFileSync(new URL('apps/mobile/package.json', root), 'utf8'));
  assert.equal(packageJson.scripts['eas-build-post-install'], 'pnpm --filter @orbit/shared build');
  const mobileRequire = createRequire(new URL('apps/mobile/package.json', root));
  const config = mobileRequire('./metro.config.cjs');
  assert.equal(config.projectRoot, fileURLToPath(new URL('apps/mobile', root)));
  assert.equal(typeof config.resolver.resolveRequest, 'function');
  assert.equal(typeof config.serializer.customSerializer, 'function');
  const { getSentryExpoConfig } = mobileRequire('@sentry/react-native/metro');
  let plugins = [];
  getSentryExpoConfig(config.projectRoot, {
    includeWebReplay: false,
    enableSourceContextInDevelopment: false,
    getDefaultConfig: (_projectRoot, options) => {
      plugins = options.unstable_beforeAssetSerializationPlugins;
      return { resolver: {}, serializer: {}, symbolicator: {} };
    },
  });
  assert.ok(
    plugins.some((plugin) => plugin.name === 'unstableBeforeAssetSerializationDebugIdPlugin'),
  );
});
