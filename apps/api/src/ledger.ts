import { reserveModelBudget, startOfUtcDay, type PrismaClient } from '@orbit/db';
import { CostCapError, type CostLedger, type ModelCallRecord } from '@orbit/llm';

export class PrismaCostLedger implements CostLedger {
  public constructor(private readonly db: PrismaClient) {}

  public async userSpendToday(userId: string): Promise<number> {
    const aggregate = await this.db.modelCall.aggregate({
      where: { userId, createdAt: { gte: startOfUtcDay() } },
      _sum: { costCents: true },
    });
    const reserved = await this.db.modelBudgetReservation.aggregate({
      where: { userId, createdAt: { gte: startOfUtcDay() } },
      _sum: { costCents: true },
    });
    return Number(aggregate._sum.costCents ?? 0) + Number(reserved._sum.costCents ?? 0);
  }

  public async globalSpendToday(): Promise<number> {
    const aggregate = await this.db.modelCall.aggregate({
      where: { createdAt: { gte: startOfUtcDay() } },
      _sum: { costCents: true },
    });
    const reserved = await this.db.modelBudgetReservation.aggregate({
      where: { createdAt: { gte: startOfUtcDay() } },
      _sum: { costCents: true },
    });
    return Number(aggregate._sum.costCents ?? 0) + Number(reserved._sum.costCents ?? 0);
  }

  public async reserve(
    userId: string,
    projectedCostCents: number,
    userCapCents: number,
    globalCapCents: number,
  ): Promise<string> {
    const result = await reserveModelBudget(
      this.db,
      userId,
      projectedCostCents,
      userCapCents,
      globalCapCents,
    );
    if ('exceeded' in result)
      throw new CostCapError(
        'The daily model budget has been reached. It resets at midnight UTC.',
        result.exceeded,
      );
    return result.reservationId;
  }

  public async record(call: ModelCallRecord, reservationId?: string): Promise<void> {
    await this.db.$transaction(async (tx) => {
      await tx.modelCall.create({
        data: {
          userId: call.userId,
          ...(call.runId === undefined ? {} : { runId: call.runId }),
          ...(call.conversationId === undefined ? {} : { conversationId: call.conversationId }),
          task: call.task,
          provider: call.provider,
          model: call.model,
          tokensIn: call.tokensIn,
          tokensOut: call.tokensOut,
          costCents: call.costCents,
          latencyMs: call.latencyMs,
          ...(call.requestId === undefined ? {} : { requestId: call.requestId }),
        },
      });
      if (reservationId !== undefined)
        await tx.modelBudgetReservation.deleteMany({ where: { id: reservationId } });
    });
  }
}
