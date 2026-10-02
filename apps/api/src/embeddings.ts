import { Prisma } from '@orbit/db';

import { sha256 } from './crypto.js';
import type { Services } from './services.js';

const EMBEDDING_DIMENSIONS = 1536;
const EMBEDDING_TIMEOUT_MS = 12_000;

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
): Promise<readonly number[] | null> => {
  const key = services.config.OPENAI_API_KEY;
  if (key === undefined || key.length === 0) return null;
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: services.config.OPENAI_EMBEDDING_MODEL,
      input: text.slice(0, 24_000),
      encoding_format: 'float',
    }),
    signal: AbortSignal.timeout(EMBEDDING_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Embedding provider returned HTTP ${String(response.status)}`);
  }
  return parseEmbedding((await response.json()) as unknown);
};

const vectorLiteral = (values: readonly number[]): string => `[${values.join(',')}]`;

export const storeMemoryEmbedding = async (
  services: Services,
  factId: string,
  content: string,
): Promise<boolean> => {
  const embedding = await createEmbedding(services, content);
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
): Promise<boolean> => {
  const agent = await services.db.agent.findUnique({
    where: { id: agentId },
    include: {
      memoryFacts: {
        where: { deletedAt: null, supersededById: null },
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
  const embedding = await createEmbedding(services, text);
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
): Promise<boolean> => {
  const stored = await storeMemoryEmbedding(services, factId, content);
  if (stored) await refreshAgentProfileEmbedding(services, agentId);
  return stored;
};
