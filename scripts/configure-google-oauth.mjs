import { chmod, lstat, readFile, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const rootEnv = fileURLToPath(new URL('../.env', import.meta.url));
const localCallback = 'http://localhost:4100/v1/connections/gmail/callback';
const valueOf = (text, key) => {
  const line = text.split(/\r?\n/u).find((item) => item.startsWith(`${key}=`));
  return (
    line
      ?.slice(key.length + 1)
      .trim()
      .replace(/^(['"])(.*)\1$/u, '$2') ?? ''
  );
};

/** Mechanical local configuration import; never logs or returns a credential separately. */
export function configureLocalGoogleEnvironment(original, credential) {
  if (valueOf(original, 'NODE_ENV') === 'production')
    throw new Error('This importer is restricted to local development.');
  const expectedProject = valueOf(original, 'GOOGLE_CLOUD_PROJECT_ID');
  const client = credential?.web;
  if (!expectedProject || client?.project_id !== expectedProject)
    throw new Error('Google credential does not belong to the configured ORBIT project.');
  if (
    typeof client.client_id !== 'string' ||
    !/^[A-Za-z0-9-]+\.apps\.googleusercontent\.com$/u.test(client.client_id) ||
    typeof client.client_secret !== 'string' ||
    !/^[A-Za-z0-9_-]{16,}$/u.test(client.client_secret) ||
    !Array.isArray(client.redirect_uris) ||
    client.redirect_uris.length !== 1 ||
    client.redirect_uris[0] !== localCallback
  )
    throw new Error('Expected a valid Web client with only the ORBIT localhost callback.');
  const users = valueOf(original, 'GOOGLE_TEST_USER_EMAILS');
  if (!users || !users.split(',').every((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)))
    throw new Error('Configure the approved Google test-user emails before importing.');
  const updates = {
    GOOGLE_OAUTH_CLIENT_ID: client.client_id,
    GOOGLE_OAUTH_CLIENT_SECRET: client.client_secret,
    GOOGLE_OAUTH_REDIRECT_URI: localCallback,
    GOOGLE_OAUTH_VERIFICATION_STATUS: 'testing',
    GMAIL_INTEGRATION_ENABLED: 'true',
  };
  for (const key of ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET']) {
    const old = valueOf(original, key);
    if (old && old !== updates[key])
      throw new Error(
        `Existing ${key} is not overwritten; review the local configuration yourself.`,
      );
  }
  const lines = original.split(/\r?\n/u);
  for (const [key, value] of Object.entries(updates)) {
    const matches = lines.flatMap((line, index) => (line.startsWith(`${key}=`) ? [index] : []));
    if (matches.length > 1) throw new Error(`Duplicate ${key} assignments require manual review.`);
    if (matches.length) lines[matches[0]] = `${key}=${value}`;
    else lines.splice(lines.at(-1) === '' ? lines.length - 1 : lines.length, 0, `${key}=${value}`);
  }
  return `${lines.join('\n').replace(/\n*$/u, '')}\n`;
}

/** Import an approved UI credential held in memory, with no second secret-bearing file. */
export async function persistLocalGoogleCredential(credential) {
  const envStat = await lstat(rootEnv);
  if (!envStat.isFile()) throw new Error('Use a regular local environment file.');
  const original = await readFile(rootEnv, 'utf8');
  const next = configureLocalGoogleEnvironment(original, credential);
  const temporary = `${rootEnv}.google-import-${randomUUID()}`;
  await writeFile(temporary, next, { mode: 0o600, flag: 'wx' });
  if ((await readFile(rootEnv, 'utf8')) !== original)
    throw new Error('Local environment changed during import; the original was preserved.');
  await rename(temporary, rootEnv);
}

if (
  typeof process !== 'undefined' &&
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const credentialPath = resolve(process.argv[2] ?? '');
    if (!process.argv[2]) throw new Error('Pass the downloaded Google Web credential JSON path.');
    const [envStat, credentialStat] = await Promise.all([lstat(rootEnv), lstat(credentialPath)]);
    if (!envStat.isFile() || !credentialStat.isFile() || credentialStat.size > 64_000)
      throw new Error('Use regular local files; oversized or symbolic-link input is refused.');
    const credential = JSON.parse(await readFile(credentialPath, 'utf8'));
    // Protect the downloaded key, too; it remains outside Git and is never printed.
    await chmod(credentialPath, 0o600);
    await persistLocalGoogleCredential(credential);
    console.log('Local Google testing configured. Credentials were not printed. Restart the API.');
  } catch {
    // Never echo parse/provider errors, input paths, credential payloads or secret values.
    console.error(
      'Google import refused. Review project, callback, tester list and existing values.',
    );
    process.exitCode = 1;
  }
}
