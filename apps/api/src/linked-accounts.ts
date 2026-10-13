import {
  ConnectionProvider,
  ConnectionStatus,
  SourceDocumentKind,
  type Connection,
  type Prisma,
} from '@orbit/db';
import { ApiError } from './errors.js';
import { encryptField } from './crypto.js';
import type { Services } from './services.js';
export const accountModelContextAvailable = (services: Services): boolean =>
  services.config.NODE_ENV === 'test' || services.config.ACCOUNT_MODEL_CONTEXT_ENABLED === 'true';
export const requireAccountModelContext = (services: Services): void => {
  if (!accountModelContextAvailable(services))
    throw new ApiError(
      503,
      'ACCOUNT_CONTEXT_NOT_READY',
      'Account-aware chat and reply drafting are not available yet. You can still chat with your saved profile or open the original source.',
    );
};

export const emailKinds: SourceDocumentKind[] = [
  SourceDocumentKind.GMAIL_MESSAGE,
  SourceDocumentKind.OUTLOOK_MESSAGE,
];
export const calendarKinds: SourceDocumentKind[] = [
  SourceDocumentKind.GOOGLE_CALENDAR_EVENT,
  SourceDocumentKind.MICROSOFT_CALENDAR_EVENT,
];
export const sourceProvider = (kind: SourceDocumentKind): ConnectionProvider =>
  kind === SourceDocumentKind.GMAIL_MESSAGE || kind === SourceDocumentKind.GOOGLE_CALENDAR_EVENT
    ? ConnectionProvider.GOOGLE
    : ConnectionProvider.MICROSOFT;
export const providerName = (provider: ConnectionProvider): 'google' | 'microsoft' =>
  provider === ConnectionProvider.GOOGLE ? 'google' : 'microsoft';
export const sourceInboxKey = (kind: SourceDocumentKind, externalId: string): string =>
  `${kind === SourceDocumentKind.GMAIL_MESSAGE ? 'gmail' : 'outlook'}:${externalId}`;
export const scopedExternalId = (
  connection: Pick<Connection, 'id' | 'provider' | 'accountKey'>,
  rawId: string,
): string =>
  connection.provider === ConnectionProvider.GOOGLE && connection.accountKey === 'primary'
    ? rawId
    : `${connection.id}:${rawId}`;
export const originalMessageId = (
  connection: Pick<Connection, 'id' | 'provider' | 'accountKey'>,
  externalId: string,
): string => {
  if (connection.provider === ConnectionProvider.GOOGLE && connection.accountKey === 'primary')
    return externalId;
  if (!externalId.startsWith(connection.id + ':'))
    throw new ApiError(409, 'MAIL_ACCOUNT_MISMATCH', 'This email is not bound to that account.');
  return externalId.slice(connection.id.length + 1);
};
export const scopedThreadKey = (source: {
  id: string;
  kind: SourceDocumentKind;
  connectionId?: string | null;
  threadId: string | null;
}): string =>
  `${source.kind}:${source.connectionId ?? 'legacy-google'}:${source.threadId ?? source.id}`;

/** A source's kind, owner and active connection must agree. Legacy unbound Google fixtures remain supported. */
export const activeAccountSources = (userId: string): Prisma.SourceDocumentWhereInput => ({
  userId,
  deletedAt: null,
  OR: [
    {
      connectionId: null,
      kind: { in: [SourceDocumentKind.GMAIL_MESSAGE, SourceDocumentKind.GOOGLE_CALENDAR_EVENT] },
    },
    {
      kind: { in: [SourceDocumentKind.GMAIL_MESSAGE, SourceDocumentKind.GOOGLE_CALENDAR_EVENT] },
      connection: {
        userId,
        provider: ConnectionProvider.GOOGLE,
        status: ConnectionStatus.ACTIVE,
        deletedAt: null,
      },
    },
    {
      kind: {
        in: [SourceDocumentKind.OUTLOOK_MESSAGE, SourceDocumentKind.MICROSOFT_CALENDAR_EVENT],
      },
      connection: {
        userId,
        provider: ConnectionProvider.MICROSOFT,
        status: ConnectionStatus.ACTIVE,
        deletedAt: null,
      },
    },
  ],
});
export const accountSourceSelect = { id: true, accountEmail: true, provider: true } as const;
export const sourceAccountDto = (source: {
  kind: SourceDocumentKind;
  connectionId: string | null;
  connection: { accountEmail: string | null; provider: ConnectionProvider } | null;
}) => ({
  connectionId: source.connectionId,
  provider: providerName(sourceProvider(source.kind)),
  accountEmail: source.connection?.accountEmail ?? null,
});
export const requireOwnedAccount = async (
  services: Services,
  userId: string,
  id: string,
  provider?: ConnectionProvider,
): Promise<Connection> => {
  const account = await services.db.connection.findFirst({
    where: { id, userId, deletedAt: null, ...(provider ? { provider } : {}) },
  });
  if (!account)
    throw new ApiError(404, 'MAIL_ACCOUNT_UNAVAILABLE', 'That connected account is unavailable.');
  return account;
};
export const lockAccountData = async (
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<void> => {
  await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${`account-data:${userId}`}))`;
};
/** Local disconnect is immediate and atomic; it never touches another provider/account. */
export const disconnectAccount = async (
  services: Services,
  userId: string,
  id: string,
  provider: ConnectionProvider,
): Promise<void> => {
  await services.db.$transaction(async (tx) => {
    await lockAccountData(tx, userId);
    const connection = await tx.connection.findFirst({
      where: { id, userId, provider, deletedAt: null },
    });
    if (!connection)
      throw new ApiError(404, 'MAIL_ACCOUNT_UNAVAILABLE', 'That connected account is unavailable.');
    const now = new Date();
    const kinds =
      provider === ConnectionProvider.GOOGLE
        ? [SourceDocumentKind.GMAIL_MESSAGE, SourceDocumentKind.GOOGLE_CALENDAR_EVENT]
        : [SourceDocumentKind.OUTLOOK_MESSAGE, SourceDocumentKind.MICROSOFT_CALENDAR_EVENT];
    await tx.connection.update({
      where: { id },
      data: {
        status: ConnectionStatus.REVOKED,
        deletedAt: now,
        encryptedTokens: encryptField('{}', services.config.FIELD_ENCRYPTION_KEY),
        syncStatus: 'idle',
        syncRunId: null,
        syncState: {},
        syncLeaseToken: null,
        syncLeaseUntil: null,
        syncNextAttemptAt: null,
      },
    });
    const sources = await tx.sourceDocument.findMany({
      where: { userId, connectionId: id, kind: { in: kinds } },
      select: { id: true, kind: true, externalId: true },
    });
    await tx.sourceDocument.updateMany({
      where: { userId, connectionId: id, kind: { in: kinds } },
      data: { deletedAt: now },
    });
    await tx.inboxItem.updateMany({
      where: {
        recipientUserId: userId,
        kind: {
          in: sources
            .filter((s) => emailKinds.includes(s.kind))
            .map((s) => sourceInboxKey(s.kind, s.externalId)),
        },
      },
      data: { deletedAt: now },
    });
    const ids = new Set(sources.map((s) => s.id));
    const life = await tx.lifeItem.findMany({
      where: { userId, deletedAt: null },
      select: { id: true, evidence: true },
    });
    const affected = life
      .filter(
        (item) =>
          Array.isArray(item.evidence) &&
          item.evidence.some(
            (e) =>
              typeof e === 'object' &&
              e !== null &&
              'sourceId' in e &&
              typeof e.sourceId === 'string' &&
              ids.has(e.sourceId),
          ),
      )
      .map((item) => item.id);
    await tx.lifeItem.updateMany({
      where: { userId, id: { in: affected } },
      data: { deletedAt: now },
    });
  });
};
