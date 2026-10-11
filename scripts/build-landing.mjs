import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(repo, 'apps/landing');
const output = resolve(process.argv[2] ?? resolve(repo, 'apps/landing/dist'));
if (output === repo || output === source)
  throw new Error('Output must be a dedicated generated directory');
const config = JSON.parse(await readFile(resolve(source, 'release-config.json'), 'utf8'));
// No fabricated release links. Require an APK digest before publishing its link.
if (
  config.testFlightUrl &&
  !/^https:\/\/testflight\.apple\.com\/join\/[A-Za-z0-9]{6,16}$/u.test(config.testFlightUrl)
)
  throw new Error('Invalid public TestFlight URL');
if (
  config.androidApkUrl &&
  (!/^https:\/\/[^\s]+\.apk(?:\?[^\s]*)?$/iu.test(config.androidApkUrl) ||
    !/^[a-f0-9]{64}$/u.test(config.androidApkSha256))
)
  throw new Error('An HTTPS APK URL and verified SHA-256 are required');
if (config.androidApkUrl) {
  const url = new URL(config.androidApkUrl);
  if (
    url.username ||
    url.password ||
    url.hash ||
    [...url.searchParams.keys()].some((key) => /token|secret|key|signature|credential/iu.test(key))
  )
    throw new Error(
      'APK link must be a stable public download, without credentials or signed-token query parameters',
    );
}
await mkdir(output, { recursive: true });
for (const name of [
  'index.html',
  'styles.css',
  'app.js',
  'release-config.json',
  'privacy',
  'terms',
  'support',
])
  await cp(resolve(source, name), resolve(output, name), { recursive: true });
await writeFile(
  resolve(output, '_headers'),
  '/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n',
);
process.stdout.write(`Landing output: ${output}\n`);
