import {
  ConnectionStatus,
  ConnectionProvider,
  SourceDocumentDirection,
  SourceDocumentKind,
  type Prisma,
} from '@orbit/db';
import { decryptField, encryptField } from './crypto.js';
import { ApiError } from './errors.js';
import type { Services } from './services.js';
import { asRecord, logActivity } from './routes/helpers.js';

const gmailReadonlyScope = 'https://www.googleapis.com/auth/gmail.readonly';
const calendarReadonlyScope = 'https://www.googleapis.com/auth/calendar.readonly';
export const googleReadonlyScopes = [gmailReadonlyScope, calendarReadonlyScope] as const;

export interface StoredTokens {
  refreshToken: string;
  accessToken?: string;
  expiresAt?: string;
  ownerId?: string;
  provider?: string;
  accountKey?: string;
}

export const available = (services: Services): boolean =>
  services.config.GMAIL_INTEGRATION_ENABLED === 'true' &&
  services.config.GOOGLE_OAUTH_CLIENT_ID !== undefined &&
  services.config.GOOGLE_OAUTH_CLIENT_SECRET !== undefined &&
  services.config.GOOGLE_OAUTH_REDIRECT_URI !== undefined;

export const requireAvailable = (services: Services): void => {
  if (!available(services)) {
    throw new ApiError(
      503,
      'GMAIL_NOT_CONFIGURED',
      'Gmail is unavailable until the operator configures and enables Google OAuth.',
    );
  }
};

export const googleUserEligible = async (services: Services, userId: string): Promise<boolean> => {
  const user = await services.db.user.findUnique({
    where: { id: userId },
    select: { email: true, status: true, deletedAt: true },
  });
  if (user?.status !== 'ACTIVE' || user.deletedAt !== null) return false;
  if (
    services.config.NODE_ENV !== 'production' ||
    services.config.GOOGLE_OAUTH_VERIFICATION_STATUS === 'verified'
  )
    return true;
  return services.config.GOOGLE_TEST_USER_EMAILS.split(',')
    .map((email) => email.trim().toLowerCase())
    .includes(user.email);
};

export const requireGoogleUser = async (services: Services, userId: string): Promise<void> => {
  if (!(await googleUserEligible(services, userId)))
    throw new ApiError(
      403,
      'GOOGLE_VERIFICATION_PENDING',
      'Google access is limited to named test users until ORBIT’s Google verification is complete. Other ORBIT features remain available.',
    );
};

export const tokenRequest = async (
  services: Services,
  parameters: Record<string, string>,
): Promise<Record<string, unknown>> => {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    redirect: 'error',
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

export const accessTokenFor = async (
  services: Services,
  connection: { id: string; encryptedTokens: string },
  requestId?: string,
): Promise<string> => {
  const bound = await services.db.connection.findFirst({
    where: {
      id: connection.id,
      provider: ConnectionProvider.GOOGLE,
      status: ConnectionStatus.ACTIVE,
      deletedAt: null,
      encryptedTokens: connection.encryptedTokens,
    },
  });
  if (!bound)
    throw new ApiError(
      409,
      'GMAIL_SYNC_CANCELLED',
      'This Google account is disconnected or changed.',
    );
  const stored = JSON.parse(
    decryptField(connection.encryptedTokens, services.config.FIELD_ENCRYPTION_KEY),
  ) as StoredTokens;
  if (typeof stored.refreshToken !== 'string')
    throw new ApiError(409, 'GMAIL_RECONNECT_REQUIRED', 'Reconnect this Google account.');
  if (
    stored.provider !== undefined &&
    (stored.provider !== ConnectionProvider.GOOGLE ||
      stored.ownerId !== bound.userId ||
      stored.accountKey !== bound.accountKey)
  )
    throw new ApiError(
      409,
      'GOOGLE_ACCOUNT_MISMATCH',
      'This credential does not belong to this Google account.',
    );
  if (
    stored.provider === undefined &&
    !bound.accountEmail &&
    (await services.db.sourceDocument.count({ where: { connectionId: bound.id } })) > 0
  )
    throw new ApiError(
      409,
      'GOOGLE_ACCOUNT_MISMATCH',
      'This legacy mailbox identity is unknown. Disconnect and reconnect it before reading more messages.',
    );
  let refreshed: Record<string, unknown>;
  try {
    refreshed = await tokenRequest(services, {
      grant_type: 'refresh_token',
      refresh_token: stored.refreshToken,
    });
  } catch (error: unknown) {
    if (error instanceof ApiError && error.code === 'GMAIL_RECONNECT_REQUIRED') {
      await services.db.$transaction(async (tx) => {
        const changed = await tx.connection.updateMany({
          where: {
            id: connection.id,
            status: ConnectionStatus.ACTIVE,
            deletedAt: null,
            encryptedTokens: connection.encryptedTokens,
          },
          data: {
            status: ConnectionStatus.EXPIRED,
            expiredAt: new Date(),
            reconnectPromptedAt: null,
          },
        });
        if (changed.count > 0) {
          const record = await tx.connection.findUniqueOrThrow({
            where: { id: connection.id },
            select: { userId: true },
          });
          await logActivity(tx, {
            userId: record.userId,
            actorType: 'SYSTEM',
            action: 'google.token_expired',
            targetType: 'Connection',
            targetId: connection.id,
            ...(requestId === undefined ? {} : { requestId }),
          });
        }
      });
    }
    throw error;
  }
  if (typeof refreshed.access_token !== 'string') {
    throw new ApiError(502, 'GOOGLE_TOKEN_FAILED', 'Google did not return an access token.');
  }
  let accountEmail = bound.accountEmail;
  if (stored.provider === undefined) {
    const profile = await gmailJson('/profile', refreshed.access_token);
    const email =
      typeof profile.emailAddress === 'string' ? profile.emailAddress.trim().toLowerCase() : '';
    if (!email || (accountEmail && accountEmail.toLowerCase() !== email))
      throw new ApiError(
        409,
        'GOOGLE_ACCOUNT_MISMATCH',
        'Google returned a different mailbox. No messages were read.',
      );
    accountEmail = email;
  }
  const next: StoredTokens = {
    ownerId: bound.userId,
    provider: ConnectionProvider.GOOGLE,
    accountKey: bound.accountKey,
    refreshToken: stored.refreshToken,
    accessToken: refreshed.access_token,
    expiresAt: new Date(Date.now() + Number(refreshed.expires_in ?? 3_600) * 1_000).toISOString(),
  };
  const saved = await services.db.connection.updateMany({
    where: {
      id: connection.id,
      userId: bound.userId,
      provider: ConnectionProvider.GOOGLE,
      status: ConnectionStatus.ACTIVE,
      deletedAt: null,
      encryptedTokens: connection.encryptedTokens,
    },
    data: {
      encryptedTokens: encryptField(JSON.stringify(next), services.config.FIELD_ENCRYPTION_KEY),
      accountEmail,
      status: ConnectionStatus.ACTIVE,
    },
  });
  if (saved.count === 0)
    throw new ApiError(409, 'GMAIL_SYNC_CANCELLED', 'Google access was disconnected.');
  return refreshed.access_token;
};

export const gmailJson = async (
  path: string,
  accessToken: string,
): Promise<Record<string, unknown>> => {
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    const error = asRecord(asRecord(body).error);
    const reasons = Array.isArray(error.errors)
      ? error.errors.map(asRecord).map((item) => item.reason)
      : [];
    if (response.status === 404)
      throw new ApiError(404, 'GMAIL_MESSAGE_GONE', 'That message is no longer available.');
    if (response.status === 401)
      throw new ApiError(
        409,
        'GMAIL_RECONNECT_REQUIRED',
        'Google access expired. Reconnect to continue.',
      );
    if (
      response.status === 429 ||
      reasons.some((reason) => reason === 'rateLimitExceeded' || reason === 'userRateLimitExceeded')
    )
      throw new ApiError(
        503,
        'GOOGLE_RATE_LIMITED',
        'Google is limiting reads. Sync will retry automatically.',
      );
    if (response.status === 403)
      throw new ApiError(
        403,
        'GOOGLE_PERMISSION_REQUIRED',
        'Google refused this read. Check the granted permissions and reconnect.',
      );
    throw new ApiError(502, 'GMAIL_READ_FAILED', 'Gmail could not be read right now.');
  }
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

export const plainBody = (payload: Record<string, unknown>): string => {
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

export const headerValue = (payload: Record<string, unknown>, name: string): string => {
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

export const ruleMatches = (
  matchOn: Record<string, unknown>,
  from: string,
  subject: string,
): boolean => {
  const fromNeedle = typeof matchOn.from === 'string' ? matchOn.from.toLowerCase() : '';
  const subjectNeedle =
    typeof matchOn.subjectIncludes === 'string' ? matchOn.subjectIncludes.toLowerCase() : '';
  return (
    (fromNeedle.length === 0 || from.toLowerCase().includes(fromNeedle)) &&
    (subjectNeedle.length === 0 || subject.toLowerCase().includes(subjectNeedle))
  );
};

export const emailAddress = (value: string): string => {
  const bracketed = /<([^>]+)>/u.exec(value)?.[1];
  return (bracketed ?? value).trim().toLowerCase();
};

export const parseMessageDate = (value: string): Date | null => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const gmailMessageSourceUrl = (messageId: string, accountEmail = ''): string =>
  `https://mail.google.com/mail/${accountEmail ? `?authuser=${encodeURIComponent(accountEmail)}` : 'u/0/'}#all/${encodeURIComponent(messageId)}`;

export const derivedEmailSignals = (body: string): Record<string, string | boolean | null> => {
  const normalized = body.replaceAll(/\s+/gu, ' ').trim();
  const commitment = /\b(?:i['’]ll|i will|we['’]ll|we will)\s+([^.!?]{5,220})/iu.exec(normalized);
  const dateMention =
    /\b(?:due|deadline|by|on|before)\s+((?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:,?\s+\d{4})?|today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/iu.exec(
      normalized,
    );
  const renewal = /\b(?:subscription|renewal|renews?|membership|trial ends?)\b/iu.exec(normalized);
  return {
    receipt:
      /\b(?:receipt|invoice|order confirmation|purchase confirmed|payment received)\b/iu.test(
        normalized,
      ),
    needsReply: /\?|\b(?:could you|can you|please|let me know|would you|are you able)\b/iu.test(
      normalized,
    ),
    commitment: commitment?.[0]?.slice(0, 280) ?? null,
    dateMention: dateMention?.[0]?.slice(0, 120) ?? null,
    renewal: renewal?.[0]?.slice(0, 80) ?? null,
  };
};

export const gmailMessagesForCatch = async (
  accessToken: string,
): Promise<readonly Record<string, unknown>[]> => {
  const messages: Record<string, unknown>[] = [];
  let pageToken: string | undefined;
  // Gmail returns newest-first. Five pages at the API maximum keeps the first
  // sync useful for active inboxes while making its bounded cost explicit.
  for (let page = 0; page < 5; page += 1) {
    const params = new URLSearchParams({
      maxResults: '500',
      q: 'newer_than:90d -in:trash',
      includeSpamTrash: 'true',
    });
    if (pageToken !== undefined) params.set('pageToken', pageToken);
    const list = await gmailJson(`/messages?${params.toString()}`, accessToken);
    const entries = Array.isArray(list.messages) ? list.messages : [];
    messages.push(...entries.map(asRecord));
    pageToken = typeof list.nextPageToken === 'string' ? list.nextPageToken : undefined;
    if (pageToken === undefined) break;
  }
  return messages;
};

export const syncCalendar = async (
  services: Services,
  userId: string,
  accessToken: string,
  saveCalendar: (data: Prisma.SourceDocumentUpsertArgs) => Promise<unknown> = (data) =>
    services.db.sourceDocument.upsert(data),
  connection?: { id: string; accountKey: string },
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
    const externalId =
      !connection || connection.accountKey === 'primary' ? id : `${connection.id}:${id}`;
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
    await saveCalendar({
      where: {
        userId_kind_externalId: {
          userId,
          kind: SourceDocumentKind.GOOGLE_CALENDAR_EVENT,
          externalId,
        },
      },
      update: {
        ...(connection ? { connectionId: connection.id } : {}),
        sourceUrl,
        title,
        occurredAt: new Date(startValue),
        body: description,
        metadata: {
          start: startValue,
          end: endValue,
          allDay: typeof startData.date === 'string',
          startDate: startData.date ?? null,
          endDate: endData.date ?? null,
          status: event.status ?? null,
        },
        lastSyncedAt: new Date(),
        deletedAt: null,
      },
      create: {
        userId,
        ...(connection ? { connectionId: connection.id } : {}),
        kind: SourceDocumentKind.GOOGLE_CALENDAR_EVENT,
        direction: SourceDocumentDirection.UNKNOWN,
        externalId,
        sourceUrl,
        title,
        occurredAt: new Date(startValue),
        body: description,
        metadata: {
          start: startValue,
          end: endValue,
          allDay: typeof startData.date === 'string',
          startDate: startData.date ?? null,
          endDate: endData.date ?? null,
          status: event.status ?? null,
        },
      },
    });
    imported += 1;
  }
  return imported;
};
