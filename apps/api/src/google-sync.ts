import { randomUUID } from 'node:crypto';
import {
  ConnectionProvider,
  ConnectionStatus,
  InboxTriage,
  SourceDocumentDirection,
  SourceDocumentKind,
  queuePush,
  type Prisma,
  type Connection,
} from '@orbit/db';
import type { FastifyInstance } from 'fastify';
import { ApiError } from './errors.js';
import { refreshLifeItems } from './life.js';
import { categoryForLabels } from './mail-categories.js';
import type { Services } from './services.js';
import { asRecord, logActivity } from './routes/helpers.js';
import {
  accessTokenFor,
  derivedEmailSignals,
  emailAddress,
  gmailJson,
  gmailMessagesForCatch,
  gmailMessageSourceUrl,
  headerValue,
  parseMessageDate,
  plainBody,
  requireAvailable,
  requireGoogleUser,
  ruleMatches,
  syncCalendar,
} from './google-read.js';

const activePhases = [
  'queued',
  'authorizing',
  'reading_mail',
  'reading_calendar',
  'building_catch',
  'retrying',
];
const leaseMs = 180_000;
interface SyncState {
  version: 1;
  phase: 'authorizing' | 'reading_mail' | 'reading_calendar' | 'building_catch';
  messageIds: string[];
  index: number;
  accountEmail: string;
  imported: number;
  calendarImported: number;
  bounded: boolean;
}
const newState = (): SyncState => ({
  version: 1,
  phase: 'authorizing',
  messageIds: [],
  index: 0,
  accountEmail: '',
  imported: 0,
  calendarImported: 0,
  bounded: false,
});
const stateFor = (value: unknown): SyncState => {
  const s = asRecord(value);
  if (s.version !== 1) return newState();
  return {
    version: 1,
    phase: ['authorizing', 'reading_mail', 'reading_calendar', 'building_catch'].includes(
      String(s.phase),
    )
      ? (s.phase as SyncState['phase'])
      : 'authorizing',
    messageIds: Array.isArray(s.messageIds)
      ? s.messageIds.filter((id): id is string => typeof id === 'string').slice(0, 2500)
      : [],
    index: typeof s.index === 'number' ? s.index : 0,
    accountEmail: typeof s.accountEmail === 'string' ? s.accountEmail : '',
    imported: typeof s.imported === 'number' ? s.imported : 0,
    calendarImported: typeof s.calendarImported === 'number' ? s.calendarImported : 0,
    bounded: s.bounded === true,
  };
};
const jsonState = (state: SyncState): Prisma.InputJsonValue => ({ ...state });

export const queueGoogleSync = async (
  services: Services,
  userId: string,
  connectionId?: string,
): Promise<{ runId: string; alreadyRunning: boolean }> => {
  requireAvailable(services);
  await requireGoogleUser(services, userId);
  return services.db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${`google-sync:${userId}`}))`;
    const connection = await tx.connection.findFirst({
      where: {
        userId,
        ...(connectionId === undefined ? {} : { id: connectionId }),
        provider: ConnectionProvider.GOOGLE,
        status: ConnectionStatus.ACTIVE,
        deletedAt: null,
      },
    });
    if (!connection)
      throw new ApiError(409, 'GMAIL_NOT_CONNECTED', 'Connect Google before syncing.');
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
        syncState: resume ? jsonState(stateFor(connection.syncState)) : jsonState(newState()),
        syncStartedAt: resume ? connection.syncStartedAt : new Date(),
        syncProcessed: resume ? connection.syncProcessed : 0,
        syncTotal: resume ? connection.syncTotal : null,
        syncAttempts: 0,
        syncErrorCode: null,
        syncLeaseToken: null,
        syncLeaseUntil: null,
        syncNextAttemptAt: new Date(),
      },
    });
    return { runId, alreadyRunning: false };
  });
};

const guard = (connection: Connection, lease: string): Prisma.ConnectionWhereInput => ({
  id: connection.id,
  syncRunId: connection.syncRunId,
  syncLeaseToken: lease,
  status: ConnectionStatus.ACTIVE,
  deletedAt: null,
  user: { status: 'ACTIVE', deletedAt: null },
});
const checkpoint = async (
  services: Services,
  connection: Connection,
  lease: string,
  state: SyncState,
  release = false,
): Promise<boolean> => {
  const changed = await services.db.connection.updateMany({
    where: guard(connection, lease),
    data: {
      syncState: jsonState(state),
      syncStatus: state.phase,
      syncProcessed: state.index,
      syncTotal: state.phase === 'authorizing' ? null : state.messageIds.length,
      syncAttempts: 0,
      syncErrorCode: null,
      syncNextAttemptAt: new Date(),
      syncLeaseToken: release ? null : lease,
      syncLeaseUntil: release ? null : new Date(Date.now() + leaseMs),
    },
  });
  return changed.count === 1;
};

/** One bounded durable batch. No mobile request owns its execution. Leases survive process restarts. */
export const runGoogleSyncTick = async (services: Services): Promise<boolean> => {
  if (services.config.GMAIL_INTEGRATION_ENABLED !== 'true') return false;
  const now = new Date();
  const candidates = await services.db.connection.findMany({
    where: {
      provider: ConnectionProvider.GOOGLE,
      status: ConnectionStatus.ACTIVE,
      deletedAt: null,
      user: { status: 'ACTIVE', deletedAt: null },
      syncStatus: { in: activePhases },
      AND: [
        { OR: [{ syncNextAttemptAt: null }, { syncNextAttemptAt: { lte: now } }] },
        { OR: [{ syncLeaseUntil: null }, { syncLeaseUntil: { lt: now } }] },
      ],
    },
    orderBy: { updatedAt: 'asc' },
    take: 5,
  });
  for (const candidate of candidates) {
    const lease = randomUUID();
    const claimed = await services.db.connection.updateMany({
      where: {
        id: candidate.id,
        updatedAt: candidate.updatedAt,
        syncRunId: candidate.syncRunId,
        status: ConnectionStatus.ACTIVE,
        deletedAt: null,
        syncStatus: { in: activePhases },
        OR: [{ syncLeaseUntil: null }, { syncLeaseUntil: { lt: now } }],
      },
      data: { syncLeaseToken: lease, syncLeaseUntil: new Date(Date.now() + leaseMs) },
    });
    if (claimed.count === 0) continue;
    const state = stateFor(candidate.syncState);
    const requestId = `google-sync:${candidate.syncRunId ?? 'legacy'}`;
    try {
      await requireGoogleUser(services, candidate.userId);
      const accessToken = await accessTokenFor(services, candidate, requestId);
      if (state.phase === 'authorizing') {
        const profile = await gmailJson('/profile', accessToken);
        state.accountEmail =
          typeof profile.emailAddress === 'string' ? profile.emailAddress.toLowerCase() : '';
        if (candidate.accountEmail && candidate.accountEmail.toLowerCase() !== state.accountEmail)
          throw new ApiError(
            409,
            'GOOGLE_ACCOUNT_MISMATCH',
            'Reconnect the Google account originally linked here.',
          );
        await services.db.connection.updateMany({
          where: guard(candidate, lease),
          data: { accountEmail: state.accountEmail || null },
        });
        const messages = await gmailMessagesForCatch(accessToken);
        state.messageIds = [
          ...new Set(
            messages.map((m) => m.id).filter((id): id is string => typeof id === 'string'),
          ),
        ].slice(0, 2500);
        state.bounded = state.messageIds.length === 2500;
        state.phase = state.messageIds.length > 0 ? 'reading_mail' : 'reading_calendar';
        if (!(await checkpoint(services, candidate, lease, state))) return true;
      }
      if (state.phase === 'reading_mail') {
        const rules = await services.db.screeningRule.findMany({
          where: { userId: candidate.userId, deletedAt: null },
          orderBy: { priority: 'asc' },
        });
        const end = Math.min(state.index + 20, state.messageIds.length);
        while (state.index < end) {
          const messageId = state.messageIds[state.index];
          if (!messageId) break;
          const externalId =
            candidate.accountKey === 'primary' ? messageId : `${candidate.id}:${messageId}`;
          const source = await services.db.sourceDocument.findUnique({
            where: {
              userId_kind_externalId: {
                userId: candidate.userId,
                kind: SourceDocumentKind.GMAIL_MESSAGE,
                externalId,
              },
            },
          });
          let message: Record<string, unknown> | null = null;
          try {
            message = await gmailJson(
              `/messages/${encodeURIComponent(messageId)}?format=${source ? 'metadata' : 'full'}`,
              accessToken,
            );
          } catch (error: unknown) {
            if (!(error instanceof ApiError && error.code === 'GMAIL_MESSAGE_GONE')) throw error;
          }
          const payload = asRecord(message?.payload);
          const subject = source?.title ?? (headerValue(payload, 'Subject') || '(No subject)');
          const from = source?.sender ?? headerValue(payload, 'From');
          const labels = message?.labelIds;
          const safeLabels = Array.isArray(labels)
            ? labels.filter((label): label is string => typeof label === 'string')
            : [];
          const outbound =
            safeLabels.includes('SENT') ||
            (source
              ? source.direction === SourceDocumentDirection.OUTBOUND
              : state.accountEmail.length > 0 && emailAddress(from) === state.accountEmail);
          const committed = await services.db.$transaction(async (tx) => {
            const current = await tx.connection.updateMany({
              where: guard(candidate, lease),
              data: { syncLeaseUntil: new Date(Date.now() + leaseMs) },
            });
            if (current.count === 0) return false;
            if (source) {
              if (message)
                await tx.sourceDocument.update({
                  where: { id: source.id },
                  data: {
                    deletedAt: null,
                    lastSyncedAt: new Date(),
                    connectionId: candidate.id,
                    metadata: {
                      labels: safeLabels,
                      category: categoryForLabels(safeLabels, outbound),
                      derived: asRecord(
                        asRecord(source.metadata).derived,
                      ) as Prisma.InputJsonObject,
                    },
                  },
                });
              else
                await tx.sourceDocument.update({
                  where: { id: source.id },
                  data: { deletedAt: new Date() },
                });
            }
            if (!source && message) {
              await tx.sourceDocument.upsert({
                where: {
                  userId_kind_externalId: {
                    userId: candidate.userId,
                    kind: SourceDocumentKind.GMAIL_MESSAGE,
                    externalId,
                  },
                },
                update: {},
                create: {
                  userId: candidate.userId,
                  connectionId: candidate.id,
                  kind: SourceDocumentKind.GMAIL_MESSAGE,
                  direction: outbound
                    ? SourceDocumentDirection.OUTBOUND
                    : SourceDocumentDirection.INBOUND,
                  externalId,
                  threadId:
                    typeof message.threadId === 'string'
                      ? `${candidate.accountKey === 'primary' ? '' : candidate.id + ':'}${message.threadId}`
                      : null,
                  sourceUrl: gmailMessageSourceUrl(messageId, state.accountEmail),
                  title: subject,
                  sender: from || null,
                  recipients: headerValue(payload, 'To') || null,
                  occurredAt: parseMessageDate(headerValue(payload, 'Date')),
                  body: '',
                  metadata: {
                    labels: safeLabels,
                    category: categoryForLabels(safeLabels, outbound),
                    derived: derivedEmailSignals(
                      (
                        plainBody(payload) ||
                        (typeof message.snippet === 'string' ? message.snippet : '')
                      ).slice(0, 8000),
                    ),
                  },
                },
              });
            }
            if (message && !outbound) {
              const existing = await tx.inboxItem.findFirst({
                where: { recipientUserId: candidate.userId, kind: `gmail:${externalId}` },
              });
              const rule = rules.find((r) => ruleMatches(asRecord(r.matchOn), from, subject));
              const triage =
                rule?.action === 'DECLINE'
                  ? InboxTriage.AUTO_DECLINED
                  : rule?.action === 'ALLOW'
                    ? InboxTriage.ESCALATED
                    : InboxTriage.HELD;
              if (!existing) {
                await tx.inboxItem.create({
                  data: {
                    recipientUserId: candidate.userId,
                    kind: `gmail:${externalId}`,
                    subject,
                    body: `From: ${from}\n\nOpen the original email to read it. ORBIT does not retain Gmail message bodies.`,
                    triage,
                  },
                });
                if (triage === InboxTriage.ESCALATED && !safeLabels.includes('SPAM'))
                  await queuePush(tx, {
                    userId: candidate.userId,
                    eventType: 'approval',
                    title: 'A message needs your review',
                    body: 'Open ORBIT to review your inbox.',
                    deepLink: 'orbit://inbox',
                  });
              }
            }
            await tx.connection.updateMany({
              where: guard(candidate, lease),
              data: {
                syncState: jsonState({
                  ...state,
                  index: state.index + 1,
                  imported: state.imported + (!source && message ? 1 : 0),
                }),
                syncProcessed: state.index + 1,
              },
            });
            return true;
          });
          if (!committed) return true;
          if (!source && message) state.imported += 1;
          state.index += 1;
        }
        // No new model calls or Gmail-data transmission in background population.
        await refreshLifeItems(services, candidate.userId, requestId, false);
        if (state.index >= state.messageIds.length) state.phase = 'reading_calendar';
        if (!(await checkpoint(services, candidate, lease, state, true))) return true;
      } else if (state.phase === 'reading_calendar') {
        state.calendarImported = await syncCalendar(
          services,
          candidate.userId,
          accessToken,
          async (data) =>
            services.db.$transaction(async (tx) => {
              const current = await tx.connection.updateMany({
                where: guard(candidate, lease),
                data: { syncLeaseUntil: new Date(Date.now() + leaseMs) },
              });
              if (current.count === 0)
                throw new ApiError(409, 'GMAIL_SYNC_CANCELLED', 'Google access was disconnected.');
              return tx.sourceDocument.upsert(data);
            }),
          candidate,
        );
        state.phase = 'building_catch';
        if (!(await checkpoint(services, candidate, lease, state, true))) return true;
      } else {
        const caught = await refreshLifeItems(services, candidate.userId, requestId, false);
        const done = await services.db.connection.updateMany({
          where: guard(candidate, lease),
          data: {
            syncStatus: 'idle',
            syncState: jsonState(state),
            syncLeaseToken: null,
            syncLeaseUntil: null,
            syncNextAttemptAt: null,
            syncErrorCode: null,
            syncAttempts: 0,
            lastSyncedAt: new Date(),
          },
        });
        if (done.count)
          await logActivity(services.db, {
            userId: candidate.userId,
            actorType: 'SYSTEM',
            action: 'connection.gmail_synced',
            targetType: 'Connection',
            targetId: candidate.id,
            payload: {
              imported: state.imported,
              examined: state.index,
              calendarImported: state.calendarImported,
              caught,
              daysRead: 90,
              bounded: state.bounded,
            },
            requestId,
          });
      }
      services.realtime.publish(candidate.userId, { type: 'google.sync_progress', payload: {} });
    } catch (error: unknown) {
      const code =
        error instanceof ApiError
          ? error.code
          : error instanceof Error && error.name === 'TimeoutError'
            ? 'GOOGLE_READ_TIMEOUT'
            : 'GOOGLE_READ_FAILED';
      const attempts = candidate.syncAttempts + 1;
      const terminal =
        [
          'GOOGLE_PERMISSION_REQUIRED',
          'GMAIL_RECONNECT_REQUIRED',
          'GMAIL_SYNC_CANCELLED',
          'GOOGLE_VERIFICATION_PENDING',
          'GOOGLE_ACCOUNT_MISMATCH',
        ].includes(code) || attempts >= 5;
      await services.db.connection.updateMany({
        where: {
          id: candidate.id,
          syncRunId: candidate.syncRunId,
          syncLeaseToken: lease,
          deletedAt: null,
          status: { in: [ConnectionStatus.ACTIVE, ConnectionStatus.EXPIRED] },
        },
        data: {
          syncStatus: terminal ? 'error' : 'retrying',
          syncAttempts: attempts,
          syncErrorCode: code,
          syncLeaseToken: null,
          syncLeaseUntil: null,
          syncNextAttemptAt: terminal
            ? null
            : new Date(Date.now() + Math.min(120_000, 2000 * 2 ** attempts)),
        },
      });
      services.realtime.publish(candidate.userId, { type: 'google.sync_progress', payload: {} });
      await logActivity(services.db, {
        userId: candidate.userId,
        actorType: 'SYSTEM',
        action: terminal ? 'connection.google_sync_stopped' : 'connection.google_sync_retrying',
        targetType: 'Connection',
        targetId: candidate.id,
        payload: { code, attempts },
        requestId,
      });
    }
    return true;
  }
  return false;
};

export const registerGoogleSyncRunner = (app: FastifyInstance, services: Services): void => {
  if (services.config.NODE_ENV === 'test' || services.config.GMAIL_INTEGRATION_ENABLED !== 'true')
    return;
  let stopped = false;
  let inFlight: Promise<unknown> | null = null;
  const tick = (): void => {
    if (stopped || inFlight) return;
    inFlight = runGoogleSyncTick(services)
      .catch(() => app.log.error({ event: 'google.sync_runner_failed' }))
      .finally(() => {
        inFlight = null;
      });
  };
  const timer = setInterval(tick, 5000);
  timer.unref();
  app.addHook('onReady', (_done) => {
    tick();
    _done();
  });
  app.addHook('onClose', async () => {
    stopped = true;
    clearInterval(timer);
    await inFlight;
  });
};
