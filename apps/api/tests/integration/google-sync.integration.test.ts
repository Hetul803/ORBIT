import { randomUUID } from 'node:crypto';
import { createPrismaClient, type PrismaClient } from '@orbit/db';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';
import { issueTokens } from '../../src/auth.js';
import { encryptField } from '../../src/crypto.js';
import { createServices, type Services } from '../../src/services.js';
import { runGoogleSyncTick } from '../../src/google-sync.js';
import { categoryForLabels } from '../../src/mail-categories.js';

const enabled = process.env.DATABASE_URL?.includes('orbit_test') === true;
const config = loadConfig({
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL: process.env.DATABASE_URL,
  GMAIL_INTEGRATION_ENABLED: 'true',
  GOOGLE_OAUTH_CLIENT_ID: 'fixture-only-client',
  GOOGLE_OAUTH_CLIENT_SECRET: 'fixture-only-secret',
  GOOGLE_OAUTH_REDIRECT_URI: 'http://localhost:4150/v1/connections/gmail/callback',
  LLM_DEFAULT_PROVIDER: 'stub',
});
describe.runIf(enabled)('durable Google sync, synthetic sources only', () => {
  let db: PrismaClient;
  let app: FastifyInstance;
  let services: Services;
  beforeAll(async () => {
    db = createPrismaClient();
    app = await buildApp(db, config);
    await app.ready();
    services = createServices(db, config);
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    await app.close();
    await db.$disconnect();
  });
  const owner = async () => {
    const user = await db.user.create({
      data: {
        email: `gmail-qa-${randomUUID()}@orbit.local`,
        displayName: 'Synthetic inbox owner',
        dateOfBirth: new Date('1990-01-01'),
      },
    });
    const c = await db.connection.create({
      data: {
        userId: user.id,
        provider: 'GOOGLE',
        status: 'ACTIVE',
        scopes: [],
        encryptedTokens: encryptField(
          JSON.stringify({ refreshToken: 'fixture-not-a-real-token' }),
          config.FIELD_ENCRYPTION_KEY,
        ),
      },
    });
    return { user, c, token: (await issueTokens(db, config, user)).accessToken };
  };
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
  const network = (count = 30, beforeMessage?: (id: string) => Promise<Response | null>) =>
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/token')) return json({ access_token: 'fixture-access', expires_in: 3600 });
      if (url.includes('/revoke')) return json({});
      if (url.endsWith('/profile')) return json({ emailAddress: 'owner@fictional.orbit.test' });
      if (url.includes('/messages?')) {
        const offset = Number(new URL(url).searchParams.get('pageToken') ?? 0);
        return json({
          ...(offset + 500 < count ? { nextPageToken: String(offset + 500) } : {}),
          messages: Array.from({ length: Math.min(500, count - offset) }, (_, i) => ({
            id: `fixture-${String(offset + i)}`,
            threadId: `thread-${String(offset + i)}`,
          })),
        });
      }
      if (url.includes('/messages/')) {
        const id = /\/messages\/([^?]+)/u.exec(url)?.[1] ?? '';
        const override = await beforeMessage?.(id);
        if (override) return override;
        return json({
          threadId: id,
          labelIds: id === 'fixture-0' ? ['SPAM'] : ['IMPORTANT'],
          payload: {
            mimeType: 'text/plain',
            headers: [
              { name: 'Subject', value: `Synthetic ${id}` },
              { name: 'From', value: 'Fictional Person <friend@fictional.orbit.test>' },
              { name: 'Date', value: 'Thu, 08 Oct 2026 10:00:00 +0000' },
            ],
            body: {
              data: Buffer.from(
                'Can you reply? Unrelated raw fixture text must never be retained.',
              ).toString('base64url'),
            },
          },
        });
      }
      if (url.includes('calendar')) return json({ items: [] });
      throw new Error('Unexpected synthetic Google request');
    });
  const start = (token: string) =>
    app.inject({
      method: 'POST',
      url: '/v1/connections/gmail/sync',
      headers: { authorization: `Bearer ${token}` },
    });

  it('returns immediately, deduplicates starts and resumes batches with fresh services after screen/process departure', async () => {
    const o = await owner();
    const requests = network();
    const model = vi.spyOn(services.llm, 'complete');
    const starts = await Promise.all([start(o.token), start(o.token)]);
    expect(starts.map((r) => r.statusCode)).toEqual([202, 202]);
    expect(starts[0].json().runId).toBe(starts[1].json().runId);
    expect(requests).not.toHaveBeenCalled();
    await runGoogleSyncTick(services);
    let c = await db.connection.findUniqueOrThrow({ where: { id: o.c.id } });
    expect(c.syncProcessed).toBe(20);
    expect(c.syncStatus).toBe('reading_mail');
    expect(c.lastSyncedAt).toBeNull();
    expect(await db.lifeItem.count({ where: { userId: o.user.id } })).toBeGreaterThan(0);
    const restarted = createServices(db, config);
    for (let n = 0; n < 3; n++) await runGoogleSyncTick(restarted);
    c = await db.connection.findUniqueOrThrow({ where: { id: o.c.id } });
    expect(c.syncStatus).toBe('idle');
    expect(c.syncProcessed).toBe(30);
    expect(c.lastSyncedAt).not.toBeNull();
    const sources = await db.sourceDocument.findMany({ where: { userId: o.user.id } });
    expect(sources).toHaveLength(30);
    expect(sources.every((s) => s.body === '')).toBe(true);
    expect(JSON.stringify(sources)).not.toContain('Unrelated raw fixture text');
    expect(model).not.toHaveBeenCalled();
    const mail = await app.inject({
      method: 'GET',
      url: '/v1/mail?category=spam',
      headers: { authorization: `Bearer ${o.token}` },
    });
    expect(mail.json().items).toHaveLength(1);
    expect(mail.json().counts.important).toBe(29);
    expect(
      await db.lifeItem.count({
        where: {
          userId: o.user.id,
          evidence: {
            array_contains: [{ sourceId: sources.find((s) => s.externalId === 'fixture-0')?.id }],
          },
        },
      }),
    ).toBe(0);
  }, 30_000);
  it('checkpoints every message, backs off a temporary error and retries without duplicate source/inbox rows', async () => {
    const o = await owner();
    let failed = false;
    network(25, (id) => {
      if (id === 'fixture-21' && !failed) {
        failed = true;
        return Promise.resolve(
          json({ error: { errors: [{ reason: 'userRateLimitExceeded' }] } }, 403),
        );
      }
      return Promise.resolve(null);
    });
    await start(o.token);
    await runGoogleSyncTick(services);
    await runGoogleSyncTick(services);
    let c = await db.connection.findUniqueOrThrow({ where: { id: o.c.id } });
    expect(c.syncStatus).toBe('retrying');
    expect(c.syncErrorCode).toBe('GOOGLE_RATE_LIMITED');
    expect(c.syncProcessed).toBe(21);
    expect(await runGoogleSyncTick(services)).toBe(false);
    await db.connection.update({ where: { id: o.c.id }, data: { syncNextAttemptAt: new Date(0) } });
    for (let n = 0; n < 3; n++) await runGoogleSyncTick(services);
    c = await db.connection.findUniqueOrThrow({ where: { id: o.c.id } });
    expect(c.syncStatus).toBe('idle');
    expect(await db.sourceDocument.count({ where: { userId: o.user.id } })).toBe(25);
    expect(await db.inboxItem.count({ where: { recipientUserId: o.user.id } })).toBe(25);
  }, 30_000);
  it('does not resurrect a disconnected token or commit an in-flight message after disconnect', async () => {
    const o = await owner();
    network(1, async () => {
      const deleted = await app.inject({
        method: 'DELETE',
        url: '/v1/connections/gmail',
        headers: { authorization: `Bearer ${o.token}` },
      });
      expect(deleted.statusCode).toBe(204);
      return null;
    });
    await start(o.token);
    await runGoogleSyncTick(services);
    const c = await db.connection.findUniqueOrThrow({ where: { id: o.c.id } });
    expect(c.status).toBe('REVOKED');
    expect(c.syncStatus).toBe('idle');
    expect(c.syncRunId).toBeNull();
    expect(await db.sourceDocument.count({ where: { userId: o.user.id } })).toBe(0);
  });
  it('two runners cannot import the same batch, and another owner cannot read its mail', async () => {
    const o = await owner();
    network(2);
    await start(o.token);
    await Promise.all([runGoogleSyncTick(services), runGoogleSyncTick(createServices(db, config))]);
    expect(await db.sourceDocument.count({ where: { userId: o.user.id } })).toBe(2);
    // Complete the pending calendar/Catch steps so this fixture cannot capture later tests' ticks.
    await runGoogleSyncTick(services);
    await runGoogleSyncTick(services);
    const other = await owner();
    const response = await app.inject({
      method: 'GET',
      url: '/v1/mail',
      headers: { authorization: `Bearer ${other.token}` },
    });
    expect(response.json().items).toEqual([]);
    expect((await app.inject({ method: 'GET', url: '/v1/mail' })).statusCode).toBe(401);
  });
  it('categorizes using real label semantics without model calls or Gmail write access', () => {
    expect(categoryForLabels(['SPAM', 'IMPORTANT'], false)).toBe('spam');
    expect(categoryForLabels(['STARRED'], false)).toBe('important');
    expect(categoryForLabels(['CATEGORY_PROMOTIONS'], false)).toBe('promotions');
    expect(categoryForLabels([], true)).toBe('sent');
    expect(categoryForLabels([], false)).toBe('other');
  });
  it('successful Google consent queues the first server-owned sync before the phone redirect', async () => {
    const o = await owner();
    const started = await app.inject({
      method: 'POST',
      url: '/v1/connections/gmail/start',
      headers: { authorization: `Bearer ${o.token}` },
    });
    expect(started.statusCode).toBe(200);
    const state = new URL(
      started.json<{ authorizationUrl: string }>().authorizationUrl,
    ).searchParams.get('state');
    const consent = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      json({
        refresh_token: 'fixture-refresh-after-consent',
        access_token: 'fixture-access-after-consent',
        scope:
          'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.readonly',
        expires_in: 3600,
      }),
    );
    const callback = await app.inject({
      method: 'GET',
      url: `/v1/connections/gmail/callback?state=${encodeURIComponent(state ?? '')}&code=fixture-code`,
    });
    expect(callback.statusCode).toBe(302);
    const c = await db.connection.findUniqueOrThrow({ where: { id: o.c.id } });
    expect(c.syncStatus).toBe('queued');
    expect(c.syncRunId).not.toBeNull();
    expect(await db.sourceDocument.count({ where: { userId: o.user.id } })).toBe(0);
    consent.mockRestore();
    network(0);
    for (let n = 0; n < 3; n++) await runGoogleSyncTick(services);
  });
  it('refreshes Gmail labels on later syncs without duplicating records or reading existing full bodies again', async () => {
    const o = await owner();
    const first = network(1);
    await start(o.token);
    for (let n = 0; n < 3; n++) await runGoogleSyncTick(services);
    first.mockRestore();
    const next = network(1, () => Promise.resolve(json({ labelIds: ['IMPORTANT'], payload: {} })));
    await start(o.token);
    for (let n = 0; n < 3; n++) await runGoogleSyncTick(services);
    expect(
      next.mock.calls
        .filter(([url]) => typeof url === 'string' && url.includes('/messages/'))
        .map(([url]) => url),
    ).toEqual([expect.stringContaining('format=metadata')]);
    const mail = await app.inject({
      method: 'GET',
      url: '/v1/mail?category=important',
      headers: { authorization: `Bearer ${o.token}` },
    });
    expect(mail.json().items).toHaveLength(1);
    expect(mail.json().counts.spam).toBe(0);
    expect(await db.sourceDocument.count({ where: { userId: o.user.id } })).toBe(1);
    expect(await db.inboxItem.count({ where: { recipientUserId: o.user.id } })).toBe(1);
  });
  it('finishes a 2,000-message mailbox after a provider failure at message 200 without losing prior progress', async () => {
    const o = await owner();
    let failed = false;
    network(2000, (id) => {
      if (id === 'fixture-200' && !failed) {
        failed = true;
        return Promise.resolve(json({ error: { errors: [{ reason: 'backendError' }] } }, 503));
      }
      return Promise.resolve(null);
    });
    await start(o.token);
    for (let n = 0; n < 11; n++) await runGoogleSyncTick(services);
    let c = await db.connection.findUniqueOrThrow({ where: { id: o.c.id } });
    expect(c.syncProcessed).toBe(200);
    expect(c.syncTotal).toBe(2000);
    expect(c.syncStatus).toBe('retrying');
    expect(await db.sourceDocument.count({ where: { userId: o.user.id } })).toBe(200);
    await db.connection.update({ where: { id: o.c.id }, data: { syncNextAttemptAt: new Date(0) } });
    const restarted = createServices(db, config);
    for (let n = 0; n < 92; n++) await runGoogleSyncTick(restarted);
    c = await db.connection.findUniqueOrThrow({ where: { id: o.c.id } });
    expect(c.syncStatus).toBe('idle');
    expect(c.syncProcessed).toBe(2000);
    expect(await db.sourceDocument.count({ where: { userId: o.user.id } })).toBe(2000);
    expect(await db.inboxItem.count({ where: { recipientUserId: o.user.id } })).toBe(2000);
    expect(await db.modelCall.count({ where: { userId: o.user.id } })).toBe(0);
  }, 90_000);
});
