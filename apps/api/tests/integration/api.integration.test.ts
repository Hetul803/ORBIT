import { ConversationStatus, createPrismaClient, IntentKind, type PrismaClient } from '@orbit/db';
import { configFromEnvironment, CostCapError, ModelRouter, StubProvider } from '@orbit/llm';
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
  JWT_ACCESS_SECRET: 'integration-access-secret-at-least-32-characters',
  JWT_REFRESH_SECRET: 'integration-refresh-secret-at-least-32-characters',
  FIELD_ENCRYPTION_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
  EXPORT_SIGNING_SECRET: 'integration-export-secret',
  LLM_DEFAULT_PROVIDER: 'stub',
});

describe.runIf(enabled)('ORBIT API integration', () => {
  let db: PrismaClient;
  let app: FastifyInstance;

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
    const requested = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/request',
      payload: { email },
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
      });
      expect(invalid.statusCode).toBe(401);
    }
    const verified = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/verify',
      payload: { email, code, dateOfBirth: '1999-01-01', displayName },
    });
    expect(verified.statusCode).toBe(200);
    return verified.json<{ accessToken: string; refreshToken: string }>();
  };

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
    const { accessToken } = await signIn('demo@orbit.local', 'Demo Founder');
    const decision = await app.inject({
      method: 'POST',
      url: '/v1/introductions/seed-introduction-01/decision',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { decision: 'reveal', fields: ['first_name', 'phone'] },
    });
    expect(decision.statusCode).toBe(200);
    const body = decision.json<{
      revealedAt: string;
      revealedFields: { userA: Record<string, string>; userB: Record<string, string> };
    }>();
    expect(body.revealedAt).toBeTruthy();
    expect(Object.keys(body.revealedFields.userA)).toEqual(['first_name']);
    expect(Object.keys(body.revealedFields.userB)).toEqual(['first_name']);

    const transcript = await app.inject({
      method: 'GET',
      url: '/v1/introductions/seed-introduction-01/transcript',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(transcript.statusCode).toBe(200);
    const serialized = transcript.body;
    expect(serialized).not.toContain('contentHash');
    expect(serialized).not.toContain('demo@orbit.local');
    expect(serialized).not.toContain('+15555550100');
  });

  it('requires two independent reveal decisions and hides a failed-redaction introduction', async () => {
    const tokensA = await signIn('consent-a@orbit.local', 'Ada North', true);
    const tokensB = await signIn('consent-b@orbit.local', 'Bela South');
    const tokenA = tokensA.accessToken;
    const tokenB = tokensB.accessToken;

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
      payload: { email: 'ada@northstar.edu' },
    });
    expect(eduRequest.statusCode).toBe(200);
    const eduVerify = await app.inject({
      method: 'POST',
      url: '/v1/auth/verify-edu',
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        email: 'ada@northstar.edu',
        code: eduRequest.json<{ developmentCode: string }>().developmentCode,
      },
    });
    expect(eduVerify.statusCode).toBe(200);

    const phoneRequest = await app.inject({
      method: 'POST',
      url: '/v1/auth/verify-phone/request',
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { phone: '+13125550177' },
    });
    expect(phoneRequest.statusCode).toBe(200);
    const phoneVerify = await app.inject({
      method: 'POST',
      url: '/v1/auth/verify-phone',
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        phone: '+13125550177',
        code: phoneRequest.json<{ developmentCode: string }>().developmentCode,
      },
    });
    expect(phoneVerify.statusCode).toBe(200);
    const [userA, userB, seedConversation] = await Promise.all([
      db.user.findUniqueOrThrow({ where: { email: 'consent-a@orbit.local' } }),
      db.user.findUniqueOrThrow({ where: { email: 'consent-b@orbit.local' } }),
      db.agentConversation.findUniqueOrThrow({ where: { id: 'seed-conversation-01' } }),
    ]);
    const [agentA, agentB] = await Promise.all([
      db.agent.create({
        data: {
          userId: userA.id,
          name: 'Northstar',
          identitySeed: 'integration-agent-consent-a',
        },
      }),
      db.agent.create({
        data: {
          userId: userB.id,
          name: 'Southstar',
          identitySeed: 'integration-agent-consent-b',
        },
      }),
    ]);
    const conversation = await db.agentConversation.create({
      data: {
        id: 'integration-conversation-consent',
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
        id: 'integration-introduction-consent',
        conversationId: conversation.id,
        userAId: userA.id,
        userBId: userB.id,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });

    const firstDecision = await app.inject({
      method: 'POST',
      url: '/v1/introductions/integration-introduction-consent/decision',
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { decision: 'reveal', fields: ['first_name'] },
    });
    expect(firstDecision.statusCode).toBe(200);
    expect(
      firstDecision.json<{ revealedAt: string | null; revealedFields: object }>(),
    ).toMatchObject({ revealedAt: null, revealedFields: {} });

    const secondDecision = await app.inject({
      method: 'POST',
      url: '/v1/introductions/integration-introduction-consent/decision',
      headers: { authorization: `Bearer ${tokenB}` },
      payload: { decision: 'reveal', fields: ['first_name'] },
    });
    expect(secondDecision.statusCode).toBe(200);
    expect(secondDecision.json<{ revealedAt: string | null }>().revealedAt).toBeTruthy();

    const unsafeConversation = await db.agentConversation.create({
      data: {
        id: 'integration-conversation-redaction-failed',
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
        id: 'integration-introduction-redaction-failed',
        conversationId: unsafeConversation.id,
        userAId: userA.id,
        userBId: userB.id,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    const hidden = await app.inject({
      method: 'GET',
      url: '/v1/introductions/integration-introduction-redaction-failed',
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(hidden.statusCode).toBe(404);
    const list = await app.inject({
      method: 'GET',
      url: '/v1/introductions',
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(list.body).not.toContain('integration-introduction-redaction-failed');
  });

  it('enforces a cost cap from the real database ledger before provider execution', async () => {
    const user = await db.user.findUniqueOrThrow({ where: { email: 'consent-a@orbit.local' } });
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
