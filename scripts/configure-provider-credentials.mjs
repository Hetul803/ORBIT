import { lstat, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const rootEnv = fileURLToPath(new URL('../.env', import.meta.url));
const providerEnv = fileURLToPath(new URL('../.env.providers.local', import.meta.url));
const approvedKeys = new Set([
  'SENTRY_DSN_API',
  'SENTRY_DSN_WORKER',
  'SENTRY_DSN_MOBILE',
  'SENTRY_AUTH_TOKEN',
  'SENTRY_ORG',
  'RESEND_API_KEY',
  'RESEND_FROM_EMAIL',
]);

const assignments = (text, key) =>
  text.split(/\r?\n/u).filter((line) => line.startsWith(`${key}=`));
const unquote = (value) => value.trim().replace(/^(['"])(.*)\1$/u, '$2');

/** Mechanical import of founder-approved provider credentials. Never logs values. */
export function mergeProviderCredentials(original, updates) {
  const lines = original.split(/\r?\n/u);
  for (const [key, value] of Object.entries(updates)) {
    if (typeof value !== 'string' || /[\r\n\0]/u.test(value))
      throw new Error('Provider values must be single-line strings.');
    const matches = assignments(original, key);
    if (matches.length > 1) throw new Error('Duplicate provider assignments require review.');
    const old = matches[0] ? unquote(matches[0].slice(key.length + 1)) : '';
    const isSenderPlaceholder = key === 'RESEND_FROM_EMAIL' && old === 'ORBIT <hello@example.com>';
    if (old && old !== value && !isSenderPlaceholder)
      throw new Error('Existing provider credentials are not overwritten.');
    const index = lines.findIndex((line) => line.startsWith(`${key}=`));
    const encoded = JSON.stringify(value);
    if (index >= 0) lines[index] = `${key}=${encoded}`;
    else
      lines.splice(lines.at(-1) === '' ? lines.length - 1 : lines.length, 0, `${key}=${encoded}`);
  }
  return `${lines.join('\n').replace(/\n*$/u, '')}\n`;
}

export function validateProviderCredentials(values) {
  if (!values || typeof values !== 'object' || Array.isArray(values))
    throw new Error('Expected approved provider credentials.');
  if (Object.keys(values).some((key) => !approvedKeys.has(key)))
    throw new Error('Only approved ORBIT provider fields can be imported.');
  if (Object.keys(values).some((key) => key.startsWith('SENTRY_'))) {
    if (values.SENTRY_ORG !== 'gsin-bb') throw new Error('Expected approved Sentry organization.');
    if (!/^sntrys_[A-Za-z0-9_+/=-]{40,}$/u.test(values.SENTRY_AUTH_TOKEN ?? ''))
      throw new Error('Expected an organization CI token.');
    const projectIds = new Set();
    for (const key of ['SENTRY_DSN_API', 'SENTRY_DSN_WORKER', 'SENTRY_DSN_MOBILE']) {
      let url;
      try {
        url = new URL(values[key]);
      } catch {
        throw new Error('Expected three valid project DSNs.');
      }
      if (
        url.protocol !== 'https:' ||
        !/^[a-f0-9]{32}$/u.test(url.username) ||
        url.password ||
        !/^o\d+\.ingest(?:\.us)?\.sentry\.io$/u.test(url.hostname) ||
        !/^\/\d+$/u.test(url.pathname) ||
        url.search ||
        url.hash ||
        url.port
      )
        throw new Error('Expected standard Sentry ingestion DSNs.');
      projectIds.add(url.pathname);
    }
    if (projectIds.size !== 3) throw new Error('Use distinct API, worker and mobile projects.');
  }
  if ('RESEND_API_KEY' in values || 'RESEND_FROM_EMAIL' in values) {
    if (
      !/^re_[A-Za-z0-9_-]{16,}$/u.test(values.RESEND_API_KEY ?? '') ||
      values.RESEND_FROM_EMAIL !== 'ORBIT <hello@notify.orbitapp.world>'
    )
      throw new Error('Expected the approved Resend sender and sending-only key.');
  }
  if (Object.keys(values).length === 0) throw new Error('No provider credentials supplied.');
  return values;
}

async function readRegular(path, allowMissing = false) {
  try {
    const stat = await lstat(path);
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > 64_000)
      throw new Error('Use small, unlinked regular environment files.');
    return await readFile(path, 'utf8');
  } catch (error) {
    if (allowMissing && error.code === 'ENOENT') return null;
    throw error;
  }
}

async function replacePrivate(path, original, next) {
  const temporary = `${path}.provider-import-${randomUUID()}`;
  try {
    await writeFile(temporary, next, { mode: 0o600, flag: 'wx' });
    if ((await readRegular(path, original === null)) !== original)
      throw new Error('Environment changed during import; original preserved.');
    await rename(temporary, path);
  } finally {
    await unlink(temporary).catch((error) => {
      if (error.code !== 'ENOENT') throw new Error('Private temporary cleanup failed.');
    });
  }
}

/** Writes only ignored 0600 files; caller must verify provider scopes/domain in the UI first. */
export async function persistProviderCredentials(values, paths = {}) {
  validateProviderCredentials(values);
  const rootPath = paths.rootPath ?? rootEnv;
  const providerPath = paths.providerPath ?? providerEnv;
  const [originalRoot, originalProviders] = await Promise.all([
    readRegular(rootPath),
    readRegular(providerPath, true),
  ]);
  const localUpdates = {};
  if (values.SENTRY_DSN_API) {
    localUpdates.SENTRY_DSN = values.SENTRY_DSN_API;
    localUpdates.EXPO_PUBLIC_SENTRY_DSN = values.SENTRY_DSN_MOBILE;
  }
  if (values.RESEND_API_KEY) {
    localUpdates.RESEND_API_KEY = values.RESEND_API_KEY;
    localUpdates.RESEND_FROM_EMAIL = values.RESEND_FROM_EMAIL;
    // This is a non-secret delivery setting, not a credential being replaced.
  }
  const nextRoot = mergeProviderCredentials(originalRoot, localUpdates);
  const nextProviders = mergeProviderCredentials(originalProviders ?? '', values);
  // Preserve the one-time provider token first; retrying the same values is idempotent.
  await replacePrivate(providerPath, originalProviders, nextProviders);
  await replacePrivate(rootPath, originalRoot, nextRoot);
  return { stored: true, files: 2, permissions: '0600' };
}
