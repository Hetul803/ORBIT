import type { PrismaClient } from '@orbit/db';
import type { CostLedger, ModelCallRecord } from '@orbit/llm';

const startOfUtcDay = (): Date => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};

export class PrismaCostLedger implements CostLedger {
  public constructor(private readonly db: PrismaClient) {}

  public async userSpendToday(userId: string): Promise<number> {
    const aggregate = await this.db.modelCall.aggregate({
      where: { userId, createdAt: { gte: startOfUtcDay() } },
      _sum: { costCents: true },
    });
    return Number(aggregate._sum.costCents ?? 0);
  }

  public async globalSpendToday(): Promise<number> {
    const aggregate = await this.db.modelCall.aggregate({
      where: { createdAt: { gte: startOfUtcDay() } },
      _sum: { costCents: true },
    });
    return Number(aggregate._sum.costCents ?? 0);
  }

  public async record(call: ModelCallRecord): Promise<void> {
    await this.db.modelCall.create({
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
  }
}
