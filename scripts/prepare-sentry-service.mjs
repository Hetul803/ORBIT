import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

export const prepareSentryService = (service, environment = process.env, run = spawnSync) => {
  if (!['api', 'worker'].includes(service)) throw new Error('Expected service api or worker.');
  if (environment.NODE_ENV !== 'production') return { skipped: true };
  for (const name of ['SENTRY_ORG', 'SENTRY_PROJECT', 'SENTRY_AUTH_TOKEN', 'SENTRY_RELEASE']) {
    if (!environment[name]?.trim())
      throw new Error(`Production configuration error: ${name} is required for source maps`);
  }
  const cli = require.resolve('@sentry/cli/bin/sentry-cli');
  const directories = [
    `apps/${service}/dist`,
    ...['agent', 'db', 'llm', 'shared'].map((name) => `packages/${name}/dist`),
  ];
  for (const args of [
    ['sourcemaps', 'inject', ...directories],
    ['sourcemaps', 'upload', '--release', environment.SENTRY_RELEASE, ...directories],
  ]) {
    const result = run(process.execPath, [cli, ...args], {
      cwd: root,
      env: { ...environment, SENTRY_LOG_LEVEL: 'error' },
      encoding: 'utf8',
      timeout: 60_000,
    });
    // Do not forward arbitrary CLI diagnostics: they may contain remote response data.
    if (result.status !== 0)
      throw new Error(
        `Sentry ${args[1]} failed; verify SENTRY_* permissions and network access (exit ${result.status ?? 'timeout'}).`,
      );
  }
  return { skipped: false, service, sourceMaps: 'uploaded' };
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(`${JSON.stringify(prepareSentryService(process.argv[2]))}\n`);
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'Sentry preparation failed'}\n`,
    );
    process.exitCode = 1;
  }
}
