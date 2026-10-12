import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const replaceOpenRouterKey = (contents, entered) => {
  const key = entered.trim();
  if (!/^sk-or-v1-[A-Za-z0-9_-]{20,}$/u.test(key))
    throw new Error('That does not look like an OpenRouter key. No file was changed.');
  const newline = contents.includes('\r\n') ? '\r\n' : '\n';
  const pattern = /^[\t ]*(?:export[\t ]+)?OPENROUTER_API_KEY[\t ]*=.*$/gmu;
  let replaced = false;
  const updated = contents.replace(pattern, () => {
    if (replaced) return ''; // Remove duplicate assignments, which dotenv could otherwise override.
    replaced = true;
    return `OPENROUTER_API_KEY=${key}`;
  });
  return replaced
    ? updated
    : updated +
        (updated.endsWith('\n') || updated.length === 0 ? '' : newline) +
        `OPENROUTER_API_KEY=${key}${newline}`;
};

const readHidden = () =>
  new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      reject(
        new Error(
          'Run this command directly in your terminal; do not put a key in command arguments.',
        ),
      );
      return;
    }
    process.stdout.write('Paste your new OpenRouter key (input hidden), then press Enter: ');
    let entered = '';
    const previousRaw = process.stdin.isRaw;
    const finish = (error) => {
      process.stdin.off('data', receive);
      process.stdin.setRawMode(previousRaw);
      process.stdin.pause();
      process.stdout.write('\n');
      if (error) reject(error);
      else resolve(entered);
    };
    const receive = (bytes) => {
      const text = bytes.toString('utf8').replace(/\x1b\[20[01]~/gu, '');
      for (const char of text) {
        if (char === '\u0003') {
          finish(new Error('Cancelled. No file was changed.'));
          return;
        }
        if (char === '\r' || char === '\n') {
          finish();
          return;
        }
        if (char === '\u007f' || char === '\b') entered = entered.slice(0, -1);
        else if (char >= ' ' && char <= '~') entered += char;
        if (entered.length > 512) {
          finish(new Error('Input too long. No file was changed.'));
          return;
        }
      }
    };
    process.stdin.setRawMode(true);
    process.stdin.on('data', receive);
    process.stdin.resume();
  });

const main = async () => {
  const target = fileURLToPath(new URL('../.env', import.meta.url));
  const stat = fs.lstatSync(target);
  if (!stat.isFile() || stat.isSymbolicLink())
    throw new Error('Root .env must be a regular existing file.');
  const original = fs.readFileSync(target, 'utf8');
  const updated = replaceOpenRouterKey(original, await readHidden());
  if (fs.readFileSync(target, 'utf8') !== original)
    throw new Error('.env changed while you entered the key. Please try again.');
  const temporary = path.join(
    path.dirname(target),
    `.env.openrouter-${randomBytes(8).toString('hex')}.tmp`,
  );
  try {
    fs.writeFileSync(temporary, updated, { mode: 0o600, flag: 'wx' });
    fs.renameSync(temporary, target);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
  process.stdout.write(
    'Updated only OPENROUTER_API_KEY in the private root .env (0600). The key was not displayed.\nLocal running services and Railway have NOT been restarted or changed.\n',
  );
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch(() => {
    process.stderr.write(
      'Key update could not complete. Check the key format and root .env; no key was displayed.\n',
    );
    process.exitCode = 1;
  });
