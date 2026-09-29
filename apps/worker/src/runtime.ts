import { createDecipheriv } from 'node:crypto';

import type { PrismaClient } from '@orbit/db';
import {
  AnthropicProvider,
  configFromEnvironment,
  GoogleProvider,
  ModelRouter,
  OpenAiProvider,
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

const startOfUtcDay = (): Date => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};

class PrismaCostLedger implements CostLedger {
  public constructor(private readonly db: PrismaClient) {}

  public async userSpendToday(userId: string): Promise<number> {
    const result = await this.db.modelCall.aggregate({
      where: { userId, createdAt: { gte: startOfUtcDay() } },
      _sum: { costCents: true },
    });
    return Number(result._sum.costCents ?? 0);
  }

  public async globalSpendToday(): Promise<number> {
    const result = await this.db.modelCall.aggregate({
      where: { createdAt: { gte: startOfUtcDay() } },
      _sum: { costCents: true },
    });
    return Number(result._sum.costCents ?? 0);
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

export const createModelRouter = (db: PrismaClient, config: WorkerConfig): ModelRouter => {
  const providers = new Map<string, LlmProvider>([
    ['stub', new StubProvider()],
    ['openai', new OpenAiProvider(config.OPENAI_API_KEY)],
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
  );
};
