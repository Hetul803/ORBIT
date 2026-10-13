import { createHash, randomBytes } from 'node:crypto';
import { ConnectionProvider, ConnectionStatus } from '@orbit/db';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../auth.js';
import { encryptField, decryptField, sha256 } from '../crypto.js';
import { ApiError, parseWith } from '../errors.js';
import type { Services } from '../services.js';
import { asRecord, logActivity } from './helpers.js';
import { disconnectAccount, requireOwnedAccount } from '../linked-accounts.js';
import {
  microsoftAvailable,
  microsoftEligible,
  microsoftReadonlyScopes,
  requireMicrosoftUser,
  microsoftTokenRequest,
  microsoftJson,
  assertMicrosoftScopes,
  microsoftProfileEmail,
} from '../microsoft-read.js';
import { queueMicrosoftSync } from '../microsoft-sync.js';

export const registerOutlookRoutes = (app: FastifyInstance, services: Services): void => {
  app.get('/v1/connections/outlook/status', async (request) => {
    const auth = await requireAuth(request, services.config);
    const rows = await services.db.connection.findMany({
      where: { userId: auth.id, provider: ConnectionProvider.MICROSOFT, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        accountEmail: true,
        status: true,
        scopes: true,
        lastSyncedAt: true,
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
    const connections = rows.map((c) => ({
      ...c,
      provider: 'microsoft' as const,
      status: c.status.toLowerCase(),
      lastSyncedAt: c.lastSyncedAt?.toISOString() ?? null,
      syncStartedAt: c.syncStartedAt?.toISOString() ?? null,
      syncNextAttemptAt: c.syncNextAttemptAt?.toISOString() ?? null,
      expiredAt: c.expiredAt?.toISOString() ?? null,
    }));
    const available = microsoftAvailable(services) && (await microsoftEligible(services, auth.id));
    return {
      available,
      unavailableReason: available
        ? null
        : 'Microsoft connection is not available for this account yet.',
      connected: connections.some((c) => c.status === 'active'),
      reconnectRequired: connections.some((c) => c.status === 'expired'),
      connections,
      connection: connections.find((c) => c.status === 'expired') ?? connections[0] ?? null,
    };
  });
  app.post('/v1/connections/outlook/start', async (request) => {
    const auth = await requireAuth(request, services.config);
    await requireMicrosoftUser(services, auth.id);
    const body = parseWith(
      z.object({
        connectionId: z.string().min(8).optional(),
        addAccount: z.boolean().default(false),
      }),
      request.body ?? {},
    );
    if (body.connectionId && body.addAccount)
      throw new ApiError(400, 'OAUTH_TARGET_INVALID', 'Choose either reconnect or add account.');
    const target = body.connectionId
      ? await requireOwnedAccount(
          services,
          auth.id,
          body.connectionId,
          ConnectionProvider.MICROSOFT,
        )
      : null;
    const state = randomBytes(32).toString('base64url'),
      verifier = randomBytes(48).toString('base64url');
    await services.db.otpChallenge.create({
      data: {
        userId: auth.id,
        email: 'oauth:outlook',
        purpose: 'microsoft_oauth',
        codeHash: sha256(state),
        metadata: {
          connectionId: target?.id ?? null,
          accountKey: target?.accountKey ?? null,
          encryptedVerifier: encryptField(verifier, services.config.FIELD_ENCRYPTION_KEY),
        },
        expiresAt: new Date(Date.now() + 600_000),
        ipHash: sha256(request.ip),
      },
    });
    const url = new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
    url.search = new URLSearchParams({
      client_id: services.config.MICROSOFT_OAUTH_CLIENT_ID ?? '',
      response_type: 'code',
      response_mode: 'query',
      redirect_uri: services.config.MICROSOFT_OAUTH_REDIRECT_URI ?? '',
      scope: microsoftReadonlyScopes.join(' '),
      prompt: target ? 'consent' : 'select_account',
      state,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
    }).toString();
    return { authorizationUrl: url.toString(), expiresIn: 600 };
  });
  app.get('/v1/connections/outlook/callback', async (request, reply) => {
    const query = parseWith(
      z
        .object({
          state: z.string().min(20),
          code: z.string().optional(),
          error: z.string().optional(),
        })
        .loose(),
      request.query,
    );
    const challenge = await services.db.otpChallenge.findFirst({
      where: {
        purpose: 'microsoft_oauth',
        email: 'oauth:outlook',
        codeHash: sha256(query.state),
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!challenge?.userId)
      throw new ApiError(
        401,
        'OAUTH_STATE_INVALID',
        'This Microsoft authorization expired or was already used.',
      );
    await requireMicrosoftUser(services, challenge.userId);
    const consumed = await services.db.otpChallenge.updateMany({
      where: { id: challenge.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (consumed.count !== 1)
      throw new ApiError(
        401,
        'OAUTH_STATE_INVALID',
        'This Microsoft authorization was already used.',
      );
    const destination = (result: string) =>
      `${services.config.ORBIT_MOBILE_REDIRECT_URL}?outlook=${result}`;
    if (query.error || !query.code)
      return reply.redirect(destination(query.error === 'access_denied' ? 'denied' : 'failed'));
    const context = asRecord(challenge.metadata);
    if (typeof context.encryptedVerifier !== 'string') return reply.redirect(destination('failed'));
    try {
      const token = await microsoftTokenRequest(services, {
        grant_type: 'authorization_code',
        code: query.code,
        redirect_uri: services.config.MICROSOFT_OAUTH_REDIRECT_URI ?? '',
        code_verifier: decryptField(
          context.encryptedVerifier,
          services.config.FIELD_ENCRYPTION_KEY,
        ),
      });
      assertMicrosoftScopes(token.scope);
      if (typeof token.access_token !== 'string' || typeof token.refresh_token !== 'string')
        throw new ApiError(
          403,
          'MICROSOFT_SCOPE_MISMATCH',
          'Read-only offline consent was incomplete.',
        );
      const profile = await microsoftJson(
        '/me?$select=id,mail,userPrincipalName',
        token.access_token,
      );
      const email = microsoftProfileEmail(profile);
      if (typeof profile.id !== 'string' || !profile.id || !z.email().safeParse(email).success)
        throw new ApiError(
          502,
          'MICROSOFT_IDENTITY_INVALID',
          'Microsoft did not return a supported mailbox identity.',
        );
      const accountKey = sha256(profile.id + '\n' + email).slice(0, 40),
        userId = challenge.userId;
      const connection = await services.db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${`account-link:${userId}:microsoft`}))`;
        if (typeof context.connectionId === 'string') {
          const prior = await tx.connection.findFirst({
            where: {
              id: context.connectionId,
              userId,
              provider: ConnectionProvider.MICROSOFT,
              deletedAt: null,
            },
          });
          if (prior?.accountKey !== accountKey || context.accountKey !== accountKey)
            throw new ApiError(
              409,
              'MICROSOFT_ACCOUNT_MISMATCH',
              'Reconnect the same Microsoft account; use Add account for a different one.',
            );
        }
        const existing = await tx.connection.findUnique({
          where: {
            userId_provider_accountKey: {
              userId,
              provider: ConnectionProvider.MICROSOFT,
              accountKey,
            },
          },
        });
        if (
          existing?.deletedAt !== null &&
          (await tx.connection.count({
            where: { userId, provider: ConnectionProvider.MICROSOFT, deletedAt: null },
          })) >= 5
        )
          throw new ApiError(
            409,
            'ACCOUNT_LIMIT',
            'Up to five Microsoft accounts can be connected.',
          );
        const expiry =
          typeof token.expires_in === 'number' && Number.isFinite(token.expires_in)
            ? Math.min(token.expires_in, 7200)
            : 3600;
        const data = {
          accountEmail: email,
          scopes: [...microsoftReadonlyScopes],
          encryptedTokens: encryptField(
            JSON.stringify({
              ownerId: userId,
              provider: ConnectionProvider.MICROSOFT,
              accountKey,
              refreshToken: token.refresh_token,
              accessToken: token.access_token,
              expiresAt: new Date(Date.now() + expiry * 1000).toISOString(),
            }),
            services.config.FIELD_ENCRYPTION_KEY,
          ),
          status: ConnectionStatus.ACTIVE,
          deletedAt: null,
          expiredAt: null,
          reconnectPromptedAt: null,
          syncStatus: 'idle',
          syncRunId: null,
          syncState: {},
          syncLeaseToken: null,
          syncLeaseUntil: null,
          syncNextAttemptAt: null,
        };
        return tx.connection.upsert({
          where: {
            userId_provider_accountKey: {
              userId,
              provider: ConnectionProvider.MICROSOFT,
              accountKey,
            },
          },
          update: data,
          create: { ...data, userId, provider: ConnectionProvider.MICROSOFT, accountKey },
        });
      });
      await queueMicrosoftSync(services, userId, connection.id);
      await logActivity(services.db, {
        userId,
        actorType: 'USER',
        action: 'connection.microsoft_connected',
        targetType: 'Connection',
        targetId: connection.id,
        payload: { readonly: true },
        requestId: request.id,
      });
      return await reply.redirect(destination('connected'));
    } catch {
      return reply.redirect(destination('failed'));
    }
  });
  app.post('/v1/connections/outlook/sync', async (request, reply) => {
    const auth = await requireAuth(request, services.config);
    await requireMicrosoftUser(services, auth.id);
    const body = parseWith(z.object({ connectionId: z.string().min(8) }), request.body);
    await requireOwnedAccount(services, auth.id, body.connectionId, ConnectionProvider.MICROSOFT);
    return reply.code(202).send({
      ...(await queueMicrosoftSync(services, auth.id, body.connectionId)),
      background: true,
      daysRead: 90,
      maxMessages: 2500,
    });
  });
  app.delete('/v1/connections/outlook', async (request, reply) => {
    const auth = await requireAuth(request, services.config);
    const query = parseWith(z.object({ connectionId: z.string().min(8) }), request.query);
    await disconnectAccount(services, auth.id, query.connectionId, ConnectionProvider.MICROSOFT);
    await logActivity(services.db, {
      userId: auth.id,
      actorType: 'USER',
      action: 'connection.microsoft_disconnected',
      targetType: 'Connection',
      targetId: query.connectionId,
      requestId: request.id,
    });
    return reply.code(204).send();
  });
};
