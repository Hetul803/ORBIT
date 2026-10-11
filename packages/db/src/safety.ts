import type { Prisma, PrismaClient } from './generated/prisma/client.js';

export const lockSafetyPair = async (
  tx: Prisma.TransactionClient,
  left: string,
  right: string,
): Promise<void> => {
  const key = `orbit-safety:${[left, right].toSorted().join(':')}`;
  await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
};

export const isPairBlocked = async (
  db: Pick<PrismaClient, 'block'>,
  left: string,
  right: string,
): Promise<boolean> =>
  (await db.block.count({
    where: {
      OR: [
        { blockerUserId: left, blockedUserId: right },
        { blockerUserId: right, blockedUserId: left },
      ],
    },
  })) > 0;

export const unblockedUserWhere = (userId: string): Prisma.UserWhereInput => ({
  blocksCreated: { none: { blockedUserId: userId } },
  blocksReceived: { none: { blockerUserId: userId } },
});

export const visibleIntroductionWhere = (userId: string): Prisma.IntroductionWhereInput => ({
  deletedAt: null,
  OR: [{ userAId: userId }, { userBId: userId }],
  userA: { ...unblockedUserWhere(userId), deletedAt: null, status: { not: 'SUSPENDED' } },
  userB: { ...unblockedUserWhere(userId), deletedAt: null, status: { not: 'SUSPENDED' } },
  conversation: {
    deletedAt: null,
    redactionPassed: true,
    suppressedAt: null,
    status: { not: 'MODERATION_FLAGGED' },
  },
});
