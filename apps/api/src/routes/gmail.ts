import { randomBytes } from 'node:crypto';

import {
  ConnectionProvider,
  ConnectionStatus,
  InboxTriage,
  SourceDocumentDirection,
  SourceDocumentKind,
  queuePush,
} from '@orbit/db';
import type { FastifyInstance } from 'fastify';

import { requireAuth } from '../auth.js';
import { decryptField, encryptField, sha256 } from '../crypto.js';
import { ApiError } from '../errors.js';
import { refreshLifeItems } from '../life.js';
import type { Services } from '../services.js';
import { asRecord, logActivity } from './helpers.js';

const gmailReadonlyScope = 'https://www.googleapis.com/auth/gmail.readonly';
const calendarReadonlyScope = 'https://www.googleapis.com/auth/calendar.readonly';
const googleReadonlyScopes = [gmailReadonlyScope, calendarReadonlyScope] as const;

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
  if (!response.ok) {
    const record = asRecord(body);
    if (record.error === 'invalid_grant') {
      throw new ApiError(
        409,
        'GMAIL_RECONNECT_REQUIRED',
        'Google access expired. Reconnect Gmail to continue.',
      );
    }
    throw new ApiError(502, 'GOOGLE_OAUTH_FAILED', 'Google did not complete authorization.');
  }
  return asRecord(body);
};

const accessTokenFor = async (
  services: Services,
  connection: { id: string; encryptedTokens: string },
): Promise<string> => {
  const stored = JSON.parse(
    decryptField(connection.encryptedTokens, services.config.FIELD_ENCRYPTION_KEY),
  ) as StoredTokens;
  let refreshed: Record<string, unknown>;
  try {
    refreshed = await tokenRequest(services, {
      grant_type: 'refresh_token',
      refresh_token: stored.refreshToken,
    });
  } catch (error: unknown) {
    if (error instanceof ApiError && error.code === 'GMAIL_RECONNECT_REQUIRED') {
      await services.db.connection.update({
        where: { id: connection.id },
        data: { status: ConnectionStatus.EXPIRED },
      });
    }
    throw error;
  }
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

const googleJson = async (url: string, accessToken: string): Promise<Record<string, unknown>> => {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
  });
  const body: unknown = await response.json();
  if (!response.ok)
    throw new ApiError(502, 'GOOGLE_READ_FAILED', 'Google data could not be read right now.');
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

const emailAddress = (value: string): string => {
  const bracketed = /<([^>]+)>/u.exec(value)?.[1];
  return (bracketed ?? value).trim().toLowerCase();
};

const parseMessageDate = (value: string): Date | null => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const gmailMessageSourceUrl = (messageId: string): string =>
  `https://mail.google.com/mail/u/0/#all/${encodeURIComponent(messageId)}`;

const derivedEmailSignals = (body: string): Record<string, string | boolean | null> => {
  const normalized = body.replaceAll(/\s+/gu, ' ').trim();
  const commitment = /\b(?:i['’]ll|i will|we['’]ll|we will)\s+([^.!?]{5,220})/iu.exec(normalized);
  const dateMention =
    /\b(?:due|deadline|by|on|before)\s+((?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:,?\s+\d{4})?|today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/iu.exec(
      normalized,
    );
  const renewal = /\b(?:subscription|renewal|renews?|membership|trial ends?)\b/iu.exec(normalized);
  return {
    needsReply: /\?|\b(?:could you|can you|please|let me know|would you|are you able)\b/iu.test(
      normalized,
    ),
    commitment: commitment?.[0]?.slice(0, 280) ?? null,
    dateMention: dateMention?.[0]?.slice(0, 120) ?? null,
    renewal: renewal?.[0]?.slice(0, 80) ?? null,
  };
};

const gmailMessagesForCatch = async (
  accessToken: string,
): Promise<readonly Record<string, unknown>[]> => {
  const messages: Record<string, unknown>[] = [];
  let pageToken: string | undefined;
  // Gmail returns newest-first. Five pages at the API maximum keeps the first
  // sync useful for active inboxes while making its bounded cost explicit.
  for (let page = 0; page < 5; page += 1) {
    const params = new URLSearchParams({ maxResults: '500', q: 'newer_than:90d' });
    if (pageToken !== undefined) params.set('pageToken', pageToken);
    const list = await gmailJson(`/messages?${params.toString()}`, accessToken);
    const entries = Array.isArray(list.messages) ? list.messages : [];
    messages.push(...entries.map(asRecord));
    pageToken = typeof list.nextPageToken === 'string' ? list.nextPageToken : undefined;
    if (pageToken === undefined) break;
  }
  return messages;
};

const syncCalendar = async (
  services: Services,
  userId: string,
  accessToken: string,
): Promise<number> => {
  const start = new Date();
  const end = new Date(start.getTime() + 14 * 86_400_000);
  const params = new URLSearchParams({
    singleEvents: 'true',
    orderBy: 'startTime',
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    maxResults: '250',
  });
  const payload = await googleJson(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
    accessToken,
  );
  const events = Array.isArray(payload.items) ? payload.items.map(asRecord) : [];
  let imported = 0;
  for (const event of events) {
    const id = typeof event.id === 'string' ? event.id : undefined;
    if (id === undefined) continue;
    const startData = asRecord(event.start);
    const endData = asRecord(event.end);
    const startValue =
      typeof startData.dateTime === 'string'
        ? startData.dateTime
        : typeof startData.date === 'string'
          ? `${startData.date}T00:00:00.000Z`
          : undefined;
    const endValue =
      typeof endData.dateTime === 'string'
        ? endData.dateTime
        : typeof endData.date === 'string'
          ? `${endData.date}T00:00:00.000Z`
          : undefined;
    if (startValue === undefined || endValue === undefined) continue;
    const title = typeof event.summary === 'string' ? event.summary : '(Untitled event)';
    const description =
      typeof event.description === 'string' ? event.description.slice(0, 8_000) : '';
    const sourceUrl =
      typeof event.htmlLink === 'string'
        ? event.htmlLink
        : `https://calendar.google.com/calendar/u/0/r/search?q=${encodeURIComponent(title)}`;
    await services.db.sourceDocument.upsert({
      where: {
        userId_kind_externalId: {
          userId,
          kind: SourceDocumentKind.GOOGLE_CALENDAR_EVENT,
          externalId: id,
        },
      },
      update: {
        sourceUrl,
        title,
        occurredAt: new Date(startValue),
        body: description,
        metadata: { start: startValue, end: endValue, status: event.status ?? null },
        lastSyncedAt: new Date(),
        deletedAt: null,
      },
      create: {
        userId,
        kind: SourceDocumentKind.GOOGLE_CALENDAR_EVENT,
        direction: SourceDocumentDirection.UNKNOWN,
        externalId: id,
        sourceUrl,
        title,
        occurredAt: new Date(startValue),
        body: description,
        metadata: { start: startValue, end: endValue, status: event.status ?? null },
      },
    });
    imported += 1;
  }
  return imported;
};

export const registerGmailRoutes = (app: FastifyInstance, services: Services): void => {
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
      },
    });
    return {
      available: available(services),
      unavailableReason: available(services)
        ? null
        : 'The operator has not enabled a verified Google OAuth application.',
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
    const connection = await services.db.connection.upsert({
      where: { userId_provider: { userId: challenge.userId, provider: ConnectionProvider.GOOGLE } },
      update: {
        encryptedTokens,
        scopes: [...googleReadonlyScopes],
        status: ConnectionStatus.ACTIVE,
        deletedAt: null,
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
          action: 'connection.gmail_connected',
          targetType: 'Connection',
          targetId: connection.id,
          payload: { scopes: googleReadonlyScopes },
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
    await services.db.connection.update({
      where: { id: connection.id },
      data: {
        syncStatus: 'authorizing',
        syncProcessed: 0,
        syncTotal: null,
        syncStartedAt: new Date(),
      },
    });
    try {
      const accessToken = await accessTokenFor(services, connection);
      const profile = await gmailJson('/profile', accessToken);
      const accountEmail =
        typeof profile.emailAddress === 'string' ? profile.emailAddress.toLowerCase() : '';
      const messages = await gmailMessagesForCatch(accessToken);
      await services.db.connection.update({
        where: { id: connection.id },
        data: { syncStatus: 'reading_mail', syncProcessed: 0, syncTotal: messages.length },
      });
      const rules = await services.db.screeningRule.findMany({
        where: { userId: auth.id, deletedAt: null },
        orderBy: { priority: 'asc' },
      });
      let imported = 0;
      let inboxImported = 0;
      for (const [messageIndex, summary] of messages.entries()) {
        if (messageIndex % 10 === 0) {
          await services.db.connection.update({
            where: { id: connection.id },
            data: { syncProcessed: messageIndex },
          });
        }
        const messageId = summary.id;
        if (typeof messageId !== 'string') continue;
        const sourceExists = await services.db.sourceDocument.findUnique({
          where: {
            userId_kind_externalId: {
              userId: auth.id,
              kind: SourceDocumentKind.GMAIL_MESSAGE,
              externalId: messageId,
            },
          },
          select: { id: true },
        });
        if (sourceExists !== null) continue;
        const kind = `gmail:${messageId}`;
        const existing = await services.db.inboxItem.findFirst({
          where: { recipientUserId: auth.id, kind },
        });
        const message = await gmailJson(
          `/messages/${encodeURIComponent(messageId)}?format=full`,
          accessToken,
        );
        const payload = asRecord(message.payload);
        const subject = headerValue(payload, 'Subject') || '(No subject)';
        const from = headerValue(payload, 'From');
        const to = headerValue(payload, 'To');
        const date = parseMessageDate(headerValue(payload, 'Date'));
        const snippet = typeof message.snippet === 'string' ? message.snippet : '';
        const body = (plainBody(payload) || snippet).slice(0, 8_000);
        const derived = derivedEmailSignals(body);
        const direction =
          accountEmail.length > 0 && emailAddress(from) === accountEmail
            ? SourceDocumentDirection.OUTBOUND
            : SourceDocumentDirection.INBOUND;
        const threadId = typeof message.threadId === 'string' ? message.threadId : undefined;
        await services.db.sourceDocument.create({
          data: {
            userId: auth.id,
            kind: SourceDocumentKind.GMAIL_MESSAGE,
            direction,
            externalId: messageId,
            ...(threadId === undefined ? {} : { threadId }),
            sourceUrl: gmailMessageSourceUrl(messageId),
            title: subject,
            sender: from || null,
            recipients: to || null,
            ...(date === null ? {} : { occurredAt: date }),
            body: '',
            metadata: {
              labels: Array.isArray(message.labelIds) ? message.labelIds : [],
              gmailInternalDate:
                typeof message.internalDate === 'string' ? message.internalDate : null,
              derived,
            },
          },
        });
        imported += 1;
        if (direction !== SourceDocumentDirection.INBOUND || existing !== null) continue;
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
        await services.db.inboxItem.create({
          data: {
            recipientUserId: auth.id,
            kind,
            subject,
            body: `From: ${from}\n\nOpen the original email to read it. ORBIT does not retain Gmail message bodies.`,
            triage,
            agentReply: null,
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
        inboxImported += 1;
      }
      await services.db.connection.update({
        where: { id: connection.id },
        data: { syncStatus: 'reading_calendar', syncProcessed: messages.length },
      });
      const calendarImported = await syncCalendar(services, auth.id, accessToken);
      await services.db.connection.update({
        where: { id: connection.id },
        data: { syncStatus: 'building_catch' },
      });
      const caught = await refreshLifeItems(services, auth.id, request.id);
      await services.db.connection.update({
        where: { id: connection.id },
        data: {
          lastSyncedAt: new Date(),
          syncStatus: 'idle',
          syncProcessed: messages.length,
          syncTotal: messages.length,
        },
      });
      await logActivity(services.db, {
        userId: auth.id,
        actorType: 'AGENT',
        action: 'connection.gmail_synced',
        targetType: 'Connection',
        targetId: connection.id,
        payload: { imported, inboxImported, calendarImported, caught, daysRead: 90 },
        requestId: request.id,
      });
      return {
        ok: true,
        imported,
        inboxImported,
        calendarImported,
        caught,
        examined: messages.length,
      };
    } catch (error: unknown) {
      await services.db.connection.update({
        where: { id: connection.id },
        data: { syncStatus: 'error' },
      });
      throw error;
    }
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
