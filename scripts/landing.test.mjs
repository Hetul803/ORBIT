import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const { JSDOM } = createRequire(new URL('../apps/mobile/package.json', import.meta.url))('jsdom');
const root = new URL('../apps/landing/', import.meta.url);
const html = await readFile(new URL('index.html', root), 'utf8');
const js = await readFile(new URL('app.js', root), 'utf8');
const render = async (config, fail = false) => {
  const dom = new JSDOM(html, { url: 'https://orbit.test', runScripts: 'outside-only' });
  dom.window.fetch = async () => {
    if (fail) throw new Error('offline');
    return { ok: true, json: async () => config };
  };
  vm.runInContext(js, dom.getInternalVMContext());
  await new Promise((resolve) => setImmediate(resolve));
  return dom.window.document;
};
test('missing release configuration never creates a dead or invented download', async () => {
  const config = JSON.parse(await readFile(new URL('release-config.json', root), 'utf8'));
  const page = await render(config);
  assert.equal(page.querySelector('#ios-download a'), null);
  assert.equal(page.querySelector('#android-download a'), null);
  assert.match(page.getElementById('release-status').textContent, /No live download/);
});
test('only valid public TestFlight and HTTPS APK plus digest become download links', async () => {
  const page = await render({
    testFlightUrl: 'https://testflight.apple.com/join/Test1234',
    androidApkUrl: 'https://downloads.orbit.test/orbit.apk',
    androidApkSha256: 'a'.repeat(64),
  });
  assert.equal(page.querySelector('#ios-download a').hostname, 'testflight.apple.com');
  assert.equal(page.querySelector('#android-download a').pathname, '/orbit.apk');
  assert.equal(page.getElementById('apk-checksum').hidden, false);
});
test('invalid, script or unverified links and network errors retain unavailable states', async () => {
  for (const config of [
    { testFlightUrl: 'javascript:alert(1)', androidApkUrl: 'http://bad.test/file.apk' },
    {
      testFlightUrl: 'https://attacker.test/join/Test1234',
      androidApkUrl: 'https://downloads.orbit.test/file.apk',
    },
  ]) {
    const page = await render(config);
    assert.equal(page.querySelector('#ios-download a, #android-download a'), null);
  }
  assert.equal(
    (await render({}, true)).querySelector('#ios-download a, #android-download a'),
    null,
  );
});
test('homepage and legal documents are public static documents, not login-walled routes', async () => {
  assert.match(html, /href="\/privacy\/"/);
  assert.match(html, /href="\/terms\/"/);
  const privacy = await readFile(new URL('privacy/index.html', root), 'utf8');
  const text = new JSDOM(privacy).window.document.body.textContent.replace(/\s+/gu, ' ');
  assert.match(text, /Gmail message bodies are not retained/);
  assert.match(text, /does not use private user data to train a shared model/);
  assert.match(privacy, /named test users/);
  assert.match(privacy, /Contact a human/);
});
test('approved support address becomes a private mail link without HTML injection', async () => {
  const supportHtml = await readFile(new URL('support/index.html', root), 'utf8');
  const dom = new JSDOM(supportHtml, { url: 'https://orbit.test', runScripts: 'outside-only' });
  dom.window.fetch = async () => ({
    ok: true,
    json: async () => ({ supportEmail: 'support@orbit.test' }),
  });
  vm.runInContext(js, dom.getInternalVMContext());
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(
    dom.window.document.querySelector('#private-support a').href,
    'mailto:support@orbit.test',
  );
  assert.equal(
    dom.window.document.querySelector('#private-support a').textContent,
    'support@orbit.test',
  );
});
