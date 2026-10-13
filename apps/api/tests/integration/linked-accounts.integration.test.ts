import { randomUUID } from 'node:crypto';
import { createPrismaClient, type PrismaClient, type Connection } from '@orbit/db';
import { ModelRouter } from '@orbit/llm';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';
import { issueTokens } from '../../src/auth.js';
import { decryptField, encryptField } from '../../src/crypto.js';
import { createServices, type Services } from '../../src/services.js';
import { disconnectAccount, scopedExternalId } from '../../src/linked-accounts.js';
import {
  assertMicrosoftScopes,
  microsoftAccessTokenFor,
  microsoftJson,
} from '../../src/microsoft-read.js';
import { queueMicrosoftSync, runMicrosoftSyncTick } from '../../src/microsoft-sync.js';
import { refreshLifeItems } from '../../src/life.js';

interface FixtureDto {
  authorizationUrl: string;
  inboxId: string;
  draft: string;
  sent: boolean;
  items: { connectionId: string }[];
  events: { provider: string }[];
  sources: { provider: string }[];
}
const requestUrl = (input: RequestInfo | URL): string =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
const enabled = process.env.DATABASE_URL?.includes('orbit_test') === true;
const config = loadConfig({
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL: process.env.DATABASE_URL,
  GMAIL_INTEGRATION_ENABLED: 'true',
  GOOGLE_OAUTH_CLIENT_ID: 'fictional-google-client',
  GOOGLE_OAUTH_CLIENT_SECRET: 'fictional-google-secret',
  GOOGLE_OAUTH_REDIRECT_URI: 'http://localhost:4150/v1/connections/gmail/callback',
  MICROSOFT_INTEGRATION_ENABLED: 'true',
  MICROSOFT_OAUTH_CLIENT_ID: 'fictional-microsoft-client',
  MICROSOFT_OAUTH_CLIENT_SECRET: 'fictional-microsoft-secret',
  MICROSOFT_OAUTH_REDIRECT_URI: 'http://localhost:4150/v1/connections/outlook/callback',
  LLM_DEFAULT_PROVIDER: 'stub',
});
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
const completion = {
  text: 'A draft for owner review.',
  provider: 'fixture-model',
  model: 'fixture',
  tokensIn: 10,
  tokensOut: 10,
  latencyMs: 1,
  costCents: 0,
  usedFallback: false,
};
describe.runIf(enabled)('strict linked-account boundaries, synthetic providers only', () => {
  let db: PrismaClient, app: FastifyInstance, services: Services;
  const users: string[] = [];
  beforeAll(async () => {
    db = createPrismaClient();
    app = await buildApp(db, config);
    await app.ready();
    services = createServices(db, config);
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await db.connection.updateMany({
      where: { userId: { in: users } },
      data: { syncStatus: 'idle', syncLeaseUntil: null, syncLeaseToken: null },
    });
  });
  afterAll(async () => {
    await app.close();
    await db.$disconnect();
  });
  const owner = async () => {
    const user = await db.user.create({
      data: {
        email: `account-qa-${randomUUID()}@orbit.local`,
        displayName: 'Fictional Owner',
        dateOfBirth: new Date('1990-01-01'),
      },
    });
    users.push(user.id);
    await db.agent.create({
      data: {
        userId: user.id,
        name: 'Morrow',
        identitySeed: randomUUID(),
        voiceProfile: { examples: ['Keep it simple.'] },
      },
    });
    return {
      user,
      headers: { authorization: `Bearer ${(await issueTokens(db, config, user)).accessToken}` },
    };
  };
  const account = async (
    userId: string,
    provider: 'GOOGLE' | 'MICROSOFT',
    email = 'same@fictional.orbit.test',
  ) => {
    const accountKey = randomUUID();
    return db.connection.create({
      data: {
        userId,
        provider,
        accountKey,
        accountEmail: email,
        status: 'ACTIVE',
        scopes: [],
        encryptedTokens: encryptField(
          JSON.stringify({
            ownerId: userId,
            provider,
            accountKey,
            accessToken: `fictional-${accountKey}`,
            refreshToken: 'fixture-refresh',
            expiresAt: new Date(Date.now() + 3600000).toISOString(),
          }),
          config.FIELD_ENCRYPTION_KEY,
        ),
      },
    });
  };
  const source = (c: Connection, rawId = 'identical-id', calendar = false) =>
    db.sourceDocument.create({
      data: {
        userId: c.userId,
        connectionId: c.id,
        kind:
          c.provider === 'GOOGLE'
            ? calendar
              ? 'GOOGLE_CALENDAR_EVENT'
              : 'GMAIL_MESSAGE'
            : calendar
              ? 'MICROSOFT_CALENDAR_EVENT'
              : 'OUTLOOK_MESSAGE',
        externalId: scopedExternalId(c, rawId),
        threadId: 'same-thread-id',
        direction: 'INBOUND',
        title: `${c.provider} ${calendar ? 'planning' : 'Please reply'} ${rawId}`,
        sender: 'Friend <friend@fictional.orbit.test>',
        body: 'FORBIDDEN RETAINED FIXTURE BODY',
        sourceUrl: 'https://outlook.office.com/',
        occurredAt: new Date(Date.now() + (calendar ? 3600000 : -3 * 86400000)),
        metadata: calendar
          ? {
              start: new Date(Date.now() + 3600000).toISOString(),
              end: new Date(Date.now() + 7200000).toISOString(),
              allDay: false,
            }
          : { labels: ['IMPORTANT'], derived: { needsReply: true } },
      },
    });
  const network = (
    c: Connection,
    count = 30,
    override?: (url: string) => Promise<Response | null>,
  ) =>
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = requestUrl(input);
      const custom = await override?.(url);
      if (custom) return custom;
      if (url.includes('/token'))
        return json({
          access_token: 'refreshed-fixture',
          refresh_token: 'rotated-fixture',
          expires_in: 3600,
          scope: 'User.Read Mail.Read Calendars.Read',
        });
      if (url.includes('/me?')) return json({ id: 'immutable-profile-id', mail: c.accountEmail });
      if (url.includes('/mailFolders/'))
        return json({
          id: url.includes('junkemail')
            ? 'junk'
            : url.includes('deleteditems')
              ? 'deleted'
              : 'sent',
        });
      if (url.includes('/calendarView')) return json({ value: [] });
      if (url.includes('/messages?')) {
        const offset = Number(new URL(url).searchParams.get('offset') ?? 0);
        return json({
          value: Array.from({ length: Math.min(20, count - offset) }, (_, i) => ({
            id: `ms-${String(offset + i)}`,
          })),
          ...(offset + 20 < count
            ? {
                '@odata.nextLink': `https://graph.microsoft.com/v1.0/me/messages?offset=${String(offset + 20)}`,
              }
            : {}),
        });
      }
      if (url.includes('/messages/'))
        return json({
          id: 'immutable-message',
          conversationId: 'same-thread-id',
          subject: 'Please reply to this fictional invitation',
          receivedDateTime: new Date().toISOString(),
          importance: 'high',
          parentFolderId: 'inbox',
          from: { emailAddress: { name: 'Friend', address: 'friend@fictional.orbit.test' } },
          body: {
            contentType: 'text',
            content: 'Can you reply? SECRET RAW BODY MUST NOT BE RETAINED.',
          },
          webLink: 'https://outlook.office.com/mail/',
        });
      throw new Error('Unexpected fictional Graph request');
    });
  it('keeps same-ID/thread messages in two providers and many accounts distinct, including same email addresses', async () => {
    const o = await owner(),
      g = await account(o.user.id, 'GOOGLE'),
      m = await account(o.user.id, 'MICROSOFT'),
      m2 = await account(o.user.id, 'MICROSOFT');
    const records = await Promise.all([source(g), source(m), source(m2)]);
    const linked = await app.inject({ url: '/v1/connections', headers: o.headers });
    const metadata = linked.json<{ id: string; provider: string; status: string }[]>();
    expect(
      metadata.every((c) => ['google', 'microsoft'].includes(c.provider) && c.status === 'active'),
    ).toBe(true);
    expect(new Set(metadata.map((c) => c.id))).toEqual(new Set([g.id, m.id, m2.id]));
    expect(linked.body).not.toContain('encryptedTokens');
    const response = await app.inject({ url: '/v1/mail?action=needs_reply', headers: o.headers });
    expect(response.statusCode).toBe(200);
    expect(response.json<FixtureDto>().items).toHaveLength(3);
    expect(
      new Set(
        response.json<FixtureDto>().items.map((i: { connectionId: string }) => i.connectionId),
      ),
    ).toEqual(new Set([g.id, m.id, m2.id]));
    expect(response.body).not.toContain('FORBIDDEN RETAINED FIXTURE BODY');
    for (const c of [g, m, m2]) {
      const filtered = await app.inject({
        url: '/v1/mail?connectionId=' + c.id,
        headers: o.headers,
      });
      expect(
        filtered.json<FixtureDto>().items.map((i: { connectionId: string }) => i.connectionId),
      ).toEqual([c.id]);
    }
    await refreshLifeItems(services, o.user.id, undefined, false);
    expect(
      await db.lifeItem.count({
        where: {
          userId: o.user.id,
          stableKey: { in: records.map((s) => 'waiting-reply:' + s.id) },
        },
      }),
    ).toBe(3);
    await Promise.all([source(g, 'event', true), source(m, 'event', true)]);
    const agenda = await app.inject({ url: '/v1/agenda', headers: o.headers });
    expect(
      agenda
        .json<FixtureDto>()
        .events.map((e: { provider: string }) => e.provider)
        .sort(),
    ).toEqual(['google', 'microsoft']);
  });
  it('keeps connected model context closed by default outside synthetic tests and reports the gate honestly', async () => {
    const o = await owner(),
      m = await account(o.user.id, 'MICROSOFT');
    const ms = await source(m);
    const closed = await buildApp(db, {
      ...config,
      NODE_ENV: 'production',
      GMAIL_INTEGRATION_ENABLED: 'false',
      MICROSOFT_INTEGRATION_ENABLED: 'false',
      ACCOUNT_MODEL_CONTEXT_ENABLED: 'false',
    });
    await closed.ready();
    const model = vi.spyOn(ModelRouter.prototype, 'complete');
    try {
      const capability = await closed.inject({ url: '/v1/agent', headers: o.headers });
      expect(
        capability.json<{ connectedContextAvailable: boolean }>().connectedContextAvailable,
      ).toBe(false);
      const chat = await closed.inject({
        method: 'POST',
        url: '/v1/agent/chat',
        headers: o.headers,
        payload: {
          message: 'Review my accounts.',
          contextConsent: true,
          includeConnectedContext: true,
          connectedContextConsent: true,
        },
      });
      expect(chat.statusCode).toBe(503);
      const draft = await closed.inject({
        method: 'POST',
        url: '/v1/mail/' + ms.id + '/draft',
        headers: o.headers,
        payload: { contextConsent: true },
      });
      expect(draft.statusCode).toBe(503);
      expect(model).not.toHaveBeenCalled();
    } finally {
      await closed.close();
    }
  });
  it('rejects wrong-owner and wrong-provider binding and identity moves at the database, not only the API', async () => {
    const o = await owner(),
      other = await owner(),
      g = await account(o.user.id, 'GOOGLE'),
      m = await account(o.user.id, 'MICROSOFT');
    const s = await source(g);
    await expect(
      db.sourceDocument.create({
        data: {
          userId: other.user.id,
          connectionId: g.id,
          kind: 'GMAIL_MESSAGE',
          externalId: randomUUID(),
          title: 'Wrong owner',
          body: '',
          sourceUrl: 'https://example.com',
        },
      }),
    ).rejects.toThrow();
    await expect(
      db.sourceDocument.update({ where: { id: s.id }, data: { connectionId: m.id } }),
    ).rejects.toThrow();
    await expect(
      db.sourceDocument.create({
        data: {
          userId: o.user.id,
          connectionId: g.id,
          kind: 'OUTLOOK_MESSAGE',
          externalId: randomUUID(),
          title: 'Wrong provider',
          body: '',
          sourceUrl: 'https://example.com',
        },
      }),
    ).rejects.toThrow();
    await expect(
      db.connection.update({ where: { id: m.id }, data: { userId: other.user.id } }),
    ).rejects.toThrow();
    await expect(
      db.connection.update({
        where: { id: m.id },
        data: { accountEmail: 'different@fictional.orbit.test' },
      }),
    ).rejects.toThrow();
    for (const url of ['/v1/mail?connectionId=' + m.id, '/v1/agenda?connectionId=' + g.id])
      expect((await app.inject({ url, headers: other.headers })).statusCode).toBe(404);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/connections/outlook/start',
          headers: o.headers,
          payload: { connectionId: g.id },
        })
      ).statusCode,
    ).toBe(404);
  });
  it('never forwards a token to malicious nextLink, other Graph users, or redirects', async () => {
    const requests = vi.spyOn(globalThis, 'fetch');
    for (const path of [
      'https://evil.example/me/messages',
      'https://graph.microsoft.com/v1.0/users/someone/messages',
      'https://graph.microsoft.com@evil.example/v1.0/me/messages',
    ])
      await expect(microsoftJson(path, 'fictional-token')).rejects.toMatchObject({
        code: 'MICROSOFT_PAGE_INVALID',
      });
    expect(requests).not.toHaveBeenCalled();
    requests.mockResolvedValue(json({ value: [] }));
    await microsoftJson('/me/messages', 'fictional-token');
    expect(requests.mock.calls[0]?.[1]?.redirect).toBe('error');
  });
  it('refuses exchanged ciphertext from another mailbox before any network request', async () => {
    const o = await owner(),
      m = await account(o.user.id, 'MICROSOFT'),
      m2 = await account(o.user.id, 'MICROSOFT');
    const tampered = await db.connection.update({
      where: { id: m2.id },
      data: { encryptedTokens: m.encryptedTokens },
    });
    const requests = vi.spyOn(globalThis, 'fetch');
    await expect(microsoftAccessTokenFor(services, tampered)).rejects.toMatchObject({
      code: 'MICROSOFT_TOKEN_ACCOUNT_MISMATCH',
    });
    expect(requests).not.toHaveBeenCalled();
  });
  it('returns immediately, checkpoints 20 then 10 messages, resumes another runner and stores no raw bodies or model calls', async () => {
    const o = await owner(),
      m = await account(o.user.id, 'MICROSOFT');
    const requests = network(m),
      model = vi.spyOn(services.llm, 'complete');
    const starts = await Promise.all([
      queueMicrosoftSync(services, o.user.id, m.id),
      queueMicrosoftSync(services, o.user.id, m.id),
    ]);
    expect(starts[0].runId).toBe(starts[1].runId);
    expect(requests).not.toHaveBeenCalled();
    await runMicrosoftSyncTick(services);
    expect((await db.connection.findUniqueOrThrow({ where: { id: m.id } })).syncProcessed).toBe(20);
    const fresh = createServices(db, config);
    for (let n = 0; n < 3; n++) await runMicrosoftSyncTick(fresh);
    const current = await db.connection.findUniqueOrThrow({ where: { id: m.id } });
    expect(current.syncProcessed).toBe(30);
    expect(current.syncStatus).toBe('idle');
    expect(current.lastSyncedAt).not.toBeNull();
    const rows = await db.sourceDocument.findMany({ where: { userId: o.user.id } });
    expect(rows).toHaveLength(30);
    expect(rows.every((s) => s.connectionId === m.id && s.body === '')).toBe(true);
    expect(JSON.stringify([rows, current.syncState])).not.toContain('SECRET RAW BODY');
    expect(model).not.toHaveBeenCalled();
  }, 30000);
  it('retries rate limits from the last committed message without duplicates and leases exclude concurrent runners', async () => {
    const o = await owner(),
      m = await account(o.user.id, 'MICROSOFT');
    let failed = false;
    network(m, 25, (url) => {
      if (url.includes('/messages/ms-21?') && !failed) {
        failed = true;
        return Promise.resolve(json({}, 429));
      }
      return Promise.resolve(null);
    });
    await queueMicrosoftSync(services, o.user.id, m.id);
    const claims = await Promise.all([
      runMicrosoftSyncTick(services),
      runMicrosoftSyncTick(createServices(db, config)),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    await runMicrosoftSyncTick(services);
    let current = await db.connection.findUniqueOrThrow({ where: { id: m.id } });
    expect(current.syncStatus).toBe('retrying');
    expect(current.syncProcessed).toBe(21);
    await db.connection.update({ where: { id: m.id }, data: { syncNextAttemptAt: new Date(0) } });
    for (let n = 0; n < 3; n++) await runMicrosoftSyncTick(services);
    current = await db.connection.findUniqueOrThrow({ where: { id: m.id } });
    expect(current.syncStatus).toBe('idle');
    expect(await db.sourceDocument.count({ where: { userId: o.user.id } })).toBe(25);
  }, 30000);
  it('disconnects Microsoft atomically, cancels in-flight import and leaves Google sources/context intact', async () => {
    const o = await owner(),
      g = await account(o.user.id, 'GOOGLE'),
      m = await account(o.user.id, 'MICROSOFT');
    const gs = await source(g),
      ms = await source(m);
    await refreshLifeItems(services, o.user.id, undefined, false);
    network(m, 1, async (url) => {
      if (url.includes('/messages/ms-0?')) {
        await disconnectAccount(services, o.user.id, m.id, 'MICROSOFT');
      }
      return null;
    });
    await queueMicrosoftSync(services, o.user.id, m.id);
    await runMicrosoftSyncTick(services);
    expect(
      (await db.sourceDocument.findUniqueOrThrow({ where: { id: gs.id } })).deletedAt,
    ).toBeNull();
    expect(
      (await db.sourceDocument.findUniqueOrThrow({ where: { id: ms.id } })).deletedAt,
    ).not.toBeNull();
    expect(
      await db.sourceDocument.count({
        where: { userId: o.user.id, connectionId: m.id, deletedAt: null },
      }),
    ).toBe(0);
    expect((await db.connection.findUniqueOrThrow({ where: { id: g.id } })).status).toBe('ACTIVE');
    expect(
      (
        await db.lifeItem.findFirstOrThrow({
          where: { userId: o.user.id, stableKey: 'waiting-reply:' + ms.id },
        })
      ).deletedAt,
    ).not.toBeNull();
    const mail = await app.inject({ url: '/v1/mail', headers: o.headers });
    expect(mail.json<FixtureDto>().items).toHaveLength(1);
  });
  it('uses PKCE, consumes state once, refuses cross-provider state and extra write scopes', async () => {
    const o = await owner();
    const start = await app.inject({
      method: 'POST',
      url: '/v1/connections/outlook/start',
      headers: o.headers,
    });
    const url = new URL(start.json<FixtureDto>().authorizationUrl),
      state = url.searchParams.get('state') ?? '';
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('scope')).toBe('User.Read Mail.Read Calendars.Read offline_access');
    expect(
      (await app.inject({ url: '/v1/connections/gmail/callback?state=' + state + '&code=fixture' }))
        .statusCode,
    ).toBe(401);
    const requests = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      if (requestUrl(input).includes('/token')) {
        expect(init?.body instanceof URLSearchParams ? init.body.toString() : '').toContain(
          'code_verifier=',
        );
        return Promise.resolve(
          json({
            access_token: 'fixture-access',
            refresh_token: 'fixture-refresh',
            expires_in: 3600,
            scope: 'User.Read Mail.Read Calendars.Read',
          }),
        );
      }
      return Promise.resolve(json({ id: 'immutable-profile', mail: 'new@fictional.orbit.test' }));
    });
    const callback = await app.inject({
      url: '/v1/connections/outlook/callback?state=' + state + '&code=fixture',
    });
    expect(callback.statusCode).toBe(302);
    expect(callback.headers.location).toContain('outlook=connected');
    const saved = await db.connection.findFirstOrThrow({
      where: { userId: o.user.id, provider: 'MICROSOFT' },
    });
    const stored = JSON.parse(decryptField(saved.encryptedTokens, config.FIELD_ENCRYPTION_KEY));
    expect(stored.ownerId).toBe(o.user.id);
    expect(stored.accountKey).toBe(saved.accountKey);
    const called = requests.mock.calls.length;
    expect(
      (
        await app.inject({
          url: '/v1/connections/outlook/callback?state=' + state + '&code=replay',
        })
      ).statusCode,
    ).toBe(401);
    expect(requests).toHaveBeenCalledTimes(called);
    expect(() => assertMicrosoftScopes('User.Read Mail.Read Calendars.Read Mail.Send')).toThrow();
    expect(() => assertMicrosoftScopes('User.Read Mail.Read')).toThrow();
    const status = await app.inject({ url: '/v1/connections/outlook/status', headers: o.headers });
    expect(status.body).not.toContain('fixture-refresh');
    expect(status.body).not.toContain('encryptedTokens');
  });
  it('attributes both providers to the agent, excludes raw bodies and discards disconnected account history', async () => {
    const o = await owner(),
      g = await account(o.user.id, 'GOOGLE'),
      m = await account(o.user.id, 'MICROSOFT');
    await source(g);
    await source(m);
    const model = vi.spyOn(ModelRouter.prototype, 'complete').mockResolvedValue(completion);
    const response = await app.inject({
      method: 'POST',
      url: '/v1/agent/chat',
      headers: o.headers,
      payload: {
        message: 'What needs a reply?',
        contextConsent: true,
        includeConnectedContext: true,
        connectedContextConsent: true,
      },
    });
    expect(response.statusCode).toBe(200);
    expect(
      response
        .json<FixtureDto>()
        .sources.map((s: { provider: string }) => s.provider)
        .sort(),
    ).toEqual(['google', 'microsoft']);
    const prompt = JSON.stringify(model.mock.calls[0]?.[0].messages);
    expect(prompt).toContain(g.id);
    expect(prompt).toContain(m.id);
    expect(prompt).not.toContain('FORBIDDEN RETAINED FIXTURE BODY');
    expect(model.mock.calls[0]?.[0].constraints.privateAccountContext).toBe(true);
    const consent = await app.inject({
      method: 'POST',
      url: '/v1/agent/chat',
      headers: o.headers,
      payload: {
        message: 'What needs a reply?',
        contextConsent: true,
        includeConnectedContext: true,
      },
    });
    expect(consent.statusCode).toBe(400);
    await disconnectAccount(services, o.user.id, m.id, 'MICROSOFT');
    await app.inject({
      method: 'POST',
      url: '/v1/agent/chat',
      headers: o.headers,
      payload: {
        message: 'Help with Google.',
        contextConsent: true,
        includeConnectedContext: true,
        connectedContextConsent: true,
        history: [
          {
            role: 'assistant',
            content: 'STALE MICROSOFT ANSWER',
            context: 'accounts',
            connectionIds: [m.id],
          },
        ],
      },
    });
    expect(JSON.stringify(model.mock.calls.at(-1)?.[0].messages)).not.toContain(
      'STALE MICROSOFT ANSWER',
    );
  });
  it('prepares only the selected account’s email, persists a real review-only draft and refuses to overwrite its reviewed receipt', async () => {
    const o = await owner(),
      m = await account(o.user.id, 'MICROSOFT'),
      g = await account(o.user.id, 'GOOGLE');
    const ms = await source(m);
    await source(g);
    const requests = network(m),
      model = vi.spyOn(ModelRouter.prototype, 'complete').mockResolvedValue(completion);
    const draft = await app.inject({
      method: 'POST',
      url: '/v1/mail/' + ms.id + '/draft',
      headers: o.headers,
      payload: { contextConsent: true },
    });
    expect(draft.statusCode).toBe(200);
    expect(draft.json<FixtureDto>().sent).toBe(false);
    expect(draft.json<FixtureDto>().inboxId).toBeTruthy();
    expect(JSON.stringify(model.mock.calls[0]?.[0].messages)).toContain('SECRET RAW BODY');
    expect(JSON.stringify(model.mock.calls[0]?.[0].messages)).not.toContain('GOOGLE Please reply');
    expect(
      requests.mock.calls.every(([url]) =>
        requestUrl(url).startsWith('https://graph.microsoft.com/'),
      ),
    ).toBe(true);
    const approve = () =>
      app.inject({
        method: 'POST',
        url: '/v1/inbox/' + draft.json<FixtureDto>().inboxId + '/approve',
        headers: o.headers,
        payload: { editedReply: 'Owner-reviewed final wording.' },
      });
    const results = await Promise.all([approve(), approve()]);
    expect(results.filter((r) => r.statusCode === 200)).toHaveLength(1);
    expect(
      (await db.inboxItem.findUniqueOrThrow({ where: { id: draft.json<FixtureDto>().inboxId } }))
        .agentReply,
    ).toBe('Owner-reviewed final wording.');
    const again = await app.inject({
      method: 'POST',
      url: '/v1/mail/' + ms.id + '/draft',
      headers: o.headers,
      payload: { contextConsent: true },
    });
    expect(again.json<FixtureDto>().draft).toBe('Owner-reviewed final wording.');
    expect(model).toHaveBeenCalledTimes(1);
  });
  it('does not save a model result after account disconnect, and hard-deleting an owner cascades bound sources', async () => {
    const o = await owner(),
      m = await account(o.user.id, 'MICROSOFT');
    const ms = await source(m);
    network(m);
    vi.spyOn(ModelRouter.prototype, 'complete').mockImplementation(async () => {
      await disconnectAccount(services, o.user.id, m.id, 'MICROSOFT');
      return completion;
    });
    const response = await app.inject({
      method: 'POST',
      url: '/v1/mail/' + ms.id + '/draft',
      headers: o.headers,
      payload: { contextConsent: true },
    });
    expect(response.statusCode).toBe(409);
    expect(
      await db.inboxItem.count({
        where: { recipientUserId: o.user.id, agentReply: { not: null } },
      }),
    ).toBe(0);
    await db.user.delete({ where: { id: o.user.id } });
    expect(await db.sourceDocument.count({ where: { userId: o.user.id } })).toBe(0);
  });
});
