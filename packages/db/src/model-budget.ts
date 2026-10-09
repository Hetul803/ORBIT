import type { PrismaClient } from './generated/prisma/client.js';

export const startOfUtcDay = (): Date => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};

/** Atomic across API and worker processes. Failed attempts retain their conservative allowance. */
export const reserveModelBudget = async (
  db: PrismaClient,
  userId: string,
  projectedCostCents: number,
  userCapCents: number,
  globalCapCents: number,
): Promise<{ reservationId: string } | { exceeded: 'user' | 'global' }> =>
  db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(805002)`;
    const createdAt = { gte: startOfUtcDay() };
    const [userCalls, globalCalls, userReserved, globalReserved] = await Promise.all([
      tx.modelCall.aggregate({ where: { userId, createdAt }, _sum: { costCents: true } }),
      tx.modelCall.aggregate({ where: { createdAt }, _sum: { costCents: true } }),
      tx.modelBudgetReservation.aggregate({
        where: { userId, createdAt },
        _sum: { costCents: true },
      }),
      tx.modelBudgetReservation.aggregate({ where: { createdAt }, _sum: { costCents: true } }),
    ]);
    const userSpend =
      Number(userCalls._sum.costCents ?? 0) + Number(userReserved._sum.costCents ?? 0);
    const globalSpend =
      Number(globalCalls._sum.costCents ?? 0) + Number(globalReserved._sum.costCents ?? 0);
    if (userSpend >= userCapCents || userSpend + projectedCostCents > userCapCents)
      return { exceeded: 'user' as const };
    if (globalSpend >= globalCapCents || globalSpend + projectedCostCents > globalCapCents)
      return { exceeded: 'global' as const };
    const reservation = await tx.modelBudgetReservation.create({
      data: { userId, costCents: projectedCostCents },
    });
    return { reservationId: reservation.id };
  });
