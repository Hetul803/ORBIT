import assert from 'node:assert/strict';
import { test } from 'node:test';
import { replaceOpenRouterKey } from './set-openrouter-key.mjs';

const fakeKey = 'sk-or-v1-' + 'test-only-not-a-real-key-123456789';
test('private key updater changes only its assignment and never touches other keys', () => {
  const original = 'OTHER_KEY=untouched\nOPENROUTER_API_KEY=old\nJWT_SECRET=untouched\n';
  assert.equal(
    replaceOpenRouterKey(original, fakeKey),
    `OTHER_KEY=untouched\nOPENROUTER_API_KEY=${fakeKey}\nJWT_SECRET=untouched\n`,
  );
});
test('private key updater appends a missing assignment and removes overriding duplicates', () => {
  assert.equal(
    replaceOpenRouterKey('KEEP=yes', fakeKey),
    `KEEP=yes\nOPENROUTER_API_KEY=${fakeKey}\n`,
  );
  const result = replaceOpenRouterKey(
    'export OPENROUTER_API_KEY=old\nOPENROUTER_API_KEY=older\nKEEP=yes\n',
    fakeKey,
  );
  assert.equal(result.match(/OPENROUTER_API_KEY=/gu).length, 1);
  assert.ok(result.includes('KEEP=yes'));
});
test('private key updater rejects invalid or multiline input without echoing it', () => {
  for (const input of ['not-a-key', fakeKey + '\nJWT_SECRET=overwritten', ''])
    assert.throws(
      () => replaceOpenRouterKey('KEEP=yes\n', input),
      (error) => !error.message.includes(input || 'KEEP'),
    );
});
