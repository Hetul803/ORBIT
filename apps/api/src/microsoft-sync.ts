import { randomUUID } from 'node:crypto';
import {
  ConnectionProvider,
  ConnectionStatus,
  SourceDocumentKind,
  type Connection,
  type Prisma,
} from '@orbit/db';
import type { FastifyInstance } from 'fastify';
import type { Services } from './services.js';
import { ApiError } from './errors.js';
import { asRecord, logActivity } from './routes/helpers.js';
import { derivedEmailSignals, emailAddress } from './google-read.js';
import { refreshLifeItems } from './life.js';
import { categoryForLabels } from './mail-categories.js';
import { scopedExternalId, sourceInboxKey } from './linked-accounts.js';
import {
  requireMicrosoftUser,
  microsoftAccessTokenFor,
  microsoftCalendarSync,
  microsoftJson,
  microsoftMessagePath,
  microsoftMessageText,
  microsoftSourceUrl,
  markMicrosoftExpired,
  microsoftProfileEmail,
} from './microsoft-read.js';

const activePhases = [
  'queued',
  'authorizing',
  'reading_mail',
  'reading_calendar',
  'building_catch',
  'retrying',
];
const leaseMs = 180_000;
interface State {
  version: 1;
  phase: 'authorizing' | 'reading_mail' | 'reading_calendar' | 'building_catch';
  pageUrl: string;
  ids: string[];
  index: number;
  processed: number;
  nextUrl: string | null;
  accountEmail: string;
  sentFolder: string;
  junkFolder: string;
  deletedFolder: string;
  bounded: boolean;
  pagesRead: number;
}
const initial = (): State => ({
  version: 1,
  phase: 'authorizing',
  pageUrl: '',
  ids: [],
  index: 0,
  processed: 0,
  nextUrl: null,
  accountEmail: '',
  sentFolder: '',
  junkFolder: '',
  deletedFolder: '',
  bounded: false,
  pagesRead: 0,
});
const stateFor = (value: unknown): State => {
  const record = asRecord(value);
  if (record.version !== 1) return initial();
  return {
    ...initial(),
    phase: ['authorizing', 'reading_mail', 'reading_calendar', 'building_catch'].includes(
      String(record.phase),
    )
      ? (record.phase as State['phase'])
      : 'authorizing',
    pageUrl: typeof record.pageUrl === 'string' ? record.pageUrl : '',
    ids: Array.isArray(record.ids)
      ? record.ids.filter((id): id is string => typeof id === 'string').slice(0, 20)
      : [],
    index: typeof record.index === 'number' ? Math.max(0, Math.min(record.index, 20)) : 0,
    processed:
      typeof record.processed === 'number' ? Math.max(0, Math.min(record.processed, 2500)) : 0,
    nextUrl: typeof record.nextUrl === 'string' ? record.nextUrl : null,
    accountEmail: typeof record.accountEmail === 'string' ? record.accountEmail : '',
    sentFolder: typeof record.sentFolder === 'string' ? record.sentFolder : '',
    junkFolder: typeof record.junkFolder === 'string' ? record.junkFolder : '',
    deletedFolder: typeof record.deletedFolder === 'string' ? record.deletedFolder : '',
    bounded: record.bounded === true,
    pagesRead: typeof record.pagesRead === 'number' ? Math.max(0, record.pagesRead) : 0,
  };
};
const guard = (connection: Connection, lease: string): Prisma.ConnectionWhereInput => ({
  id: connection.id,
  userId: connection.userId,
  provider: ConnectionProvider.MICROSOFT,
  syncRunId: connection.syncRunId,
  syncLeaseToken: lease,
  status: ConnectionStatus.ACTIVE,
  deletedAt: null,
  user: { status: 'ACTIVE', deletedAt: null },
});
const json = (state: State): Prisma.InputJsonValue => ({ ...state });
export const queueMicrosoftSync = async (
  services: Services,
  userId: string,
  connectionId: string,
): Promise<{ runId: string; alreadyRunning: boolean }> => {
  await requireMicrosoftUser(services, userId);
  return services.db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${`microsoft-sync:${userId}:${connectionId}`}))`;
    const connection = await tx.connection.findFirst({
      where: {
        id: connectionId,
        userId,
        provider: ConnectionProvider.MICROSOFT,
        status: ConnectionStatus.ACTIVE,
        deletedAt: null,
      },
    });
    if (!connection)
      throw new ApiError(
        409,
        'MICROSOFT_NOT_CONNECTED',
        'Connect this Microsoft account before syncing.',
      );
    if (connection.syncRunId && activePhases.includes(connection.syncStatus))
      return { runId: connection.syncRunId, alreadyRunning: true };
    const resume =
      connection.syncStatus === 'error' && asRecord(connection.syncState).version === 1;
    const runId = randomUUID();
    await tx.connection.update({
      where: { id: connection.id },
      data: {
        syncRunId: runId,
        syncStatus: 'queued',
        syncState: json(resume ? stateFor(connection.syncState) : initial()),
        syncProcessed: resume ? connection.syncProcessed : 0,
        syncTotal: null,
        syncStartedAt: resume ? connection.syncStartedAt : new Date(),
        syncLeaseToken: null,
        syncLeaseUntil: null,
        syncNextAttemptAt: new Date(),
        syncAttempts: 0,
        syncErrorCode: null,
      },
    });
    return { runId, alreadyRunning: false };
  });
};
/** Twenty owned messages per lease; only IDs/progress survive in checkpoints, never message bodies. */
export const runMicrosoftSyncTick = async (services: Services): Promise<boolean> => {
  if (services.config.MICROSOFT_INTEGRATION_ENABLED !== 'true') return false;
  const now = new Date();
  const candidate = await services.db.connection.findFirst({
    where: {
      provider: ConnectionProvider.MICROSOFT,
      status: ConnectionStatus.ACTIVE,
      deletedAt: null,
      user: { status: 'ACTIVE', deletedAt: null },
      syncStatus: { in: activePhases },
      AND: [
        { OR: [{ syncLeaseUntil: null }, { syncLeaseUntil: { lt: now } }] },
        { OR: [{ syncNextAttemptAt: null }, { syncNextAttemptAt: { lte: now } }] },
      ],
    },
    orderBy: { updatedAt: 'asc' },
  });
  if (!candidate) return false;
  const lease = randomUUID();
  const claimed = await services.db.connection.updateMany({
    where: {
      id: candidate.id,
      userId: candidate.userId,
      provider: ConnectionProvider.MICROSOFT,
      updatedAt: candidate.updatedAt,
      status: ConnectionStatus.ACTIVE,
      deletedAt: null,
      syncStatus: { in: activePhases },
      OR: [{ syncLeaseUntil: null }, { syncLeaseUntil: { lt: now } }],
    },
    data: { syncLeaseToken: lease, syncLeaseUntil: new Date(Date.now() + leaseMs) },
  });
  if (!claimed.count) return false;
  const state = stateFor(candidate.syncState),
    requestId = `microsoft-sync:${candidate.syncRunId ?? 'legacy'}`;
  const checkpoint = async (release = false) =>
    (
      await services.db.connection.updateMany({
        where: guard(candidate, lease),
        data: {
          syncState: json(state),
          syncStatus: state.phase,
          syncProcessed: state.processed,
          syncTotal: null,
          syncAttempts: 0,
          syncErrorCode: null,
          syncNextAttemptAt: new Date(),
          syncLeaseToken: release ? null : lease,
          syncLeaseUntil: release ? null : new Date(Date.now() + leaseMs),
        },
      })
    ).count === 1;
  try {
    const access = await microsoftAccessTokenFor(services, candidate);
    if (state.phase === 'authorizing') {
      const [profile, sent, junk, deleted] = await Promise.all([
        microsoftJson('/me?$select=id,mail,userPrincipalName', access),
        microsoftJson('/me/mailFolders/sentitems?$select=id', access),
        microsoftJson('/me/mailFolders/junkemail?$select=id', access),
        microsoftJson('/me/mailFolders/deleteditems?$select=id', access),
      ]);
      state.accountEmail = microsoftProfileEmail(profile);
      if (!state.accountEmail || state.accountEmail !== candidate.accountEmail)
        throw new ApiError(
          409,
          'MICROSOFT_ACCOUNT_MISMATCH',
          'Microsoft returned a different account. Reconnect the intended mailbox.',
        );
      state.sentFolder = typeof sent.id === 'string' ? sent.id : '';
      state.junkFolder = typeof junk.id === 'string' ? junk.id : '';
      state.deletedFolder = typeof deleted.id === 'string' ? deleted.id : '';
      if (!state.sentFolder || !state.junkFolder || !state.deletedFolder)
        throw new ApiError(
          502,
          'MICROSOFT_FOLDERS_UNAVAILABLE',
          'Microsoft folder identities were unavailable. Retry this account.',
        );
      const params = new URLSearchParams({
        $top: '20',
        $filter: `receivedDateTime ge ${new Date(Date.now() - 90 * 86_400_000).toISOString()}`,
        $orderby: 'receivedDateTime desc',
        $select: 'id',
      });
      state.pageUrl = '/me/messages?' + params.toString();
      state.phase = 'reading_mail';
      if (!(await checkpoint())) return true;
    }
    if (state.phase === 'reading_mail') {
      if (!state.ids.length) {
        if (state.pagesRead >= 130)
          throw new ApiError(
            502,
            'MICROSOFT_PAGE_LIMIT',
            'The Microsoft import reached its bounded page limit.',
          );
        const page = await microsoftJson(state.pageUrl, access);
        state.pagesRead += 1;
        state.ids = Array.isArray(page.value)
          ? [
              ...new Set(
                page.value
                  .map(asRecord)
                  .map((m) => m.id)
                  .filter((id): id is string => typeof id === 'string'),
              ),
            ].slice(0, 20)
          : [];
        state.index = 0;
        state.nextUrl =
          typeof page['@odata.nextLink'] === 'string' ? page['@odata.nextLink'] : null;
        if (state.nextUrl === state.pageUrl)
          throw new ApiError(502, 'MICROSOFT_PAGE_INVALID', 'Microsoft returned a repeated page.');
        if (!(await checkpoint())) return true;
      }
      while (state.index < state.ids.length && state.processed < 2500) {
        const rawId = state.ids[state.index];
        if (!rawId) break;
        const externalId = scopedExternalId(candidate, rawId);
        const existing = await services.db.sourceDocument.findUnique({
          where: {
            userId_kind_externalId: {
              userId: candidate.userId,
              kind: SourceDocumentKind.OUTLOOK_MESSAGE,
              externalId,
            },
          },
        });
        let message: Record<string, unknown> | null = null;
        try {
          message = await microsoftJson(microsoftMessagePath(rawId, !existing), access);
        } catch (error: unknown) {
          if (!(error instanceof ApiError && error.code === 'MICROSOFT_MESSAGE_GONE')) throw error;
        }
        const from = asRecord(asRecord(message?.from).emailAddress);
        const sender =
          typeof from.address === 'string'
            ? `${typeof from.name === 'string' ? from.name : ''} <${from.address}>`.trim()
            : '';
        const outbound =
          message?.parentFolderId === state.sentFolder ||
          emailAddress(sender) === state.accountEmail;
        const labels: string[] =
          message?.parentFolderId === state.junkFolder
            ? ['SPAM']
            : message?.parentFolderId === state.deletedFolder
              ? ['TRASH']
              : message?.importance === 'high'
                ? ['IMPORTANT']
                : [];
        if (outbound) labels.push('SENT');
        const title =
          typeof message?.subject === 'string' ? message.subject.slice(0, 500) : '(No subject)';
        const occurredAt =
          typeof message?.receivedDateTime === 'string' &&
          Number.isFinite(Date.parse(message.receivedDateTime))
            ? new Date(message.receivedDateTime)
            : null;
        const committed = await services.db.$transaction(async (tx) => {
          const current = await tx.connection.updateMany({
            where: guard(candidate, lease),
            data: { syncLeaseUntil: new Date(Date.now() + leaseMs) },
          });
          if (!current.count) return false;
          if (message && message.isDraft !== true && !labels.includes('TRASH')) {
            const data = {
              connectionId: candidate.id,
              title,
              sender: sender || null,
              sourceUrl: microsoftSourceUrl(message, rawId),
              occurredAt,
              direction: outbound ? ('OUTBOUND' as const) : ('INBOUND' as const),
              body: '',
              metadata: {
                labels,
                category: categoryForLabels(labels, outbound),
                derived: existing
                  ? (asRecord(asRecord(existing.metadata).derived) as Prisma.InputJsonObject)
                  : derivedEmailSignals(microsoftMessageText(message)),
              },
              lastSyncedAt: new Date(),
              deletedAt: null,
            };
            await tx.sourceDocument.upsert({
              where: {
                userId_kind_externalId: {
                  userId: candidate.userId,
                  kind: SourceDocumentKind.OUTLOOK_MESSAGE,
                  externalId,
                },
              },
              update: data,
              create: {
                ...data,
                userId: candidate.userId,
                kind: SourceDocumentKind.OUTLOOK_MESSAGE,
                externalId,
                threadId:
                  typeof message.conversationId === 'string'
                    ? scopedExternalId(candidate, message.conversationId)
                    : null,
              },
            });
            if (!outbound) {
              const kind = sourceInboxKey(SourceDocumentKind.OUTLOOK_MESSAGE, externalId);
              if (
                !(await tx.inboxItem.findFirst({
                  where: { recipientUserId: candidate.userId, kind },
                }))
              )
                await tx.inboxItem.create({
                  data: {
                    recipientUserId: candidate.userId,
                    kind,
                    subject: title,
                    body: `From: ${sender}\n\nOpen the original in this Microsoft account. ORBIT does not retain Outlook email bodies.`,
                    triage: 'HELD',
                  },
                });
            }
          } else if (existing)
            await tx.sourceDocument.update({
              where: { id: existing.id },
              data: { deletedAt: new Date() },
            });
          await tx.connection.updateMany({
            where: guard(candidate, lease),
            data: {
              syncState: json({ ...state, index: state.index + 1, processed: state.processed + 1 }),
              syncProcessed: state.processed + 1,
            },
          });
          return true;
        });
        if (!committed) return true;
        state.index += 1;
        state.processed += 1;
      }
      if (state.processed >= 2500) {
        state.bounded = !!state.nextUrl || state.index < state.ids.length;
        state.phase = 'reading_calendar';
      } else if (state.nextUrl) {
        state.pageUrl = state.nextUrl;
        state.ids = [];
        state.index = 0;
      } else state.phase = 'reading_calendar';
      await refreshLifeItems(services, candidate.userId, requestId, false);
      if (!(await checkpoint(true))) return true;
    } else if (state.phase === 'reading_calendar') {
      await microsoftCalendarSync(
        services,
        candidate,
        access,
        (data) =>
          services.db.$transaction(async (tx) => {
            if (
              !(
                await tx.connection.updateMany({
                  where: guard(candidate, lease),
                  data: { syncLeaseUntil: new Date(Date.now() + leaseMs) },
                })
              ).count
            )
              throw new ApiError(409, 'MICROSOFT_SYNC_CANCELLED', 'This account was disconnected.');
            return tx.sourceDocument.upsert(data);
          }),
        (where) =>
          services.db.$transaction(async (tx) => {
            if (
              !(
                await tx.connection.updateMany({
                  where: guard(candidate, lease),
                  data: { syncLeaseUntil: new Date(Date.now() + leaseMs) },
                })
              ).count
            )
              throw new ApiError(409, 'MICROSOFT_SYNC_CANCELLED', 'This account was disconnected.');
            await tx.sourceDocument.updateMany({ where, data: { deletedAt: new Date() } });
          }),
      );
      state.phase = 'building_catch';
      if (!(await checkpoint(true))) return true;
    } else {
      await refreshLifeItems(services, candidate.userId, requestId, false);
      const done = await services.db.connection.updateMany({
        where: guard(candidate, lease),
        data: {
          syncStatus: 'idle',
          syncState: json(state),
          syncLeaseToken: null,
          syncLeaseUntil: null,
          syncNextAttemptAt: null,
          syncAttempts: 0,
          syncErrorCode: null,
          lastSyncedAt: new Date(),
        },
      });
      if (done.count)
        await logActivity(services.db, {
          userId: candidate.userId,
          actorType: 'SYSTEM',
          action: 'connection.microsoft_synced',
          targetType: 'Connection',
          targetId: candidate.id,
          payload: { examined: state.processed, bounded: state.bounded, daysRead: 90 },
          requestId,
        });
    }
  } catch (error: unknown) {
    const code = error instanceof ApiError ? error.code : 'MICROSOFT_READ_RETRY';
    if (code === 'MICROSOFT_RECONNECT_REQUIRED') {
      const latest = await services.db.connection.findFirst({
        where: {
          id: candidate.id,
          userId: candidate.userId,
          provider: ConnectionProvider.MICROSOFT,
          status: 'ACTIVE',
          deletedAt: null,
        },
      });
      if (latest) await markMicrosoftExpired(services, latest);
    }
    const attempts = candidate.syncAttempts + 1,
      terminal = code !== 'MICROSOFT_READ_RETRY' || attempts >= 5;
    await services.db.connection.updateMany({
      where: {
        id: candidate.id,
        userId: candidate.userId,
        provider: ConnectionProvider.MICROSOFT,
        syncRunId: candidate.syncRunId,
        syncLeaseToken: lease,
        deletedAt: null,
        status: { in: [ConnectionStatus.ACTIVE, ConnectionStatus.EXPIRED] },
      },
      data: {
        syncStatus: terminal ? 'error' : 'retrying',
        syncState: json(state),
        syncAttempts: attempts,
        syncErrorCode: code,
        syncLeaseToken: null,
        syncLeaseUntil: null,
        syncNextAttemptAt: terminal
          ? null
          : new Date(Date.now() + Math.min(120_000, 2000 * 2 ** attempts)),
      },
    });
    await logActivity(services.db, {
      userId: candidate.userId,
      actorType: 'SYSTEM',
      action: terminal ? 'connection.microsoft_sync_stopped' : 'connection.microsoft_sync_retrying',
      targetType: 'Connection',
      targetId: candidate.id,
      payload: { code, attempts },
      requestId,
    });
  }
  services.realtime.publish(candidate.userId, { type: 'microsoft.sync_progress', payload: {} });
  return true;
};
export const registerMicrosoftSyncRunner = (app: FastifyInstance, services: Services): void => {
  if (
    services.config.NODE_ENV === 'test' ||
    services.config.MICROSOFT_INTEGRATION_ENABLED !== 'true'
  )
    return;
  let stopped = false,
    inFlight: Promise<unknown> | null = null;
  const tick = () => {
    if (stopped || inFlight) return;
    inFlight = runMicrosoftSyncTick(services)
      .catch(() => app.log.error({ event: 'microsoft.sync_runner_failed' }))
      .finally(() => {
        inFlight = null;
      });
  };
  const timer = setInterval(tick, 5000);
  timer.unref();
  app.addHook('onReady', (done) => {
    tick();
    done();
  });
  app.addHook('onClose', async () => {
    stopped = true;
    clearInterval(timer);
    await inFlight;
  });
};
