import {
  ConnectionProvider,
  ConnectionStatus,
  SourceDocumentKind,
  type Connection,
  type Prisma,
} from '@orbit/db';
import { decryptField, encryptField } from './crypto.js';
import { ApiError } from './errors.js';
import { asRecord } from './routes/helpers.js';
import type { Services } from './services.js';
import { scopedExternalId } from './linked-accounts.js';

export const microsoftReadonlyScopes = [
  'User.Read',
  'Mail.Read',
  'Calendars.Read',
  'offline_access',
] as const;
export const microsoftProfileEmail = (profile: Record<string, unknown>): string =>
  (typeof profile.mail === 'string' && profile.mail.trim()
    ? profile.mail
    : typeof profile.userPrincipalName === 'string'
      ? profile.userPrincipalName
      : ''
  )
    .trim()
    .toLowerCase();
export const microsoftAvailable = (services: Services): boolean =>
  services.config.MICROSOFT_INTEGRATION_ENABLED === 'true' &&
  !!services.config.MICROSOFT_OAUTH_CLIENT_ID &&
  !!services.config.MICROSOFT_OAUTH_CLIENT_SECRET &&
  !!services.config.MICROSOFT_OAUTH_REDIRECT_URI;
export const microsoftEligible = async (services: Services, userId: string): Promise<boolean> => {
  const user = await services.db.user.findUnique({
    where: { id: userId },
    select: { status: true, deletedAt: true, email: true },
  });
  if (user?.status !== 'ACTIVE' || user.deletedAt !== null) return false;
  return (
    services.config.NODE_ENV !== 'production' ||
    services.config.MICROSOFT_TEST_USER_EMAILS.split(',')
      .map((e) => e.trim().toLowerCase())
      .includes(user.email)
  );
};
export const requireMicrosoftUser = async (services: Services, userId: string): Promise<void> => {
  if (!microsoftAvailable(services))
    throw new ApiError(503, 'MICROSOFT_NOT_CONFIGURED', 'Outlook connection is not available yet.');
  if (!(await microsoftEligible(services, userId)))
    throw new ApiError(
      403,
      'MICROSOFT_TESTING_ONLY',
      'Outlook is currently limited to named ORBIT test accounts.',
    );
};
export const assertMicrosoftScopes = (scope: unknown): void => {
  const scopes =
    typeof scope === 'string'
      ? scope
          .split(/\s+/u)
          .filter(Boolean)
          .map((s) => s.replace(/^https:\/\/graph\.microsoft\.com\//iu, '').toLowerCase())
      : [];
  const allowed = new Set([
    ...microsoftReadonlyScopes.map((s) => s.toLowerCase()),
    'openid',
    'profile',
    'email',
  ]);
  if (
    !['user.read', 'mail.read', 'calendars.read'].every((s) => scopes.includes(s)) ||
    scopes.some((s) => !allowed.has(s))
  )
    throw new ApiError(
      403,
      'MICROSOFT_SCOPE_MISMATCH',
      'Only the approved read-only Microsoft permissions are supported.',
    );
};
export const microsoftTokenRequest = async (
  services: Services,
  parameters: Record<string, string>,
): Promise<Record<string, unknown>> => {
  const response = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    redirect: 'error',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      ...parameters,
      client_id: services.config.MICROSOFT_OAUTH_CLIENT_ID ?? '',
      client_secret: services.config.MICROSOFT_OAUTH_CLIENT_SECRET ?? '',
      scope: microsoftReadonlyScopes.join(' '),
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const value = asRecord(await response.json());
  if (!response.ok)
    throw new ApiError(
      value.error === 'invalid_grant' || value.error === 'interaction_required' ? 409 : 502,
      value.error === 'invalid_grant' || value.error === 'interaction_required'
        ? 'MICROSOFT_RECONNECT_REQUIRED'
        : 'MICROSOFT_OAUTH_FAILED',
      'Microsoft authorization could not finish. Review consent or reconnect this account.',
    );
  if (value.scope !== undefined) assertMicrosoftScopes(value.scope);
  return value;
};
export const markMicrosoftExpired = async (
  services: Services,
  connection: Connection,
): Promise<void> => {
  await services.db.connection.updateMany({
    where: {
      id: connection.id,
      userId: connection.userId,
      provider: ConnectionProvider.MICROSOFT,
      status: ConnectionStatus.ACTIVE,
      deletedAt: null,
      encryptedTokens: connection.encryptedTokens,
    },
    data: { status: ConnectionStatus.EXPIRED, expiredAt: new Date(), reconnectPromptedAt: null },
  });
};
export const microsoftAccessTokenFor = async (
  services: Services,
  connection: Connection,
): Promise<string> => {
  await requireMicrosoftUser(services, connection.userId);
  if (
    connection.provider !== ConnectionProvider.MICROSOFT ||
    connection.status !== ConnectionStatus.ACTIVE ||
    connection.deletedAt !== null
  )
    throw new ApiError(
      409,
      'MICROSOFT_ACCOUNT_UNAVAILABLE',
      'This Microsoft account is disconnected.',
    );
  const current = await services.db.connection.findFirst({
    where: {
      id: connection.id,
      userId: connection.userId,
      provider: ConnectionProvider.MICROSOFT,
      status: ConnectionStatus.ACTIVE,
      deletedAt: null,
      encryptedTokens: connection.encryptedTokens,
    },
    select: { id: true },
  });
  if (!current)
    throw new ApiError(
      409,
      'MICROSOFT_SYNC_CANCELLED',
      'This Microsoft account changed. Retry from its current status.',
    );
  const stored = asRecord(
    JSON.parse(decryptField(connection.encryptedTokens, services.config.FIELD_ENCRYPTION_KEY)),
  );
  if (
    stored.ownerId !== connection.userId ||
    stored.provider !== ConnectionProvider.MICROSOFT ||
    stored.accountKey !== connection.accountKey
  )
    throw new ApiError(
      409,
      'MICROSOFT_TOKEN_ACCOUNT_MISMATCH',
      'This credential does not belong to this Microsoft account.',
    );
  if (
    typeof stored.accessToken === 'string' &&
    typeof stored.expiresAt === 'string' &&
    Date.parse(stored.expiresAt) > Date.now() + 60_000
  )
    return stored.accessToken;
  if (typeof stored.refreshToken !== 'string')
    throw new ApiError(409, 'MICROSOFT_RECONNECT_REQUIRED', 'Reconnect this Microsoft account.');
  let refreshed: Record<string, unknown>;
  try {
    refreshed = await microsoftTokenRequest(services, {
      grant_type: 'refresh_token',
      refresh_token: stored.refreshToken,
    });
  } catch (error: unknown) {
    if (error instanceof ApiError && error.code === 'MICROSOFT_RECONNECT_REQUIRED')
      await markMicrosoftExpired(services, connection);
    throw error;
  }
  if (typeof refreshed.access_token !== 'string')
    throw new ApiError(502, 'MICROSOFT_TOKEN_FAILED', 'Microsoft returned no access token.');
  const expires =
    typeof refreshed.expires_in === 'number' && Number.isFinite(refreshed.expires_in)
      ? Math.min(refreshed.expires_in, 7200)
      : 3600;
  const saved = await services.db.connection.updateMany({
    where: {
      id: connection.id,
      userId: connection.userId,
      provider: ConnectionProvider.MICROSOFT,
      status: ConnectionStatus.ACTIVE,
      deletedAt: null,
      encryptedTokens: connection.encryptedTokens,
    },
    data: {
      encryptedTokens: encryptField(
        JSON.stringify({
          ownerId: connection.userId,
          provider: ConnectionProvider.MICROSOFT,
          accountKey: connection.accountKey,
          refreshToken:
            typeof refreshed.refresh_token === 'string'
              ? refreshed.refresh_token
              : stored.refreshToken,
          accessToken: refreshed.access_token,
          expiresAt: new Date(Date.now() + expires * 1000).toISOString(),
        }),
        services.config.FIELD_ENCRYPTION_KEY,
      ),
    },
  });
  if (saved.count !== 1)
    throw new ApiError(
      409,
      'MICROSOFT_SYNC_CANCELLED',
      'This account changed. No old token was restored.',
    );
  return refreshed.access_token;
};

/** Token-bearing requests are restricted to this user's Graph v1.0 resources, including nextLink. */
export const microsoftJson = async (
  path: string,
  accessToken: string,
): Promise<Record<string, unknown>> => {
  let url: URL;
  try {
    url = new URL(path.startsWith('https://') ? path : 'https://graph.microsoft.com/v1.0' + path);
  } catch {
    throw new ApiError(502, 'MICROSOFT_PAGE_INVALID', 'Microsoft returned an unsupported page.');
  }
  if (
    url.origin !== 'https://graph.microsoft.com' ||
    !/^\/v1\.0\/me(?:\/|$)/u.test(url.pathname) ||
    url.username ||
    url.password
  )
    throw new ApiError(502, 'MICROSOFT_PAGE_INVALID', 'Microsoft returned an unsupported page.');
  const response = await fetch(url.toString(), {
    redirect: 'error',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Prefer: 'IdType="ImmutableId", outlook.body-content-type="text", outlook.timezone="UTC"',
    },
    signal: AbortSignal.timeout(10_000),
  });
  const body = asRecord(await response.json());
  if (!response.ok) {
    const code =
      response.status === 401
        ? 'MICROSOFT_RECONNECT_REQUIRED'
        : response.status === 404
          ? 'MICROSOFT_MESSAGE_GONE'
          : response.status === 429 || response.status >= 500
            ? 'MICROSOFT_READ_RETRY'
            : 'MICROSOFT_PERMISSION_REQUIRED';
    throw new ApiError(
      response.status === 404
        ? 404
        : response.status === 401
          ? 409
          : response.status === 403
            ? 403
            : 503,
      code,
      'Microsoft could not complete this read. Reconnect or retry this account.',
    );
  }
  return body;
};
export const microsoftMessagePath = (id: string, full: boolean): string =>
  '/me/messages/' +
  encodeURIComponent(id) +
  '?$select=' +
  [
    'id',
    'subject',
    'from',
    'toRecipients',
    'receivedDateTime',
    'sentDateTime',
    'conversationId',
    'parentFolderId',
    'isDraft',
    'importance',
    'webLink',
    ...(full ? ['body'] : []),
  ].join(',');
export const microsoftMessageText = (message: Record<string, unknown>): string => {
  const body = asRecord(message.body);
  // Graph honors the text preference. Fail closed if a provider returns unsupported HTML.
  return body.contentType === 'text' && typeof body.content === 'string'
    ? body.content.slice(0, 8000)
    : '';
};
export const microsoftSourceUrl = (message: Record<string, unknown>, fallback: string): string => {
  if (typeof message.webLink === 'string') {
    try {
      const url = new URL(message.webLink);
      if (
        url.protocol === 'https:' &&
        ['outlook.live.com', 'outlook.office.com', 'outlook.office365.com'].includes(url.hostname)
      )
        return url.toString();
    } catch {
      /* untrusted provider URL */
    }
  }
  return `https://outlook.office.com/mail/deeplink/read/${encodeURIComponent(fallback)}`;
};
export const microsoftCalendarSync = async (
  services: Services,
  connection: Connection,
  accessToken: string,
  save: (data: Prisma.SourceDocumentUpsertArgs) => Promise<unknown>,
  sweep: (where: Prisma.SourceDocumentWhereInput) => Promise<void>,
): Promise<number> => {
  const start = new Date(Date.now() - 86_400_000),
    end = new Date(Date.now() + 14 * 86_400_000);
  const params = new URLSearchParams({
    startDateTime: start.toISOString(),
    endDateTime: end.toISOString(),
    $top: '250',
    $select: 'id,subject,start,end,isAllDay,isCancelled,webLink,iCalUId',
  });
  const page = await microsoftJson('/me/calendarView?' + params.toString(), accessToken);
  const events = Array.isArray(page.value) ? page.value.map(asRecord) : [];
  const seen: string[] = [];
  for (const event of events) {
    if (typeof event.id !== 'string') continue;
    const externalId = scopedExternalId(connection, event.id);
    seen.push(externalId);
    const from = asRecord(event.start),
      to = asRecord(event.end);
    const utc = (value: unknown): string | null =>
      typeof value === 'string' &&
      Number.isFinite(
        Date.parse(value.endsWith('Z') || /[+-]\d{2}:\d{2}$/u.test(value) ? value : value + 'Z'),
      )
        ? value.endsWith('Z') || /[+-]\d{2}:\d{2}$/u.test(value)
          ? value
          : value + 'Z'
        : null;
    const begin = utc(from.dateTime),
      finish = utc(to.dateTime);
    if (!begin || !finish) continue;
    const title =
      typeof event.subject === 'string' ? event.subject.slice(0, 500) : '(Untitled event)';
    const metadata = {
      start: begin,
      end: finish,
      allDay: event.isAllDay === true,
      startDate: event.isAllDay === true ? begin.slice(0, 10) : null,
      endDate: event.isAllDay === true ? finish.slice(0, 10) : null,
      status: event.isCancelled === true ? 'cancelled' : 'confirmed',
      iCalUID: typeof event.iCalUId === 'string' ? event.iCalUId : null,
    };
    const data = {
      connectionId: connection.id,
      title,
      sourceUrl:
        typeof event.webLink === 'string'
          ? microsoftSourceUrl(event, event.id)
          : 'https://outlook.office.com/calendar/view/month',
      occurredAt: new Date(begin),
      body: '',
      metadata,
      lastSyncedAt: new Date(),
      deletedAt: null,
    };
    await save({
      where: {
        userId_kind_externalId: {
          userId: connection.userId,
          kind: SourceDocumentKind.MICROSOFT_CALENDAR_EVENT,
          externalId,
        },
      },
      update: data,
      create: {
        ...data,
        userId: connection.userId,
        kind: SourceDocumentKind.MICROSOFT_CALENDAR_EVENT,
        externalId,
      },
    });
  }
  if (!page['@odata.nextLink'])
    await sweep({
      userId: connection.userId,
      connectionId: connection.id,
      kind: SourceDocumentKind.MICROSOFT_CALENDAR_EVENT,
      occurredAt: { gte: start, lt: end },
      externalId: { notIn: seen },
      deletedAt: null,
    });
  return events.length;
};
