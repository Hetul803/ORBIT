import { operatorEmails, operatorPushReady, type Prisma, type PrismaClient } from '@orbit/db';
import type { ApiConfig } from './config.js';

/** Fail closed for public admission without treating delivery receipts as human review. */
export const alphaOperationsReady = async (
  db: PrismaClient | Prisma.TransactionClient,
  config: ApiConfig,
): Promise<boolean> => {
  if (config.NODE_ENV !== 'production') return true;
  if (
    config.PUBLIC_ALPHA_SIGNUPS_OPEN !== 'true' ||
    config.MODERATION_COVERAGE_CONFIRMED !== 'true'
  )
    return false;
  const now = Date.now();
  const [pushReady, undelivered, overdue] = await Promise.all([
    operatorPushReady(db, operatorEmails(config.MODERATION_OPERATOR_EMAILS)),
    db.moderationAlert.count({
      where: { status: { not: 'SENT' }, createdAt: { lte: new Date(now - 60_000) } },
    }),
    db.report.count({
      where: {
        status: { in: ['OPEN', 'REVIEWING'] },
        OR: [
          { acknowledgedAt: null, createdAt: { lte: new Date(now - 15 * 60_000) } },
          { firstActionAt: null, createdAt: { lte: new Date(now - 60 * 60_000) } },
        ],
      },
    }),
  ]);
  return pushReady && undelivered === 0 && overdue === 0;
};
