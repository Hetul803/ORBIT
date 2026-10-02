import { randomBytes } from 'node:crypto';

import { ConnectionProvider, ConnectionStatus, InboxTriage, queuePush } from '@orbit/db';
import type { FastifyInstance } from 'fastify';

import { requireAuth } from '../auth.js';
import { decryptField, encryptField, sha256 } from '../crypto.js';
import { ApiError } from '../errors.js';
import type { Services } from '../services.js';
import { asRecord, logActivity } from './helpers.js';

const gmailReadonlyScope = 'https://www.googleapis.com/auth/gmail.readonly';

interface StoredTokens {
  refreshToken: string;
  accessToken?: string;
  expiresAt?: string;
}

const available = (services: Services): boolean =>
  services.config.GMAIL_INTEGRATION_ENABLED === 'true' &&
  services.config.GOOGLE_OAUTH_CLIENT_ID !== undefined &&
  services.config.GOOGLE_OAUTH_CLIENT_SECRET !== undefined &&
  services.config.GOOGLE_OAUTH_REDIRECT_URI !== undefined;

const requireAvailable = (services: Services): void => {
  if (!available(services)) {
    throw new ApiError(
      503,
      'GMAIL_NOT_CONFIGURED',
      'Gmail is unavailable until the operator configures and enables Google OAuth.',
    );
  }
};

const tokenRequest = async (
  services: Services,
  parameters: Record<string, string>,
): Promise<Record<string, unknown>> => {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: services.config.GOOGLE_OAUTH_CLIENT_ID ?? '',
      client_secret: services.config.GOOGLE_OAUTH_CLIENT_SECRET ?? '',
      ...parameters,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const body: unknown = await response.json();
  if (!response.ok)
    throw new ApiError(502, 'GOOGLE_OAUTH_FAILED', 'Google did not complete authorization.');
  return asRecord(body);
};

const accessTokenFor = async (
  services: Services,
  connection: { id: string; encryptedTokens: string },
): Promise<string> => {
  const stored = JSON.parse(
    decryptField(connection.encryptedTokens, services.config.FIELD_ENCRYPTION_KEY),
  ) as StoredTokens;
  const refreshed = await tokenRequest(services, {
    grant_type: 'refresh_token',
    refresh_token: stored.refreshToken,
  });
  if (typeof refreshed.access_token !== 'string') {
    throw new ApiError(502, 'GOOGLE_TOKEN_FAILED', 'Google did not return an access token.');
  }
  const next: StoredTokens = {
    refreshToken: stored.refreshToken,
    accessToken: refreshed.access_token,
    expiresAt: new Date(Date.now() + Number(refreshed.expires_in ?? 3_600) * 1_000).toISOString(),
  };
  await services.db.connection.update({
    where: { id: connection.id },
    data: {
      encryptedTokens: encryptField(JSON.stringify(next), services.config.FIELD_ENCRYPTION_KEY),
      status: ConnectionStatus.ACTIVE,
    },
  });
  return refreshed.access_token;
};

const gmailJson = async (path: string, accessToken: string): Promise<Record<string, unknown>> => {
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
  });
  const body: unknown = await response.json();
  if (!response.ok)
    throw new ApiError(502, 'GMAIL_READ_FAILED', 'Gmail could not be read right now.');
  return asRecord(body);
};

const decodePart = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  try {
    return Buffer.from(value, 'base64url').toString('utf8').slice(0, 8_000);
  } catch {
    return '';
  }
};

const plainBody = (payload: Record<string, unknown>): string => {
  const body = asRecord(payload.body);
  const direct = decodePart(body.data);
  if (direct.length > 0 && payload.mimeType === 'text/plain') return direct;
  const parts = Array.isArray(payload.parts) ? payload.parts : [];
  for (const part of parts) {
    const parsed = asRecord(part);
    const nested = plainBody(parsed);
    if (nested.length > 0) return nested;
  }
  return direct;
};

const headerValue = (payload: Record<string, unknown>, name: string): string => {
  const headers = Array.isArray(payload.headers) ? payload.headers : [];
  for (const header of headers) {
    const record = asRecord(header);
    const headerName = typeof record.name === 'string' ? record.name : '';
    if (headerName.toLowerCase() === name.toLowerCase() && typeof record.value === 'string') {
      return record.value.slice(0, 500);
    }
  }
  return '';
};

const ruleMatches = (matchOn: Record<string, unknown>, from: string, subject: string): boolean => {
  const fromNeedle = typeof matchOn.from === 'string' ? matchOn.from.toLowerCase() : '';
  const subjectNeedle =
    typeof matchOn.subjectIncludes === 'string' ? matchOn.subjectIncludes.toLowerCase() : '';
  return (
    (fromNeedle.length === 0 || from.toLowerCase().includes(fromNeedle)) &&
    (subjectNeedle.length === 0 || subject.toLowerCase().includes(subjectNeedle))
  );
};

export const registerGmailRoutes = (app: FastifyInstance, services: Services): void => {
  app.get('/v1/connections/gmail/status', async (request) => {
    const auth = await requireAuth(request, services.config);
    const connection = await services.db.connection.findUnique({
      where: { userId_provider: { userId: auth.id, provider: ConnectionProvider.GOOGLE } },
      select: { id: true, status: true, scopes: true, lastSyncedAt: true, deletedAt: true },
    });
    return {
      available: available(services),
      unavailableReason: available(services)
        ? null
        : 'The operator has not enabled a verified Google OAuth application.',
      connected:
        connection !== null && connection.deletedAt === null && connection.status === 'ACTIVE',
      connection:
        connection?.deletedAt === null
          ? {
              id: connection.id,
              status: connection.status.toLowerCase(),
              scopes: connection.scopes,
              lastSyncedAt: connection.lastSyncedAt?.toISOString() ?? null,
            }
          : null,
    };
  });

  app.post('/v1/connections/gmail/start', async (request) => {
    const auth = await requireAuth(request, services.config);
    requireAvailable(services);
    const state = randomBytes(32).toString('base64url');
    await services.db.otpChallenge.create({
      data: {
        userId: auth.id,
        email: 'oauth:gmail',
        codeHash: sha256(state),
        purpose: 'gmail_oauth',
        expiresAt: new Date(Date.now() + 10 * 60_000),
        ipHash: sha256(request.ip),
      },
    });
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({
      client_id: services.config.GOOGLE_OAUTH_CLIENT_ID ?? '',
      redirect_uri: services.config.GOOGLE_OAUTH_REDIRECT_URI ?? '',
      response_type: 'code',
      scope: gmailReadonlyScope,
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'false',
      state,
    }).toString();
    return { authorizationUrl: url.toString(), expiresIn: 600 };
  });

  app.get('/v1/connections/gmail/callback', async (request, reply) => {
    requireAvailable(services);
    const query = request.query as Record<string, unknown>;
    if (typeof query.code !== 'string' || typeof query.state !== 'string') {
      throw new ApiError(400, 'OAUTH_CALLBACK_INVALID', 'Google authorization was incomplete.');
    }
    const challenge = await services.db.otpChallenge.findFirst({
      where: {
        email: 'oauth:gmail',
        purpose: 'gmail_oauth',
        codeHash: sha256(query.state),
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (challenge?.userId === null || challenge?.userId === undefined) {
      throw new ApiError(
        401,
        'OAUTH_STATE_INVALID',
        'The Google authorization state expired or was already used.',
      );
    }
    const token = await tokenRequest(services, {
      grant_type: 'authorization_code',
      code: query.code,
      redirect_uri: services.config.GOOGLE_OAUTH_REDIRECT_URI ?? '',
    });
    if (typeof token.refresh_token !== 'string' || typeof token.access_token !== 'string') {
      throw new ApiError(
        502,
        'GOOGLE_REFRESH_TOKEN_MISSING',
        'Google did not grant durable read access.',
      );
    }
    const grantedScopes = typeof token.scope === 'string' ? token.scope.split(' ') : [];
    if (!grantedScopes.includes(gmailReadonlyScope)) {
      throw new ApiError(403, 'GMAIL_SCOPE_MISSING', 'Gmail read-only permission was not granted.');
    }
    const stored: StoredTokens = {
      refreshToken: token.refresh_token,
      accessToken: token.access_token,
      expiresAt: new Date(Date.now() + Number(token.expires_in ?? 3_600) * 1_000).toISOString(),
    };
    const encryptedTokens = encryptField(
      JSON.stringify(stored),
      services.config.FIELD_ENCRYPTION_KEY,
    );
    const connection = await services.db.connection.upsert({
      where: { userId_provider: { userId: challenge.userId, provider: ConnectionProvider.GOOGLE } },
      update: {
        encryptedTokens,
        scopes: [gmailReadonlyScope],
        status: ConnectionStatus.ACTIVE,
        deletedAt: null,
      },
      create: {
        userId: challenge.userId,
        provider: ConnectionProvider.GOOGLE,
        encryptedTokens,
        scopes: [gmailReadonlyScope],
      },
    });
    await services.db.$transaction([
      services.db.otpChallenge.update({
        where: { id: challenge.id },
        data: { consumedAt: new Date() },
      }),
      services.db.activityLog.create({
        data: {
          userId: challenge.userId,
          actorType: 'USER',
          action: 'connection.gmail_connected',
          targetType: 'Connection',
          targetId: connection.id,
          payload: { scopes: [gmailReadonlyScope] },
        },
      }),
    ]);
    return reply.redirect(`${services.config.ORBIT_MOBILE_REDIRECT_URL}?gmail=connected`);
  });

  app.post('/v1/connections/gmail/sync', async (request) => {
    const auth = await requireAuth(request, services.config);
    requireAvailable(services);
    const connection = await services.db.connection.findFirst({
      where: {
        userId: auth.id,
        provider: ConnectionProvider.GOOGLE,
        status: ConnectionStatus.ACTIVE,
        deletedAt: null,
      },
    });
    if (connection === null)
      throw new ApiError(409, 'GMAIL_NOT_CONNECTED', 'Connect Gmail before syncing.');
    const accessToken = await accessTokenFor(services, connection);
    const list = await gmailJson('/messages?maxResults=10&q=newer_than%3A30d', accessToken);
    const messages = Array.isArray(list.messages) ? list.messages : [];
    const rules = await services.db.screeningRule.findMany({
      where: { userId: auth.id, deletedAt: null },
      orderBy: { priority: 'asc' },
    });
    let imported = 0;
    for (const summary of messages.slice(0, 10)) {
      const messageId = asRecord(summary).id;
      if (typeof messageId !== 'string') continue;
      const kind = `gmail:${messageId}`;
      const existing = await services.db.inboxItem.findFirst({
        where: { recipientUserId: auth.id, kind },
      });
      if (existing !== null) continue;
      const message = await gmailJson(
        `/messages/${encodeURIComponent(messageId)}?format=full`,
        accessToken,
      );
      const payload = asRecord(message.payload);
      const subject = headerValue(payload, 'Subject') || '(No subject)';
      const from = headerValue(payload, 'From');
      const snippet = typeof message.snippet === 'string' ? message.snippet : '';
      const body = (plainBody(payload) || snippet).slice(0, 8_000);
      const rule = rules.find((candidate) =>
        ruleMatches(asRecord(candidate.matchOn), from, subject),
      );
      const action = rule?.action ?? 'HOLD';
      const triage =
        action === 'DECLINE'
          ? InboxTriage.AUTO_DECLINED
          : action === 'ALLOW'
            ? InboxTriage.ESCALATED
            : InboxTriage.HELD;
      let draft: string | null = null;
      if (triage !== InboxTriage.AUTO_DECLINED && services.config.LLM_DEFAULT_PROVIDER !== 'stub') {
        const completion = await services.llm.complete({
          task: 'draft',
          userId: auth.id,
          messages: [
            {
              role: 'system',
              content:
                'Draft a concise email reply. Do not claim it was sent and do not invent facts.',
            },
            {
              role: 'user',
              content: `From: ${from}\nSubject: ${subject}\nBody:\n${body.slice(0, 6_000)}`,
            },
          ],
          constraints: { maxOutputTokens: 400, temperature: 0.2 },
          requestId: request.id,
        });
        draft = completion.text;
      }
      await services.db.inboxItem.create({
        data: {
          recipientUserId: auth.id,
          kind,
          subject,
          body: `From: ${from}\n\n${body}`,
          triage,
          agentReply: draft,
        },
      });
      if (triage === InboxTriage.ESCALATED) {
        await queuePush(services.db, {
          userId: auth.id,
          eventType: 'approval',
          title: 'A message needs your review',
          body: subject,
          deepLink: 'orbit://inbox',
        });
      }
      imported += 1;
    }
    await services.db.connection.update({
      where: { id: connection.id },
      data: { lastSyncedAt: new Date() },
    });
    await logActivity(services.db, {
      userId: auth.id,
      actorType: 'AGENT',
      action: 'connection.gmail_synced',
      targetType: 'Connection',
      targetId: connection.id,
      payload: { imported },
      requestId: request.id,
    });
    return { ok: true, imported, examined: messages.length };
  });

  app.delete('/v1/connections/gmail', async (request, reply) => {
    const auth = await requireAuth(request, services.config);
    const connection = await services.db.connection.findFirst({
      where: { userId: auth.id, provider: ConnectionProvider.GOOGLE, deletedAt: null },
    });
    if (connection === null)
      throw new ApiError(404, 'GMAIL_NOT_CONNECTED', 'Gmail is not connected.');
    try {
      const stored = JSON.parse(
        decryptField(connection.encryptedTokens, services.config.FIELD_ENCRYPTION_KEY),
      ) as StoredTokens;
      await fetch(
        `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(stored.refreshToken)}`,
        { method: 'POST', signal: AbortSignal.timeout(10_000) },
      );
    } catch {
      // Local revocation still removes access even if Google is temporarily unavailable.
    }
    await services.db.connection.update({
      where: { id: connection.id },
      data: {
        status: ConnectionStatus.REVOKED,
        deletedAt: new Date(),
        encryptedTokens: encryptField('{}', services.config.FIELD_ENCRYPTION_KEY),
      },
    });
    await logActivity(services.db, {
      userId: auth.id,
      actorType: 'USER',
      action: 'connection.gmail_revoked',
      targetType: 'Connection',
      targetId: connection.id,
      requestId: request.id,
    });
    return reply.code(204).send();
  });
};
