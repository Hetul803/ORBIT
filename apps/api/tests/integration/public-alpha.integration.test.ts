import { randomUUID } from 'node:crypto';
import {
  createPrismaClient,
  deliverModerationAlerts,
  operatorPushReady,
  queueModerationAlerts,
  type PrismaClient,
} from '@orbit/db';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';
import { issueTokens } from '../../src/auth.js';
import { sha256, encryptField } from '../../src/crypto.js';
import { alphaOperationsReady } from '../../src/alpha-operations.js';

const databaseUrl = process.env.ALPHA_TEST_DATABASE_URL;
const enabled = databaseUrl?.includes('orbit_test') === true;
const config = loadConfig({
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL: databaseUrl,
  OTP_DELIVERY_MODE: 'log',
  ALLOW_DEVELOPMENT_OTP_DISPLAY: 'true',
  ACCOUNT_CREATION_PER_IP_PER_DAY: '1000',
  MODERATION_OPERATOR_EMAILS: 'operator@alpha.orbit.test',
  RESEND_API_KEY: 'test-resend-only',
  RESEND_FROM_EMAIL: 'ORBIT <safety@alpha.orbit.test>',
  JWT_ACCESS_SECRET: 'alpha-test-access-secret-at-least-32-characters',
  JWT_REFRESH_SECRET: 'alpha-test-refresh-secret-at-least-32-characters',
});

describe.runIf(enabled)('public-alpha safety (isolated database, mocked external delivery)', () => {
  let db: PrismaClient;
  let app: FastifyInstance;
  let operator: { id: string; token: string };
  beforeAll(async () => {
    db = createPrismaClient(databaseUrl);
    // This suite owns its dedicated, empty database; never erase existing application/test data.
    if ((await db.user.count()) !== 0)
      throw new Error('ALPHA_TEST_DATABASE_URL must point to a new, empty orbit_test database');
    app = await buildApp(db, config);
    await app.ready();
    const user = await db.user.create({
      data: {
        email: 'operator@alpha.orbit.test',
        dateOfBirth: new Date('1990-01-01'),
        displayName: 'Test operator',
        role: 'ADMIN',
      },
    });
    operator = { id: user.id, token: (await issueTokens(db, config, user)).accessToken };
    await db.device.create({
      data: {
        userId: user.id,
        platform: 'IOS',
        pushToken: 'ExponentPushToken[alpha-test-device]',
        preferences: { safety: false },
      },
    });
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    await app.close();
    await db.$disconnect();
  });

  const user = async () => {
    const id = randomUUID();
    const created = await db.user.create({
      data: {
        email: `${id}@alpha.orbit.test`,
        displayName: 'Private fixture identity',
        dateOfBirth: new Date('1990-01-01'),
        emailVerifiedAt: new Date(),
        agent: { create: { name: 'Test agent', identitySeed: id } },
      },
      include: { agent: true },
    });
    return { ...created, token: (await issueTokens(db, config, created)).accessToken };
  };
  const pair = async () => {
    const [a, b] = await Promise.all([user(), user()]);
    if (a.agent === null || b.agent === null) throw new Error('Test agents were not created');
    const conversation = await db.agentConversation.create({
      data: {
        intentKind: 'FRIENDSHIP',
        agentAId: a.agent.id,
        agentBId: b.agent.id,
        status: 'COMPLETED',
        redactionPassed: true,
        verdict: { score: 80, reason: 'Shared interests with clear boundaries.' },
        messages: {
          create: {
            speakerAgentId: a.agent.id,
            turnIndex: 0,
            contentHash: sha256('A safe redacted concern.'),
            redactedContent: 'A safe redacted concern.',
          },
        },
      },
    });
    const introduction = await db.introduction.create({
      data: {
        conversationId: conversation.id,
        userAId: a.id,
        userBId: b.id,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    return { a, b, conversation, introduction };
  };
  const inject = (
    token: string,
    method: 'GET' | 'POST' | 'DELETE',
    url: string,
    payload?: Record<string, unknown>,
  ) =>
    app.inject({
      method,
      url,
      headers: { authorization: `Bearer ${token}` },
      ...(payload === undefined ? {} : { payload }),
    });
  const providers = (check?: () => Promise<void>) =>
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      await check?.();
      const body = JSON.parse(typeof init?.body === 'string' ? init.body : '') as unknown;
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('resend.com'))
        return new Response(JSON.stringify({ id: 'test-email-receipt' }), { status: 200 });
      const count = Array.isArray(body) ? body.length : 1;
      return new Response(
        JSON.stringify({
          data: Array.from({ length: count }, () => ({ status: 'ok', id: 'test-push-ticket' })),
        }),
        { status: 200 },
      );
    });

  it('commits suppression before immediately requesting both operator channels, without leaking report content', async () => {
    const p = await pair();
    const plan = await db.safetyPlan.create({
      data: {
        userId: p.a.id,
        introductionId: p.introduction.id,
        placeName: 'Public library',
        meetAt: new Date(),
        checkInDueAt: new Date(),
        shareToken: randomUUID(),
      },
    });
    const device = await db.device.create({
      data: { userId: p.a.id, platform: 'IOS', pushToken: `ExponentPushToken[${randomUUID()}]` },
    });
    const push = await db.pushDelivery.create({
      data: {
        userId: p.a.id,
        deviceId: device.id,
        eventType: 'introduction',
        title: 'An introduction',
        body: 'Open ORBIT',
        deepLink: `orbit://introduction/${p.introduction.id}`,
      },
    });
    const delivery = providers(async () => {
      expect(
        (await db.agentConversation.findUniqueOrThrow({ where: { id: p.conversation.id } }))
          .suppressedAt,
      ).not.toBeNull();
    });
    const result = await inject(p.a.token, 'POST', '/v1/reports', {
      subjectUserId: p.b.id,
      conversationId: p.conversation.id,
      category: 'other',
      detail: 'Private sensitive report contents.',
    });
    expect(result.statusCode).toBe(201);
    expect(result.json().operatorAlerts).toEqual({
      configured: true,
      providerAccepted: 2,
      pendingRetry: 0,
    });
    expect(delivery).toHaveBeenCalledTimes(2);
    expect(
      (await app.inject({ method: 'GET', url: `/v1/safety-plans/share/${plan.shareToken}` }))
        .statusCode,
    ).toBe(404);
    expect((await db.pushDelivery.findUniqueOrThrow({ where: { id: push.id } })).status).toBe(
      'CANCELLED',
    );
    for (const [, init] of delivery.mock.calls) {
      expect(init?.body).not.toContain('Private sensitive report contents');
      expect(init?.body).not.toContain('Private fixture identity');
    }
    for (const member of [p.a, p.b]) {
      expect(
        (await inject(member.token, 'GET', `/v1/introductions/${p.introduction.id}`)).statusCode,
      ).toBe(404);
      expect(
        (await inject(member.token, 'GET', `/v1/introductions/${p.introduction.id}/transcript`))
          .statusCode,
      ).toBe(404);
      expect(
        (
          await inject(member.token, 'POST', `/v1/introductions/${p.introduction.id}/decision`, {
            decision: 'reveal',
            fields: ['first_name'],
          })
        ).statusCode,
      ).toBe(404);
      expect((await inject(member.token, 'GET', '/v1/introductions')).json()).toEqual([]);
    }
    const id = result.json().id as string;
    expect((await inject(p.a.token, 'GET', `/v1/admin/reports/${id}`)).statusCode).toBe(403);
    const review = await inject(operator.token, 'GET', `/v1/admin/reports/${id}`);
    expect(review.statusCode).toBe(200);
    expect(review.json().messages[0].text).toBe('A safe redacted concern.');
    expect(
      (
        await inject(operator.token, 'POST', `/v1/admin/reports/${id}/action`, {
          action: 'acknowledge',
          reason: 'Taking ownership of review.',
        })
      ).json().status,
    ).toBe('reviewing');
    expect((await db.report.findUniqueOrThrow({ where: { id } })).acknowledgedAt).not.toBeNull();
    await inject(operator.token, 'POST', `/v1/admin/reports/${id}/action`, {
      action: 'first_action',
      reason: 'Preserved suppression and reviewed the safety concern; investigation continues.',
    });
    const continued = await db.report.findUniqueOrThrow({ where: { id } });
    expect(continued.firstActionAt).not.toBeNull();
    expect(continued.resolvedAt).toBeNull();
    expect(continued.status).toBe('REVIEWING');
    await inject(operator.token, 'POST', `/v1/admin/reports/${id}/action`, {
      action: 'dismiss',
      reason: 'Review complete; preserve suppression.',
    });
    expect(
      (await inject(p.b.token, 'GET', `/v1/introductions/${p.introduction.id}`)).statusCode,
    ).toBe(404);
    expect(
      (
        await inject(operator.token, 'POST', `/v1/admin/reports/${id}/action`, {
          action: 'acknowledge',
          reason: 'Do not reopen this closed report.',
        })
      ).statusCode,
    ).toBe(409);
  });

  it('retains both failed alerts, retries without losing the report, and deduplicates concurrent delivery', async () => {
    const p = await pair();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new Error('provider response containing private data must never be stored'),
    );
    const report = await inject(p.a.token, 'POST', '/v1/reports', {
      subjectUserId: p.b.id,
      conversationId: p.conversation.id,
      category: 'other',
      detail: 'Needs review.',
    });
    const id = report.json().id as string;
    expect(report.statusCode).toBe(201);
    expect(report.json().operatorAlerts.pendingRetry).toBe(2);
    const alerts = await db.moderationAlert.findMany({ where: { reportId: id } });
    expect(
      alerts.every(
        (alert) => alert.status === 'RETRY' && !alert.lastError?.includes('private data'),
      ),
    ).toBe(true);
    vi.restoreAllMocks();
    const delivery = providers();
    await db.moderationAlert.updateMany({
      where: { reportId: id },
      data: { nextAttemptAt: new Date(0) },
    });
    const retry = await Promise.all([
      deliverModerationAlerts(db, config, { reportId: id }),
      deliverModerationAlerts(db, config, { reportId: id }),
    ]);
    expect(retry.reduce((sum, result) => sum + result.accepted, 0)).toBe(2);
    expect(delivery).toHaveBeenCalledTimes(2);
    const duplicate = await inject(p.a.token, 'POST', '/v1/reports', {
      subjectUserId: p.b.id,
      conversationId: p.conversation.id,
      category: 'other',
      detail: 'Needs review.',
    });
    expect(duplicate.json().id).toBe(id);
    expect(await db.moderationAlert.count({ where: { reportId: id } })).toBe(2);
    expect(delivery).toHaveBeenCalledTimes(2);
  });

  it('rejects a report naming a different conversation participant', async () => {
    const p = await pair();
    const stranger = await user();
    expect(
      (
        await inject(p.a.token, 'POST', '/v1/reports', {
          subjectUserId: stranger.id,
          conversationId: p.conversation.id,
          category: 'other',
          detail: 'Invalid association.',
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (await db.agentConversation.findUniqueOrThrow({ where: { id: p.conversation.id } }))
        .suppressedAt,
    ).toBeNull();
  });

  it('blocks both directions instantly, cancels pending contact, hides stale briefs, and forbids soft-unblocking', async () => {
    const p = await pair();
    await db.introduction.update({
      where: { id: p.introduction.id },
      data: { revealedAt: new Date() },
    });
    const plan = await db.safetyPlan.create({
      data: {
        userId: p.a.id,
        introductionId: p.introduction.id,
        placeName: 'Public library',
        meetAt: new Date(),
        checkInDueAt: new Date(),
        shareToken: randomUUID(),
        sharedWithContact: true,
      },
    });
    const forDate = new Date();
    forDate.setUTCHours(0, 0, 0, 0);
    await db.dailyBrief.create({
      data: {
        userId: p.b.id,
        forDate,
        payload: {
          items: [
            {
              id: p.introduction.id,
              kind: 'introduction',
              href: `/introduction/${p.introduction.id}`,
              title: 'Old contact',
            },
          ],
        },
      },
    });
    const inbox = await db.inboxItem.create({
      data: {
        recipientUserId: p.b.id,
        senderUserId: p.a.id,
        kind: 'skill',
        subject: 'Shared skill',
        body: 'Private peer item',
        triage: 'ESCALATED',
      },
    });
    const blocked = await inject(p.a.token, 'POST', '/v1/blocks', {
      userId: p.b.id,
      reason: 'A permanent safety choice.',
    });
    expect(blocked.statusCode).toBe(201);
    expect(blocked.json()).toMatchObject({ bidirectional: true, permanent: true });
    for (const member of [p.a, p.b])
      expect(
        (await inject(member.token, 'GET', `/v1/introductions/${p.introduction.id}/transcript`))
          .statusCode,
      ).toBe(404);
    expect((await inject(p.b.token, 'GET', '/v1/inbox')).json()).toEqual([]);
    expect(
      (
        await inject(p.b.token, 'POST', `/v1/inbox/${inbox.id}/approve`, {
          editedReply: 'Approved reply.',
        })
      ).statusCode,
    ).toBe(404);
    const brief = (await inject(p.b.token, 'GET', '/v1/brief/today')).json();
    expect(JSON.stringify(brief)).not.toContain(p.introduction.id);
    expect(
      (await app.inject({ method: 'GET', url: `/v1/safety-plans/share/${plan.shareToken}` }))
        .statusCode,
    ).toBe(404);
    await expect(
      db.block.update({ where: { id: blocked.json().id }, data: { deletedAt: new Date() } }),
    ).rejects.toThrow();
    expect(
      (await inject(p.b.token, 'DELETE', `/v1/blocks/${blocked.json<{ id: string }>().id}`))
        .statusCode,
    ).toBe(404);
  });

  it('rejects existing access tokens immediately after a moderator suspends an account', async () => {
    const p = await pair();
    providers();
    const report = await inject(p.a.token, 'POST', '/v1/reports', {
      subjectUserId: p.b.id,
      category: 'other',
      detail: 'Suspension review.',
    });
    await inject(
      operator.token,
      'POST',
      `/v1/admin/reports/${report.json<{ id: string }>().id}/action`,
      {
        action: 'suspend',
        reason: 'Confirmed safety violation.',
      },
    );
    expect((await inject(p.b.token, 'GET', '/v1/me')).statusCode).toBe(403);
    expect(await db.refreshToken.count({ where: { userId: p.b.id, revokedAt: null } })).toBe(0);
  });

  it('logs expiry and visible reconnect exposure as distinct events, deduplicated per episode', async () => {
    const owner = await user();
    const connection = await db.connection.create({
      data: {
        userId: owner.id,
        provider: 'GOOGLE',
        status: 'ACTIVE',
        encryptedTokens: encryptField(
          JSON.stringify({ refreshToken: 'test-google-refresh' }),
          config.FIELD_ENCRYPTION_KEY,
        ),
        scopes: [],
      },
    });
    const googleApp = await buildApp(db, {
      ...config,
      GMAIL_INTEGRATION_ENABLED: 'true',
      GOOGLE_OAUTH_CLIENT_ID: 'test-client',
      GOOGLE_OAUTH_CLIENT_SECRET: 'test-secret',
      GOOGLE_CLOUD_PROJECT_ID: 'new-orbit-alpha-test',
      GOOGLE_OAUTH_REDIRECT_URI: 'https://api.orbit.test/v1/connections/gmail/callback',
    });
    await googleApp.ready();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 }),
    );
    for (let n = 0; n < 2; n++)
      expect(
        (
          await googleApp.inject({
            method: 'POST',
            url: '/v1/connections/gmail/sync',
            headers: { authorization: `Bearer ${owner.token}` },
          })
        ).statusCode,
      ).toBe(409);
    const expired = await db.connection.findUniqueOrThrow({ where: { id: connection.id } });
    expect(expired.status).toBe('EXPIRED');
    expect(expired.expiredAt).not.toBeNull();
    const expiredAt = expired.expiredAt;
    if (expiredAt === null) throw new Error('Expiry episode was not recorded');
    expect(
      await db.activityLog.count({ where: { userId: owner.id, action: 'google.token_expired' } }),
    ).toBe(1);
    const prompts = await Promise.all(
      ['catch', 'connections'].map((source) =>
        inject(owner.token, 'POST', '/v1/connections/gmail/reconnect-prompt', {
          source,
          expiredAt: expiredAt.toISOString(),
        }),
      ),
    );
    expect(prompts.filter((result) => result.json().recorded === true)).toHaveLength(1);
    expect(
      await db.activityLog.count({
        where: { userId: owner.id, action: 'google.reconnect_prompt_shown' },
      }),
    ).toBe(1);
    expect(
      await db.activityLog.count({ where: { userId: owner.id, action: 'auth.signed_in' } }),
    ).toBe(0);
    await db.connection.update({
      where: { id: connection.id },
      data: { expiredAt: new Date(Date.now() + 1000), reconnectPromptedAt: null },
    });
    expect(
      (
        await inject(owner.token, 'POST', '/v1/connections/gmail/reconnect-prompt', {
          source: 'catch',
          expiredAt: expiredAt.toISOString(),
        })
      ).json().recorded,
    ).toBe(false);
    await googleApp.close();
  });

  it('keeps public admission closed without confirmed staffing, native operator devices, or timely acknowledgement', async () => {
    const production = {
      ...config,
      NODE_ENV: 'production' as const,
      PUBLIC_ALPHA_SIGNUPS_OPEN: 'true' as const,
      MODERATION_COVERAGE_CONFIRMED: 'true' as const,
    };
    expect(await operatorPushReady(db, ['operator@alpha.orbit.test'])).toBe(true);
    expect(
      await alphaOperationsReady(db, { ...production, MODERATION_COVERAGE_CONFIRMED: 'false' }),
    ).toBe(false);
    expect(
      await alphaOperationsReady(db, {
        ...production,
        MODERATION_OPERATOR_EMAILS: 'not-staff@alpha.orbit.test',
      }),
    ).toBe(false);
    // Earlier cases intentionally left open reports, all still inside the response window.
    expect(await alphaOperationsReady(db, production)).toBe(true);
    const p = await pair();
    const overdue = await db.report.create({
      data: {
        reporterUserId: p.a.id,
        subjectUserId: p.b.id,
        category: 'other',
        detail: 'Overdue fixture',
        createdAt: new Date(Date.now() - 16 * 60_000),
      },
    });
    expect(await alphaOperationsReady(db, production)).toBe(false);
    await db.report.update({
      where: { id: overdue.id },
      data: { status: 'DISMISSED', acknowledgedAt: new Date(), resolvedAt: new Date() },
    });
    expect(await alphaOperationsReady(db, production)).toBe(true);
    await db.$transaction((tx) =>
      queueModerationAlerts(tx, overdue.id, ['operator@alpha.orbit.test']),
    );
    await db.moderationAlert.updateMany({
      where: { reportId: overdue.id },
      data: { createdAt: new Date(Date.now() - 61_000) },
    });
    expect(await alphaOperationsReady(db, production)).toBe(false);
  });

  it('denies Google access to unlisted public testers and exposes the restriction honestly', async () => {
    const owner = await user();
    const restrictedApp = await buildApp(db, {
      ...config,
      NODE_ENV: 'production',
      GMAIL_INTEGRATION_ENABLED: 'true',
      GOOGLE_CLOUD_PROJECT_ID: 'fresh-orbit-test-project',
      GOOGLE_OAUTH_CLIENT_ID: 'orbit-only-client',
      GOOGLE_OAUTH_CLIENT_SECRET: 'test-server-only',
      GOOGLE_OAUTH_REDIRECT_URI: 'https://api.orbit.test/v1/connections/gmail/callback',
      GOOGLE_TEST_USER_EMAILS: 'operator@alpha.orbit.test',
    });
    await restrictedApp.ready();
    try {
      const status = await restrictedApp.inject({
        method: 'GET',
        url: '/v1/connections/gmail/status',
        headers: { authorization: `Bearer ${owner.token}` },
      });
      expect(status.statusCode).toBe(200);
      expect(status.json().available).toBe(false);
      expect(JSON.stringify(status.json())).toContain('verification');
      for (const route of ['start', 'sync']) {
        const result = await restrictedApp.inject({
          method: 'POST',
          url: `/v1/connections/gmail/${route}`,
          headers: { authorization: `Bearer ${owner.token}` },
        });
        expect(result.statusCode).toBe(403);
        expect(result.json().error.code).toBe('GOOGLE_VERIFICATION_PENDING');
      }
      const founderStart = await restrictedApp.inject({
        method: 'POST',
        url: '/v1/connections/gmail/start',
        headers: { authorization: `Bearer ${operator.token}` },
      });
      expect(founderStart.statusCode).toBe(200);
    } finally {
      await restrictedApp.close();
    }
  });

  it('atomically admits only the hundredth account under concurrency and provides a verified, non-authenticating waitlist', async () => {
    const count = await db.user.count({ where: { deletedAt: null } });
    await db.user.createMany({
      data: Array.from({ length: 99 - count }, (_, n) => ({
        email: `capacity-${String(n)}@alpha.orbit.test`,
        displayName: 'Capacity fixture',
        dateOfBirth: new Date('1990-01-01'),
      })),
    });
    const verify = async (email: string, remoteAddress: string) => {
      const request = await app.inject({
        method: 'POST',
        url: '/v1/auth/otp/request',
        remoteAddress,
        payload: { email },
      });
      expect(request.statusCode).toBe(200);
      return app.inject({
        method: 'POST',
        url: '/v1/auth/otp/verify',
        remoteAddress,
        payload: {
          email,
          code: request.json().developmentCode,
          dateOfBirth: '1990-01-01',
          displayName: 'New alpha member',
        },
      });
    };
    const results = await Promise.all([
      verify('last-slot-a@alpha.orbit.test', '127.0.0.81'),
      verify('last-slot-b@alpha.orbit.test', '127.0.0.82'),
    ]);
    expect(results.map((result) => result.statusCode).sort()).toEqual([200, 503]);
    expect(await db.user.count({ where: { deletedAt: null } })).toBe(100);
    const full = results.find((result) => result.statusCode === 503);
    if (full === undefined) throw new Error('Expected one full-capacity response');
    expect(full.json().error.code).toBe('EARLY_ACCESS_FULL');
    const verificationToken = full.json().error.details.waitlistToken as string;
    expect((await inject(verificationToken, 'GET', '/v1/me')).statusCode).toBe(401);
    const join = await app.inject({
      method: 'POST',
      url: '/v1/waitlist',
      payload: { verificationToken },
    });
    expect(join.statusCode).toBe(200);
    await app.inject({ method: 'POST', url: '/v1/waitlist', payload: { verificationToken } });
    expect(await db.waitlistEntry.count()).toBe(1);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/waitlist',
          payload: { verificationToken: 'forged-token-not-a-valid-signed-jwt' },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (await app.inject({ method: 'DELETE', url: '/v1/waitlist', payload: { verificationToken } }))
        .statusCode,
    ).toBe(200);
    expect(await db.waitlistEntry.count()).toBe(0);
    expect((await verify('operator@alpha.orbit.test', '127.0.0.83')).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/v1/alpha/status' })).json()).toMatchObject({
      capacity: 100,
      full: true,
      acceptingNewAccounts: false,
      reason: 'capacity',
    });
  });
});
