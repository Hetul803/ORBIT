import { randomBytes } from 'node:crypto';
import { open } from 'node:fs/promises';
import { resolve } from 'node:path';

const destination = resolve(process.cwd(), '.env.production.local');
const base64url = (bytes) => randomBytes(bytes).toString('base64url');
const lines = [
  '# Generated locally for ORBIT production. Never commit or share this file.',
  `# Generated at ${new Date().toISOString()}`,
  `JWT_ACCESS_SECRET=${base64url(48)}`,
  `JWT_REFRESH_SECRET=${base64url(48)}`,
  `FIELD_ENCRYPTION_KEY=${randomBytes(32).toString('base64')}`,
  `EXPORT_SIGNING_SECRET=${base64url(48)}`,
  '',
];

let file;
try {
  file = await open(destination, 'wx', 0o600);
  await file.writeFile(lines.join('\n'), { encoding: 'utf8' });
} catch (error) {
  if (error && typeof error === 'object' && error.code === 'EEXIST') {
    throw new Error(
      '.env.production.local already exists; refusing to overwrite production secrets.',
    );
  }
  throw error;
} finally {
  await file?.close();
}

process.stdout.write(
  'Created ignored .env.production.local with mode 0600. Secret values were not printed.\n',
);
