import { test } from 'node:test';
import assert from 'node:assert/strict';
import { configureLocalGoogleEnvironment } from './configure-google-oauth.mjs';
const original =
  'NODE_ENV=development\nGOOGLE_CLOUD_PROJECT_ID=orbit-local-test\nGOOGLE_TEST_USER_EMAILS=founder@orbit.test\nGMAIL_INTEGRATION_ENABLED=false\nOTHER_VALUE=preserved\n';
const credential = () => ({
  web: {
    project_id: 'orbit-local-test',
    client_id: '123-test.apps.googleusercontent.com',
    client_secret: 'synthetic-test-credential-not-a-key',
    redirect_uris: ['http://localhost:4100/v1/connections/gmail/callback'],
  },
});
test('imports only the configured ORBIT local Web client and preserves unrelated values', () => {
  const next = configureLocalGoogleEnvironment(original, credential());
  assert.match(next, /OTHER_VALUE=preserved/);
  assert.match(next, /GMAIL_INTEGRATION_ENABLED=true/);
  assert.match(next, /GOOGLE_OAUTH_VERIFICATION_STATUS=testing/);
  assert.equal(configureLocalGoogleEnvironment(next, credential()), next);
});
test('refuses another project, production, missing tester proof and another callback', () => {
  assert.throws(() =>
    configureLocalGoogleEnvironment(original, {
      web: { ...credential().web, project_id: 'another-app' },
    }),
  );
  assert.throws(() =>
    configureLocalGoogleEnvironment(
      original.replace('NODE_ENV=development', 'NODE_ENV=production'),
      credential(),
    ),
  );
  assert.throws(() =>
    configureLocalGoogleEnvironment(
      original.replace('GOOGLE_TEST_USER_EMAILS=founder@orbit.test', 'GOOGLE_TEST_USER_EMAILS='),
      credential(),
    ),
  );
  assert.throws(() =>
    configureLocalGoogleEnvironment(original, {
      web: { ...credential().web, redirect_uris: ['https://another.test/callback'] },
    }),
  );
});
test('never overwrites an existing different OAuth key or accepts malformed secrets', () => {
  assert.throws(() =>
    configureLocalGoogleEnvironment(
      `${original}GOOGLE_OAUTH_CLIENT_SECRET=already-configured\n`,
      credential(),
    ),
  );
  assert.throws(() =>
    configureLocalGoogleEnvironment(original, {
      web: { ...credential().web, client_secret: 'invalid\nVALUE=injected' },
    }),
  );
  assert.throws(() =>
    configureLocalGoogleEnvironment(
      `${original}GOOGLE_OAUTH_CLIENT_ID=\nGOOGLE_OAUTH_CLIENT_ID=\n`,
      credential(),
    ),
  );
});
