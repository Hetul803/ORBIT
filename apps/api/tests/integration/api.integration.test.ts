import {
  ConversationStatus,
  createPrismaClient,
  IntentKind,
  queuePush,
  type PrismaClient,
} from '@orbit/db';
import { configFromEnvironment, CostCapError, ModelRouter, StubProvider } from '@orbit/llm';
import { createHash, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';
import { PrismaCostLedger } from '../../src/ledger.js';

const enabled = process.env.DATABASE_URL?.includes('orbit_test') === true;

const config = loadConfig({
  ...process.env,
  NODE_ENV: 'test',
  OTP_DELIVERY_MODE: 'log',
  ALLOW_DEVELOPMENT_OTP_DISPLAY: 'true',
  JWT_ACCESS_SECRET: 'integration-access-secret-at-least-32-characters',
  JWT_REFRESH_SECRET: 'integration-refresh-secret-at-least-32-characters',
  FIELD_ENCRYPTION_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
  EXPORT_SIGNING_SECRET: 'integration-export-secret',
  LLM_DEFAULT_PROVIDER: 'stub',
});

describe.runIf(enabled)('ORBIT API integration', () => {
  const testRunId = randomUUID().slice(0, 8);
  const consentAEmail = `consent-a-${testRunId}@orbit.local`;
  const consentBEmail = `consent-b-${testRunId}@orbit.local`;
  const testPhone = `+1312${String(Number.parseInt(testRunId.slice(0, 6), 16))
    .padStart(7, '0')
    .slice(-7)}`;
  let db: PrismaClient;
  let app: FastifyInstance;
  let testIpCounter = 10;

  beforeAll(async () => {
    db = createPrismaClient();
    app = await buildApp(db, config);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await db.$disconnect();
  });

  const signIn = async (
    email: string,
    displayName: string,
    exerciseInvalidCode = false,
  ): Promise<{ accessToken: string; refreshToken: string }> => {
    testIpCounter += 1;
    const remoteAddress = `127.0.0.${String(testIpCounter)}`;
    const requested = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/request',
      payload: { email },
      remoteAddress,
    });
    expect(requested.statusCode).toBe(200);
    const code = requested.json<{ developmentCode: string }>().developmentCode;
    if (exerciseInvalidCode) {
      const invalid = await app.inject({
        method: 'POST',
        url: '/v1/auth/otp/verify',
        payload: {
          email,
          code: code === '000000' ? '111111' : '000000',
          dateOfBirth: '1999-01-01',
          displayName,
        },
        remoteAddress,
      });
      expect(invalid.statusCode).toBe(401);
    }
    const verified = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/verify',
      payload: { email, code, dateOfBirth: '1999-01-01', displayName },
      remoteAddress,
    });
    expect(verified.statusCode).toBe(200);
    return verified.json<{ accessToken: string; refreshToken: string }>();
  };

  it('allows browser preflights for every mutation method used by the app', async () => {
    for (const method of ['PUT', 'PATCH', 'DELETE']) {
      const response = await app.inject({
        method: 'OPTIONS',
        url: '/v1/intents/roommate',
        headers: {
          origin: 'http://localhost:8081',
          'access-control-request-method': method,
          'access-control-request-headers': 'authorization,content-type',
        },
      });
      expect(response.statusCode).toBe(204);
      expect(response.headers['access-control-allow-methods']).toContain(method);
    }
  });

  it('hard-blocks a user below 18 and records the age gate attempt', async () => {
    const email = 'underage-test@orbit.local';
    const requested = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/request',
      payload: { email },
    });
    const code = requested.json<{ developmentCode: string }>().developmentCode;
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/verify',
      payload: {
        email,
        code,
        dateOfBirth: new Date().toISOString().slice(0, 10),
        displayName: 'Blocked Test',
      },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('AGE_RESTRICTED');
    expect(await db.ageGateAttempt.count({ where: { allowed: false } })).toBeGreaterThan(0);
  });

  it('rate-limits OTP abuse and does not enumerate whether an account exists', async () => {
    const existing = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/request',
      payload: { email: 'demo@orbit.local' },
      remoteAddress: `127.1.${String(Number.parseInt(testRunId.slice(0, 2), 16) % 250)}.1`,
    });
    const unknown = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/request',
      payload: { email: `unknown-${testRunId}@orbit.local` },
      remoteAddress: `127.1.${String(Number.parseInt(testRunId.slice(2, 4), 16) % 250)}.2`,
    });
    expect(existing.statusCode).toBe(200);
    expect(unknown.statusCode).toBe(200);
    expect(Object.keys(existing.json<Record<string, unknown>>()).toSorted()).toEqual(
      Object.keys(unknown.json<Record<string, unknown>>()).toSorted(),
    );
    expect(existing.json<Record<string, unknown>>()).not.toHaveProperty('accountExists');

    const abusiveIp = `127.2.${String(Number.parseInt(testRunId.slice(4, 6), 16) % 250)}.9`;
    const attempts = [];
    for (let index = 0; index < 6; index += 1) {
      attempts.push(
        await app.inject({
          method: 'POST',
          url: '/v1/auth/otp/request',
          payload: { email: `abuse-${testRunId}@orbit.local` },
          remoteAddress: abusiveIp,
        }),
      );
    }
    expect(attempts.slice(0, 5).every((response) => response.statusCode === 200)).toBe(true);
    expect(attempts[5]?.statusCode).toBe(429);
  });

  it('rate-limits phone OTP and supports honest Gmail and push capability states', async () => {
    const tokens = await signIn(`device-${testRunId}@orbit.local`, 'Device Tester');
    const headers = { authorization: `Bearer ${tokens.accessToken}` };
    const gmail = await app.inject({ method: 'GET', url: '/v1/connections/gmail/status', headers });
    expect(gmail.statusCode).toBe(200);
    expect(gmail.json<{ available: boolean; connected: boolean }>()).toMatchObject({
      available: false,
      connected: false,
    });
    const gmailStart = await app.inject({
      method: 'POST',
      url: '/v1/connections/gmail/start',
      headers,
    });
    expect(gmailStart.statusCode).toBe(503);
    expect(gmailStart.json<{ error: { code: string } }>().error.code).toBe('GMAIL_NOT_CONFIGURED');

    const pushToken = `ExponentPushToken[integration_${testRunId}]`;
    const registered = await app.inject({
      method: 'POST',
      url: '/v1/push/register',
      headers,
      payload: {
        pushToken,
        platform: 'ios',
        preferences: { brief: true, reveal: true, approval: true, watcher: true, safety: true },
      },
    });
    expect(registered.statusCode).toBe(201);
    const deviceId = registered.json<{ id: string }>().id;
    const preferences = await app.inject({
      method: 'PATCH',
      url: `/v1/push/devices/${deviceId}/preferences`,
      headers,
      payload: { brief: false, reveal: true, approval: true, watcher: true, safety: true },
    });
    expect(preferences.statusCode).toBe(200);
    expect(preferences.json<{ preferences: { brief: boolean } }>().preferences.brief).toBe(false);
    const deviceUser = await db.user.findUniqueOrThrow({
      where: { email: `device-${testRunId}@orbit.local` },
    });
    expect(
      await queuePush(db, {
        userId: deviceUser.id,
        eventType: 'brief',
        title: 'Brief',
        body: 'Ready',
        deepLink: 'orbit://today',
      }),
    ).toBe(0);
    expect(
      await queuePush(db, {
        userId: deviceUser.id,
        eventType: 'watcher',
        title: 'Watcher',
        body: 'Matched',
        deepLink: 'orbit://watchers',
      }),
    ).toBe(1);

    const phoneIp = `127.3.${String(Number.parseInt(testRunId.slice(6, 8), 16) % 250)}.8`;
    const phoneAttempts = [];
    for (let index = 0; index < 6; index += 1) {
      phoneAttempts.push(
        await app.inject({
          method: 'POST',
          url: '/v1/auth/verify-phone/request',
          headers,
          payload: { phone: `+1312555${String(2000 + index).padStart(4, '0')}` },
          remoteAddress: phoneIp,
        }),
      );
    }
    expect(phoneAttempts.slice(0, 5).every((response) => response.statusCode === 200)).toBe(true);
    expect(phoneAttempts[5]?.statusCode).toBe(429);
  });

  it('serves the brief and signed export only to an authenticated user', async () => {
    const { accessToken } = await signIn('demo@orbit.local', 'Demo Founder');
    const brief = await app.inject({
      method: 'GET',
      url: '/v1/brief/today',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(brief.statusCode).toBe(200);
    expect(brief.json<{ greeting: string; items: unknown[] }>().greeting).toBeTruthy();
    const archive = await app.inject({
      method: 'GET',
      url: '/v1/me/export',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(archive.statusCode).toBe(200);
    expect(archive.headers['content-type']).toContain('application/zip');
    expect(archive.rawPayload.byteLength).toBeGreaterThan(100);
  });

  it('reveals only mutually consented fields and never exposes raw messages', async () => {
    const tokensA = await signIn(`reveal-a-${testRunId}@orbit.local`, 'Reveal Alpha');
    const tokensB = await signIn(`reveal-b-${testRunId}@orbit.local`, 'Reveal Beta');
    const [userA, userB, seedConversation] = await Promise.all([
      db.user.findUniqueOrThrow({ where: { email: `reveal-a-${testRunId}@orbit.local` } }),
      db.user.findUniqueOrThrow({ where: { email: `reveal-b-${testRunId}@orbit.local` } }),
      db.agentConversation.findUniqueOrThrow({ where: { id: 'seed-conversation-01' } }),
    ]);
    const [agentA, agentB] = await Promise.all([
      db.agent.create({
        data: {
          userId: userA.id,
          name: 'Reveal Alpha Agent',
          identitySeed: `integration-reveal-alpha-${testRunId}`,
        },
      }),
      db.agent.create({
        data: {
          userId: userB.id,
          name: 'Reveal Beta Agent',
          identitySeed: `integration-reveal-beta-${testRunId}`,
        },
      }),
    ]);
    const conversationId = `integration-reveal-conversation-${testRunId}`;
    const introductionId = `integration-reveal-introduction-${testRunId}`;
    await db.agentConversation.create({
      data: {
        id: conversationId,
        intentKind: IntentKind.FRIENDSHIP,
        agentAId: agentA.id,
        agentBId: agentB.id,
        status: ConversationStatus.COMPLETED,
        turnCount: 1,
        verdict: seedConversation.verdict ?? {},
        redactionPassed: true,
        endedAt: new Date(),
        messages: {
          create: {
            id: `integration-reveal-message-${testRunId}`,
            speakerAgentId: agentA.id,
            turnIndex: 0,
            contentHash: createHash('sha256').update('Safe redacted message.').digest('hex'),
            redactedContent: 'Safe redacted message.',
          },
        },
        introduction: {
          create: {
            id: introductionId,
            userAId: userA.id,
            userBId: userB.id,
            expiresAt: new Date(Date.now() + 86_400_000),
          },
        },
      },
    });
    const otherDecision = await app.inject({
      method: 'POST',
      url: `/v1/introductions/${introductionId}/decision`,
      headers: { authorization: `Bearer ${tokensB.accessToken}` },
      payload: { decision: 'reveal', fields: ['first_name'] },
    });
    expect(otherDecision.statusCode).toBe(200);
    const decision = await app.inject({
      method: 'POST',
      url: `/v1/introductions/${introductionId}/decision`,
      headers: { authorization: `Bearer ${tokensA.accessToken}` },
      payload: { decision: 'reveal', fields: ['first_name', 'phone'] },
    });
    expect(decision.statusCode).toBe(200);
    const body = decision.json<{
      revealedAt: string;
      revealedFields: { you: Record<string, string>; other: Record<string, string> };
    }>();
    expect(body.revealedAt).toBeTruthy();
    expect(Object.keys(body.revealedFields.you)).toEqual(['first_name']);
    expect(Object.keys(body.revealedFields.other)).toEqual(['first_name']);

    const transcript = await app.inject({
      method: 'GET',
      url: `/v1/introductions/${introductionId}/transcript`,
      headers: { authorization: `Bearer ${tokensA.accessToken}` },
    });
    expect(transcript.statusCode).toBe(200);
    const serialized = transcript.body;
    expect(serialized).not.toContain('contentHash');
    expect(serialized).not.toContain('demo@orbit.local');
    expect(serialized).not.toContain('+15555550100');
  });

  it('requires two independent reveal decisions and hides a failed-redaction introduction', async () => {
    const tokensA = await signIn(consentAEmail, 'Ada North', true);
    const tokensB = await signIn(consentBEmail, 'Bela South');
    const tokenA = tokensA.accessToken;
    const tokenB = tokensB.accessToken;

    const missingAccessToken = await app.inject({ method: 'GET', url: '/v1/brief/today' });
    expect(missingAccessToken.statusCode).toBe(401);
    const invalidAccessToken = await app.inject({
      method: 'GET',
      url: '/v1/brief/today',
      headers: { authorization: 'Bearer invalid-access-token' },
    });
    expect(invalidAccessToken.statusCode).toBe(401);
    const invalidRefreshToken = await app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken: 'invalid-refresh-token' },
    });
    expect(invalidRefreshToken.statusCode).toBe(401);
    const forbiddenAdminRoute = await app.inject({
      method: 'GET',
      url: '/v1/admin/costs',
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(forbiddenAdminRoute.statusCode).toBe(403);

    const refreshed = await app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken: tokensA.refreshToken },
    });
    expect(refreshed.statusCode).toBe(200);
    expect(refreshed.json<{ refreshToken: string }>().refreshToken).not.toBe(tokensA.refreshToken);

    const eduRequest = await app.inject({
      method: 'POST',
      url: '/v1/auth/verify-edu/request',
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { email: `ada-${testRunId}@northstar.edu` },
    });
    expect(eduRequest.statusCode).toBe(200);
    const eduVerify = await app.inject({
      method: 'POST',
      url: '/v1/auth/verify-edu',
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        email: `ada-${testRunId}@northstar.edu`,
        code: eduRequest.json<{ developmentCode: string }>().developmentCode,
      },
    });
    expect(eduVerify.statusCode).toBe(200);

    const phoneRequest = await app.inject({
      method: 'POST',
      url: '/v1/auth/verify-phone/request',
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { phone: testPhone },
    });
    expect(phoneRequest.statusCode).toBe(200);
    const phoneVerify = await app.inject({
      method: 'POST',
      url: '/v1/auth/verify-phone',
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        phone: testPhone,
        code: phoneRequest.json<{ developmentCode: string }>().developmentCode,
      },
    });
    expect(phoneVerify.statusCode).toBe(200);
    const [userA, userB, seedConversation] = await Promise.all([
      db.user.findUniqueOrThrow({ where: { email: consentAEmail } }),
      db.user.findUniqueOrThrow({ where: { email: consentBEmail } }),
      db.agentConversation.findUniqueOrThrow({ where: { id: 'seed-conversation-01' } }),
    ]);
    const [agentA, agentB] = await Promise.all([
      db.agent.create({
        data: {
          userId: userA.id,
          name: 'Northstar',
          identitySeed: `integration-agent-consent-a-${testRunId}`,
        },
      }),
      db.agent.create({
        data: {
          userId: userB.id,
          name: 'Southstar',
          identitySeed: `integration-agent-consent-b-${testRunId}`,
        },
      }),
    ]);
    const conversation = await db.agentConversation.create({
      data: {
        id: `integration-conversation-consent-${testRunId}`,
        intentKind: IntentKind.FRIENDSHIP,
        agentAId: agentA.id,
        agentBId: agentB.id,
        status: ConversationStatus.COMPLETED,
        turnCount: 0,
        verdict: seedConversation.verdict ?? {},
        redactionPassed: true,
        endedAt: new Date(),
      },
    });
    await db.introduction.create({
      data: {
        id: `integration-introduction-consent-${testRunId}`,
        conversationId: conversation.id,
        userAId: userA.id,
        userBId: userB.id,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });

    const firstDecision = await app.inject({
      method: 'POST',
      url: `/v1/introductions/integration-introduction-consent-${testRunId}/decision`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { decision: 'reveal', fields: ['first_name'] },
    });
    expect(firstDecision.statusCode).toBe(200);
    expect(
      firstDecision.json<{ revealedAt: string | null; revealedFields: object }>(),
    ).toMatchObject({ revealedAt: null, revealedFields: {} });

    const secondDecision = await app.inject({
      method: 'POST',
      url: `/v1/introductions/integration-introduction-consent-${testRunId}/decision`,
      headers: { authorization: `Bearer ${tokenB}` },
      payload: { decision: 'reveal', fields: ['first_name'] },
    });
    expect(secondDecision.statusCode).toBe(200);
    expect(secondDecision.json<{ revealedAt: string | null }>().revealedAt).toBeTruthy();

    const unsafeConversation = await db.agentConversation.create({
      data: {
        id: `integration-conversation-redaction-failed-${testRunId}`,
        intentKind: IntentKind.FRIENDSHIP,
        agentAId: agentA.id,
        agentBId: agentB.id,
        status: ConversationStatus.REDACTION_FAILED,
        verdict: seedConversation.verdict ?? {},
        redactionPassed: false,
        endedAt: new Date(),
      },
    });
    await db.introduction.create({
      data: {
        id: `integration-introduction-redaction-failed-${testRunId}`,
        conversationId: unsafeConversation.id,
        userAId: userA.id,
        userBId: userB.id,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    const hidden = await app.inject({
      method: 'GET',
      url: `/v1/introductions/integration-introduction-redaction-failed-${testRunId}`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(hidden.statusCode).toBe(404);
    const list = await app.inject({
      method: 'GET',
      url: '/v1/introductions',
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(list.body).not.toContain(`integration-introduction-redaction-failed-${testRunId}`);
  });

  it('enforces a cost cap from the real database ledger before provider execution', async () => {
    const user = await db.user.findUniqueOrThrow({ where: { email: consentAEmail } });
    await db.modelCall.create({
      data: {
        userId: user.id,
        task: 'conversation',
        provider: 'stub',
        model: 'stub-conversation-v1',
        tokensIn: 1,
        tokensOut: 1,
        costCents: 35,
        latencyMs: 1,
      },
    });
    const router = new ModelRouter(
      configFromEnvironment({
        ...process.env,
        LLM_DEFAULT_PROVIDER: 'stub',
        USER_DAILY_COST_CAP_CENTS: '35',
      }),
      new Map([['stub', new StubProvider()]]),
      new PrismaCostLedger(db),
    );
    await expect(
      router.complete({
        task: 'conversation',
        messages: [{ role: 'user', content: 'This call must not execute.' }],
        constraints: { maxOutputTokens: 10, temperature: 0 },
        userId: user.id,
      }),
    ).rejects.toBeInstanceOf(CostCapError);
  });
});
