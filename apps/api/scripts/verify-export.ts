import { readFile } from 'node:fs/promises';

import { verifyExportArchive } from '../src/export-verification.js';

const archivePath = process.argv.slice(2).find((argument) => argument !== '--');
const signingSecret = process.env.EXPORT_SIGNING_SECRET;

if (archivePath === undefined || signingSecret === undefined || signingSecret.length < 12) {
  process.stderr.write(
    'Usage: EXPORT_SIGNING_SECRET="..." pnpm verify:export -- /absolute/path/to/orbit-export.zip\n',
  );
  process.exitCode = 2;
} else {
  const result = verifyExportArchive(await readFile(archivePath), signingSecret);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.valid) process.exitCode = 1;
}
