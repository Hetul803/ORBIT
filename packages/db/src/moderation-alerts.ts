import { createHash } from 'node:crypto';
import type { Prisma, PrismaClient } from './generated/prisma/client.js';

export interface ModerationDeliveryConfig {
  RESEND_API_KEY?: string | undefined;
  RESEND_FROM_EMAIL: string;
  EXPO_ACCESS_TOKEN?: string | undefined;
}

export const operatorEmails = (value: string): string[] => [
  ...new Set(
    value
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  ),
];

export const queueModerationAlerts = async (
  tx: Prisma.TransactionClient,
  reportId: string,
  emails: string[],
): Promise<void> => {
  await tx.moderationAlert.createMany({
    data: emails.flatMap((email) =>
      ['email', 'push'].map((channel) => ({
        reportId,
        channel,
        recipientEmail: email,
        recipientKey: createHash('sha256').update(email).digest('hex'),
      })),
    ),
    skipDuplicates: true,
  });
};

/** Mandatory operational push, not a consumer notification preference. */
export const operatorPushReady = async (
  db: Pick<PrismaClient, 'user'>,
  emails: string[],
): Promise<boolean> => {
  if (emails.length === 0) return false;
  const operators = await db.user.findMany({
    where: {
      email: { in: emails },
      role: { in: ['ADMIN', 'MODERATOR'] },
      status: 'ACTIVE',
      deletedAt: null,
      devices: { some: { deletedAt: null, platform: { in: ['IOS', 'ANDROID'] } } },
    },
    select: { email: true },
  });
  return emails.every((email) => operators.some((operator) => operator.email === email));
};

/** Claim-before-send and durable retries: provider acceptance is not human acknowledgement. */
export const deliverModerationAlerts = async (
  db: PrismaClient,
  config: ModerationDeliveryConfig,
  options: { reportId?: string; fetcher?: typeof fetch; now?: Date } = {},
): Promise<{ accepted: number; retrying: number }> => {
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? new Date();
  const expiredLease = new Date(now.getTime() - 60_000);
  const eligible: Prisma.ModerationAlertWhereInput = {
    ...(options.reportId === undefined ? {} : { reportId: options.reportId }),
    OR: [
      { status: { in: ['PENDING', 'RETRY'] }, nextAttemptAt: { lte: now } },
      { status: 'SENDING', lockedAt: { lte: expiredLease } },
    ],
  };
  const alerts = await db.moderationAlert.findMany({
    where: eligible,
    orderBy: { createdAt: 'asc' },
    take: 100,
  });
  const results = await Promise.all(
    alerts.map(async (alert) => {
      const claim = await db.moderationAlert.updateMany({
        where: { id: alert.id, ...eligible },
        data: { status: 'SENDING', lockedAt: now, attempts: { increment: 1 } },
      });
      if (claim.count === 0) return 'skipped';
      let failure = 'PROVIDER_UNAVAILABLE';
      try {
        if (alert.channel === 'email') {
          if (!config.RESEND_API_KEY || !alert.recipientEmail)
            throw new Error('EMAIL_NOT_CONFIGURED');
          failure = 'EMAIL_PROVIDER_UNAVAILABLE';
          const response = await fetcher('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${config.RESEND_API_KEY}`,
              'Idempotency-Key': `orbit-safety-${alert.id}`,
            },
            body: JSON.stringify({
              from: config.RESEND_FROM_EMAIL,
              to: [alert.recipientEmail],
              subject: 'ORBIT: urgent safety report needs review',
              text: `A safety report is awaiting review. Reference: ${alert.reportId}. Attached conversations are suppressed before review. Open ORBIT → Admin to acknowledge within 15 minutes and take the first action within 60 minutes. This message intentionally omits identities and conversation text.`,
            }),
            signal: AbortSignal.timeout(5_000),
          });
          const result: unknown = response.ok ? await response.json() : null;
          if (!response.ok || typeof result !== 'object' || result === null || !('id' in result))
            throw new Error('EMAIL_PROVIDER_UNAVAILABLE');
        } else {
          failure = 'OPERATOR_PUSH_UNAVAILABLE';
          const operator = await db.user.findFirst({
            where: {
              email: alert.recipientEmail ?? '',
              role: { in: ['ADMIN', 'MODERATOR'] },
              status: 'ACTIVE',
              deletedAt: null,
            },
            include: {
              devices: { where: { deletedAt: null, platform: { in: ['IOS', 'ANDROID'] } } },
            },
          });
          if (!operator || operator.devices.length === 0)
            throw new Error('OPERATOR_PUSH_UNAVAILABLE');
          const response = await fetcher('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
              ...(config.EXPO_ACCESS_TOKEN
                ? { Authorization: `Bearer ${config.EXPO_ACCESS_TOKEN}` }
                : {}),
            },
            body: JSON.stringify(
              operator.devices.map((device) => ({
                to: device.pushToken,
                sound: 'default',
                priority: 'high',
                title: 'ORBIT safety report needs review',
                body: 'A safety report awaits review. Acknowledge in 15 minutes; first action within 60 minutes.',
                data: {
                  eventType: 'moderation',
                  deepLink: `orbit://admin?reportId=${encodeURIComponent(alert.reportId)}`,
                },
              })),
            ),
            signal: AbortSignal.timeout(5_000),
          });
          const payload = response.ok
            ? ((await response.json()) as { data?: { status?: string }[] })
            : {};
          if (
            !response.ok ||
            payload.data?.length !== operator.devices.length ||
            payload.data.some((ticket) => ticket.status !== 'ok')
          )
            throw new Error('OPERATOR_PUSH_UNAVAILABLE');
        }
        await db.moderationAlert.update({
          where: { id: alert.id },
          data: { status: 'SENT', sentAt: new Date(), lockedAt: null, lastError: null },
        });
        return 'accepted';
      } catch {
        // Never persist/log arbitrary provider response text, recipients, tokens or report details.
        await db.moderationAlert.update({
          where: { id: alert.id },
          data: {
            status: 'RETRY',
            lockedAt: null,
            nextAttemptAt: new Date(
              now.getTime() + Math.min(60_000, 5_000 * 2 ** Math.min(alert.attempts, 4)),
            ),
            lastError: failure,
          },
        });
        return 'retrying';
      }
    }),
  );
  return {
    accepted: results.filter((result) => result === 'accepted').length,
    retrying: results.filter((result) => result === 'retrying').length,
  };
};
