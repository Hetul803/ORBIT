import { randomBytes } from 'node:crypto';

import { ConnectionProvider, ConnectionStatus, SourceDocumentKind } from '@orbit/db';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { requireAuth } from '../auth.js';
import { decryptField, encryptField, sha256 } from '../crypto.js';
import { ApiError, parseWith } from '../errors.js';
import { queueGoogleSync } from '../google-sync.js';
import {
  available,
  googleReadonlyScopes,
  googleUserEligible,
  requireAvailable,
  requireGoogleUser,
  tokenRequest,
  type StoredTokens,
} from '../google-read.js';
import { categoryForLabels, mailCategories } from '../mail-categories.js';
import type { Services } from '../services.js';
import { asRecord, logActivity } from './helpers.js';

export const registerGmailRoutes = (app: FastifyInstance, services: Services): void => {
  app.get('/v1/mail', async (request) => {
    const auth = await requireAuth(request, services.config);
    const query = parseWith(
      z.object({ category: z.enum(mailCategories).optional() }),
      request.query,
    );
    const sources = await services.db.sourceDocument.findMany({
      where: { userId: auth.id, kind: SourceDocumentKind.GMAIL_MESSAGE, deletedAt: null },
      orderBy: { occurredAt: 'desc' },
      take: 2500,
    });
    const items = sources.map((source) => {
      const labels = asRecord(source.metadata).labels;
      const category = categoryForLabels(
        Array.isArray(labels)
          ? labels.filter((label): label is string => typeof label === 'string')
          : [],
        source.direction === 'OUTBOUND',
      );
      return {
        id: source.id,
        title: source.title,
        sender: source.sender,
        occurredAt: source.occurredAt?.toISOString() ?? null,
        sourceUrl: source.sourceUrl,
        category,
      };
    });
    return {
      classification: 'gmail_labels',
      counts: Object.fromEntries(
        mailCategories.map((category) => [
          category,
          items.filter((item) => item.category === category).length,
        ]),
      ),
      items: items
        .filter((item) => query.category === undefined || item.category === query.category)
        .slice(0, 100),
      syncedCount: items.length,
      limited: sources.length === 2500,
    };
  });
  app.get('/v1/connections/gmail/status', async (request) => {
    const auth = await requireAuth(request, services.config);
    const connection = await services.db.connection.findUnique({
      where: { userId_provider: { userId: auth.id, provider: ConnectionProvider.GOOGLE } },
      select: {
        id: true,
        status: true,
        scopes: true,
        lastSyncedAt: true,
        deletedAt: true,
        syncStatus: true,
        syncProcessed: true,
        syncTotal: true,
        syncStartedAt: true,
        syncRunId: true,
        syncNextAttemptAt: true,
        syncErrorCode: true,
        expiredAt: true,
      },
    });
    const eligible = await googleUserEligible(services, auth.id);
    return {
      available: available(services) && eligible,
      unavailableReason: !available(services)
        ? 'The operator has not enabled a Google OAuth application.'
        : !eligible
          ? 'Google access is limited to named test users until ORBIT’s Google verification is complete. You can use ORBIT without connecting Google.'
          : null,
      connected:
        connection !== null && connection.deletedAt === null && connection.status === 'ACTIVE',
      reconnectRequired:
        connection !== null && connection.deletedAt === null && connection.status === 'EXPIRED',
      connection:
        connection?.deletedAt === null
          ? {
              id: connection.id,
              status: connection.status.toLowerCase(),
              scopes: connection.scopes,
              lastSyncedAt: connection.lastSyncedAt?.toISOString() ?? null,
              syncStatus: connection.syncStatus,
              syncProcessed: connection.syncProcessed,
              syncTotal: connection.syncTotal,
              syncStartedAt: connection.syncStartedAt?.toISOString() ?? null,
              syncRunId: connection.syncRunId,
              syncNextAttemptAt: connection.syncNextAttemptAt?.toISOString() ?? null,
              syncErrorCode: connection.syncErrorCode,
              expiredAt: connection.expiredAt?.toISOString() ?? null,
            }
          : null,
    };
  });

  app.post('/v1/connections/gmail/reconnect-prompt', async (request) => {
    const auth = await requireAuth(request, services.config);
    const body = parseWith(
      z.object({ source: z.enum(['connections', 'catch']), expiredAt: z.iso.datetime() }),
      request.body,
    );
    return services.db.$transaction(async (tx) => {
      const changed = await tx.connection.updateMany({
        where: {
          userId: auth.id,
          provider: ConnectionProvider.GOOGLE,
          status: ConnectionStatus.EXPIRED,
          expiredAt: new Date(body.expiredAt),
          deletedAt: null,
          reconnectPromptedAt: null,
        },
        data: { reconnectPromptedAt: new Date() },
      });
      if (changed.count > 0)
        await logActivity(tx, {
          userId: auth.id,
          actorType: 'USER',
          action: 'google.reconnect_prompt_shown',
          targetType: 'Connection',
          payload: { source: body.source, expiredAt: body.expiredAt },
          requestId: request.id,
        });
      return { ok: true, recorded: changed.count > 0 };
    });
  });

  app.post('/v1/connections/gmail/start', async (request) => {
    const auth = await requireAuth(request, services.config);
    requireAvailable(services);
    await requireGoogleUser(services, auth.id);
    const prior = await services.db.connection.findUnique({
      where: { userId_provider: { userId: auth.id, provider: ConnectionProvider.GOOGLE } },
      select: { status: true },
    });
    if (prior?.status === ConnectionStatus.EXPIRED)
      await logActivity(services.db, {
        userId: auth.id,
        actorType: 'USER',
        action: 'google.reconnect_started',
        targetType: 'Connection',
        requestId: request.id,
      });
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
      scope: googleReadonlyScopes.join(' '),
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
    if (typeof query.state !== 'string') {
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
    if (!(await googleUserEligible(services, challenge.userId)))
      return reply.redirect(`${services.config.ORBIT_MOBILE_REDIRECT_URL}?gmail=failed`);
    if (typeof query.error === 'string') {
      await services.db.otpChallenge.update({
        where: { id: challenge.id },
        data: { consumedAt: new Date() },
      });
      const outcome = query.error === 'access_denied' ? 'denied' : 'failed';
      return reply.redirect(`${services.config.ORBIT_MOBILE_REDIRECT_URL}?gmail=${outcome}`);
    }
    if (typeof query.code !== 'string') {
      await services.db.otpChallenge.update({
        where: { id: challenge.id },
        data: { consumedAt: new Date() },
      });
      return reply.redirect(`${services.config.ORBIT_MOBILE_REDIRECT_URL}?gmail=incomplete`);
    }
    let token: Record<string, unknown>;
    try {
      token = await tokenRequest(services, {
        grant_type: 'authorization_code',
        code: query.code,
        redirect_uri: services.config.GOOGLE_OAUTH_REDIRECT_URI ?? '',
      });
    } catch {
      await services.db.otpChallenge.update({
        where: { id: challenge.id },
        data: { consumedAt: new Date() },
      });
      return reply.redirect(`${services.config.ORBIT_MOBILE_REDIRECT_URL}?gmail=failed`);
    }
    if (typeof token.refresh_token !== 'string' || typeof token.access_token !== 'string') {
      await services.db.otpChallenge.update({
        where: { id: challenge.id },
        data: { consumedAt: new Date() },
      });
      throw new ApiError(
        502,
        'GOOGLE_REFRESH_TOKEN_MISSING',
        'Google did not grant durable read access.',
      );
    }
    const grantedScopes = typeof token.scope === 'string' ? token.scope.split(' ') : [];
    if (!googleReadonlyScopes.every((scope) => grantedScopes.includes(scope))) {
      await services.db.otpChallenge.update({
        where: { id: challenge.id },
        data: { consumedAt: new Date() },
      });
      throw new ApiError(
        403,
        'GOOGLE_SCOPE_MISSING',
        'Gmail and Calendar read-only permissions were not both granted.',
      );
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
    const prior = await services.db.connection.findUnique({
      where: { userId_provider: { userId: challenge.userId, provider: ConnectionProvider.GOOGLE } },
      select: { status: true },
    });
    const connection = await services.db.connection.upsert({
      where: { userId_provider: { userId: challenge.userId, provider: ConnectionProvider.GOOGLE } },
      update: {
        encryptedTokens,
        syncStatus: 'idle',
        syncRunId: null,
        syncState: {},
        syncLeaseToken: null,
        syncLeaseUntil: null,
        syncNextAttemptAt: null,
        syncErrorCode: null,
        syncAttempts: 0,
        scopes: [...googleReadonlyScopes],
        status: ConnectionStatus.ACTIVE,
        deletedAt: null,
        expiredAt: null,
        reconnectPromptedAt: null,
      },
      create: {
        userId: challenge.userId,
        provider: ConnectionProvider.GOOGLE,
        encryptedTokens,
        scopes: [...googleReadonlyScopes],
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
          action:
            prior?.status === ConnectionStatus.EXPIRED
              ? 'google.reconnected'
              : 'connection.gmail_connected',
          targetType: 'Connection',
          targetId: connection.id,
          payload: { scopes: googleReadonlyScopes },
        },
      }),
    ]);
    // Successful consent starts the durable sync even if the mobile redirect is interrupted.
    await queueGoogleSync(services, challenge.userId);
    return reply.redirect(`${services.config.ORBIT_MOBILE_REDIRECT_URL}?gmail=connected`);
  });

  app.post('/v1/connections/gmail/sync', async (request, reply) => {
    const auth = await requireAuth(request, services.config);
    const queued = await queueGoogleSync(services, auth.id);
    return reply
      .code(202)
      .send({ ok: true, ...queued, background: true, daysRead: 90, maxMessages: 2500 });
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
        syncStatus: 'idle',
        syncRunId: null,
        syncState: {},
        syncLeaseToken: null,
        syncLeaseUntil: null,
        syncNextAttemptAt: null,
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
