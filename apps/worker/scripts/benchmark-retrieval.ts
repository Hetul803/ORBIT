import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';

import { createPrismaClient, Prisma } from '@orbit/db';

const dimensions = 1536;

const tokens = (value: string): string[] => value.toLowerCase().match(/[a-z0-9]{3,}/gu) ?? [];

const lexicalScore = (left: string, right: string): number => {
  const a = new Set(tokens(left));
  const b = new Set(tokens(right));
  if (a.size === 0 || b.size === 0) return 0.25;
  const overlap = [...a].filter((token) => b.has(token)).length;
  return Math.min(0.99, 0.25 + overlap / Math.max(a.size, b.size));
};

const benchmarkVector = (text: string): string => {
  const values = Array.from({ length: dimensions }, () => 0);
  for (const token of tokens(text)) {
    const digest = createHash('sha256').update(token).digest();
    const index = digest.readUInt16BE(0) % dimensions;
    const sign = digest[2] === undefined || digest[2] % 2 === 0 ? 1 : -1;
    values[index] = (values[index] ?? 0) + sign;
  }
  const magnitude = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0)) || 1;
  return `[${values.map((value) => (value / magnitude).toFixed(8)).join(',')}]`;
};

const percentile = (values: readonly number[], fraction: number): number => {
  const sorted = values.toSorted((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;
};

const main = async (): Promise<void> => {
  const db = createPrismaClient();
  try {
    const agents = await db.agent.findMany({
      where: { deletedAt: null, user: { deletedAt: null } },
      include: {
        memoryFacts: { where: { deletedAt: null, supersededById: null } },
        user: { include: { intents: { where: { active: true, deletedAt: null } } } },
      },
      orderBy: { id: 'asc' },
    });
    if (agents.length < 2) throw new Error('Benchmark requires at least two seeded agents.');
    const profiles = agents.map((agent) => ({
      id: agent.id,
      text: [agent.profileSummary, ...agent.memoryFacts.map((fact) => fact.content)].join(' '),
      intents: new Set(agent.user.intents.map((intent) => intent.kind)),
    }));
    const repeats = 30;
    const lexicalTimes: number[] = [];
    const vectorTimes: number[] = [];
    let lexicalRelevant = 0;
    let vectorRelevant = 0;
    let measured = 0;

    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        'CREATE TEMP TABLE "OrbitRetrievalBenchmark" ("id" TEXT PRIMARY KEY, "embedding" vector(1536) NOT NULL) ON COMMIT DROP',
      );
      for (const profile of profiles) {
        await tx.$executeRaw(
          Prisma.sql`INSERT INTO "OrbitRetrievalBenchmark" ("id", "embedding") VALUES (${profile.id}, ${benchmarkVector(profile.text)}::vector)`,
        );
      }
      await tx.$executeRawUnsafe(
        'CREATE INDEX "OrbitRetrievalBenchmark_hnsw" ON "OrbitRetrievalBenchmark" USING hnsw ("embedding" vector_cosine_ops)',
      );
      await tx.$executeRawUnsafe('ANALYZE "OrbitRetrievalBenchmark"');

      for (let repeat = 0; repeat < repeats; repeat += 1) {
        for (const source of profiles) {
          const startedLexical = performance.now();
          const lexical = profiles
            .filter((candidate) => candidate.id !== source.id)
            .map((candidate) => ({
              id: candidate.id,
              score: lexicalScore(source.text, candidate.text),
            }))
            .toSorted((left, right) => right.score - left.score)
            .slice(0, 5);
          lexicalTimes.push(performance.now() - startedLexical);

          const startedVector = performance.now();
          const vector = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
            SELECT candidate."id"
            FROM "OrbitRetrievalBenchmark" source
            JOIN "OrbitRetrievalBenchmark" candidate ON candidate."id" <> source."id"
            WHERE source."id" = ${source.id}
            ORDER BY source."embedding" <=> candidate."embedding"
            LIMIT 5
          `);
          vectorTimes.push(performance.now() - startedVector);

          if (repeat === 0) {
            const relevant = (candidateId: string): boolean => {
              const candidate = profiles.find((profile) => profile.id === candidateId);
              return (
                candidate !== undefined &&
                [...source.intents].some((intent) => candidate.intents.has(intent))
              );
            };
            lexicalRelevant += lexical.filter((candidate) => relevant(candidate.id)).length;
            vectorRelevant += vector.filter((candidate) => relevant(candidate.id)).length;
            measured += 5;
          }
        }
      }
    });

    process.stdout.write(
      `${JSON.stringify(
        {
          dataset: 'current seeded Agent and MemoryFact rows',
          agents: profiles.length,
          queriesPerMethod: profiles.length * repeats,
          topK: 5,
          lexical: {
            medianMs: percentile(lexicalTimes, 0.5),
            p95Ms: percentile(lexicalTimes, 0.95),
            intentPrecisionAt5: lexicalRelevant / measured,
          },
          pgvector: {
            medianMs: percentile(vectorTimes, 0.5),
            p95Ms: percentile(vectorTimes, 0.95),
            intentPrecisionAt5: vectorRelevant / measured,
          },
          caveat:
            'The benchmark uses deterministic hashed vectors only inside a temporary table to compare retrieval mechanics without a provider key. Production writes only provider-generated embeddings.',
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await db.$disconnect();
  }
};

await main();
