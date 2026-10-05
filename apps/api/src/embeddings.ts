import { Prisma } from '@orbit/db';

import { sha256 } from './crypto.js';
import type { Services } from './services.js';

const EMBEDDING_DIMENSIONS = 1536;
const EMBEDDING_TIMEOUT_MS = 12_000;

export interface EmbeddingCallContext {
  readonly userId: string;
  readonly runId?: string;
  readonly requestId?: string;
}

const parseEmbedding = (payload: unknown): number[] => {
  if (typeof payload !== 'object' || payload === null)
    throw new Error('Invalid embedding response');
  const data = (payload as { data?: unknown }).data;
  if (!Array.isArray(data) || data.length === 0) throw new Error('Embedding response had no data');
  const entries: unknown[] = data;
  const first = entries[0];
  if (typeof first !== 'object' || first === null)
    throw new Error('Embedding response was malformed');
  const embedding = (first as { embedding?: unknown }).embedding;
  if (
    !Array.isArray(embedding) ||
    embedding.length !== EMBEDDING_DIMENSIONS ||
    !embedding.every(
      (value): value is number => typeof value === 'number' && Number.isFinite(value),
    )
  ) {
    throw new Error(`Embedding must contain exactly ${String(EMBEDDING_DIMENSIONS)} finite values`);
  }
  return embedding;
};

export const createEmbedding = async (
  services: Services,
  text: string,
  context: EmbeddingCallContext,
): Promise<readonly number[] | null> => {
  const useOpenRouter =
    services.config.OPENROUTER_API_KEY !== undefined &&
    services.config.OPENROUTER_API_KEY.length > 0;
  const key = useOpenRouter ? services.config.OPENROUTER_API_KEY : services.config.OPENAI_API_KEY;
  if (key === undefined || key.length === 0) return null;
  const startedAt = Date.now();
  const response = await fetch(
    useOpenRouter
      ? `${services.config.OPENROUTER_BASE_URL}/embeddings`
      : 'https://api.openai.com/v1/embeddings',
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
        ...(useOpenRouter && services.config.OPENROUTER_HTTP_REFERER !== undefined
          ? { 'HTTP-Referer': services.config.OPENROUTER_HTTP_REFERER }
          : {}),
        ...(useOpenRouter ? { 'X-OpenRouter-Title': services.config.OPENROUTER_APP_TITLE } : {}),
      },
      body: JSON.stringify({
        model: useOpenRouter
          ? services.config.OPENROUTER_EMBEDDING_MODEL
          : services.config.OPENAI_EMBEDDING_MODEL,
        input: text.slice(0, 24_000),
        encoding_format: 'float',
        ...(useOpenRouter ? { dimensions: EMBEDDING_DIMENSIONS } : {}),
      }),
      signal: AbortSignal.timeout(EMBEDDING_TIMEOUT_MS),
    },
  );
  if (!response.ok) {
    throw new Error(`Embedding provider returned HTTP ${String(response.status)}`);
  }
  const payload = (await response.json()) as {
    readonly usage?: {
      readonly prompt_tokens?: unknown;
      readonly total_tokens?: unknown;
      readonly cost?: unknown;
    };
  };
  const embedding = parseEmbedding(payload);
  const usage = payload.usage;
  const tokensIn =
    typeof usage?.prompt_tokens === 'number'
      ? usage.prompt_tokens
      : typeof usage?.total_tokens === 'number'
        ? usage.total_tokens
        : 0;
  const costCents =
    typeof usage?.cost === 'number' && Number.isFinite(usage.cost) ? usage.cost * 100 : 0;
  await services.db.modelCall.create({
    data: {
      userId: context.userId,
      ...(context.runId === undefined ? {} : { runId: context.runId }),
      ...(context.requestId === undefined ? {} : { requestId: context.requestId }),
      task: 'embedding',
      provider: useOpenRouter ? 'openrouter' : 'openai',
      model: useOpenRouter
        ? services.config.OPENROUTER_EMBEDDING_MODEL
        : services.config.OPENAI_EMBEDDING_MODEL,
      tokensIn,
      tokensOut: 0,
      costCents,
      latencyMs: Date.now() - startedAt,
    },
  });
  return embedding;
};

const vectorLiteral = (values: readonly number[]): string => `[${values.join(',')}]`;

export const storeMemoryEmbedding = async (
  services: Services,
  factId: string,
  content: string,
  context: EmbeddingCallContext,
): Promise<boolean> => {
  const embedding = await createEmbedding(services, content, context);
  if (embedding === null) return false;
  await services.db.$executeRaw(
    Prisma.sql`UPDATE "MemoryFact"
      SET "embedding" = ${vectorLiteral(embedding)}::vector,
          "embeddingHash" = ${sha256(content)},
          "updatedAt" = NOW()
      WHERE "id" = ${factId} AND "deletedAt" IS NULL`,
  );
  return true;
};

export const refreshAgentProfileEmbedding = async (
  services: Services,
  agentId: string,
  context: EmbeddingCallContext,
): Promise<boolean> => {
  const agent = await services.db.agent.findUnique({
    where: { id: agentId },
    include: {
      memoryFacts: {
        where: { deletedAt: null, supersededById: null, profileLayer: { not: 'STATE' } },
        orderBy: { updatedAt: 'desc' },
        take: 100,
      },
    },
  });
  if (agent === null) return false;
  const text = [agent.profileSummary, ...agent.memoryFacts.map((fact) => fact.content)]
    .filter((value) => value.trim().length > 0)
    .join('\n');
  if (text.length === 0) return false;
  const embedding = await createEmbedding(services, text, context);
  if (embedding === null) return false;
  await services.db.$executeRaw(
    Prisma.sql`UPDATE "Agent"
      SET "profileEmbedding" = ${vectorLiteral(embedding)}::vector,
          "updatedAt" = NOW()
      WHERE "id" = ${agentId} AND "deletedAt" IS NULL`,
  );
  return true;
};

export const embedMemoryAndProfile = async (
  services: Services,
  factId: string,
  agentId: string,
  content: string,
  context: EmbeddingCallContext,
): Promise<boolean> => {
  const stored = await storeMemoryEmbedding(services, factId, content, context);
  if (stored) await refreshAgentProfileEmbedding(services, agentId, context);
  return stored;
};
