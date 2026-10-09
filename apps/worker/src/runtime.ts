import { createDecipheriv } from 'node:crypto';

import { reserveModelBudget, startOfUtcDay, type PrismaClient } from '@orbit/db';
import {
  AnthropicProvider,
  CostCapError,
  configFromEnvironment,
  GoogleProvider,
  ModelRouter,
  OpenAiProvider,
  OpenRouterCatalogPriceResolver,
  OpenRouterProvider,
  StubProvider,
  type CostLedger,
  type LlmProvider,
  type ModelCallRecord,
} from '@orbit/llm';

import type { WorkerConfig } from './config.js';

const decryptField = (payload: string, base64Key: string): string => {
  const [noncePart, tagPart, ciphertextPart] = payload.split('.');
  if (noncePart === undefined || tagPart === undefined || ciphertextPart === undefined) {
    throw new Error('Encrypted API key is malformed');
  }
  const key = Buffer.from(base64Key, 'base64');
  if (key.length !== 32) throw new Error('FIELD_ENCRYPTION_KEY must decode to 32 bytes');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(noncePart, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextPart, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
};

class PrismaCostLedger implements CostLedger {
  public constructor(private readonly db: PrismaClient) {}

  public async userSpendToday(userId: string): Promise<number> {
    const result = await this.db.modelCall.aggregate({
      where: { userId, createdAt: { gte: startOfUtcDay() } },
      _sum: { costCents: true },
    });
    const reserved = await this.db.modelBudgetReservation.aggregate({
      where: { userId, createdAt: { gte: startOfUtcDay() } },
      _sum: { costCents: true },
    });
    return Number(result._sum.costCents ?? 0) + Number(reserved._sum.costCents ?? 0);
  }

  public async globalSpendToday(): Promise<number> {
    const result = await this.db.modelCall.aggregate({
      where: { createdAt: { gte: startOfUtcDay() } },
      _sum: { costCents: true },
    });
    const reserved = await this.db.modelBudgetReservation.aggregate({
      where: { createdAt: { gte: startOfUtcDay() } },
      _sum: { costCents: true },
    });
    return Number(result._sum.costCents ?? 0) + Number(reserved._sum.costCents ?? 0);
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

export const createModelRouter = (db: PrismaClient, config: WorkerConfig): ModelRouter => {
  const providers = new Map<string, LlmProvider>([
    ['stub', new StubProvider()],
    ['openai', new OpenAiProvider(config.OPENAI_API_KEY)],
    [
      'openrouter',
      new OpenRouterProvider(config.OPENROUTER_API_KEY, {
        baseUrl: config.OPENROUTER_BASE_URL,
        appTitle: config.OPENROUTER_APP_TITLE,
        ...(config.OPENROUTER_HTTP_REFERER === undefined
          ? {}
          : { httpReferer: config.OPENROUTER_HTTP_REFERER }),
      }),
    ],
    ['anthropic', new AnthropicProvider(config.ANTHROPIC_API_KEY)],
    ['google', new GoogleProvider(config.GOOGLE_GENERATIVE_AI_API_KEY)],
  ]);
  return new ModelRouter(
    configFromEnvironment(process.env),
    providers,
    new PrismaCostLedger(db),
    async (userId: string, provider: string) => {
      if (provider === 'stub') return undefined;
      const key = await db.encryptedApiKey.findUnique({
        where: { userId_provider: { userId, provider } },
        select: { encryptedValue: true },
      });
      return key === null
        ? undefined
        : decryptField(key.encryptedValue, config.FIELD_ENCRYPTION_KEY);
    },
    new OpenRouterCatalogPriceResolver({
      baseUrl: config.OPENROUTER_BASE_URL,
      ...(config.OPENROUTER_API_KEY === undefined ? {} : { apiKey: config.OPENROUTER_API_KEY }),
    }),
  );
};
