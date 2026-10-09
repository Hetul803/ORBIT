import { createPrismaClient, IntentKind, Prisma, type PrismaClient } from '@orbit/db';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../../src/config.js';
import { runNightly } from '../../src/jobs/nightly.js';
import { runWatchers } from '../../src/jobs/watchers.js';
import { createModelRouter } from '../../src/runtime.js';

const enabled = process.env.DATABASE_URL?.includes('orbit_test') === true;

describe.runIf(enabled)('watcher worker integration', () => {
  let db: PrismaClient;

  beforeAll(() => {
    db = createPrismaClient();
  });
  afterAll(async () => {
    await db.$disconnect();
  });

  it('creates deduplicated hits and reschedules the watcher', async () => {
    await db.watcher.update({ where: { id: 'seed-watcher-01' }, data: { nextRunAt: new Date(0) } });
    await runWatchers(db);
    const afterFirst = await db.watcherHit.count({ where: { watcherId: 'seed-watcher-01' } });
    await db.watcher.update({ where: { id: 'seed-watcher-01' }, data: { nextRunAt: new Date(0) } });
    await runWatchers(db);
    const afterSecond = await db.watcherHit.count({ where: { watcherId: 'seed-watcher-01' } });
    expect(afterFirst).toBeGreaterThan(0);
    expect(afterSecond).toBe(afterFirst);
    const watcher = await db.watcher.findUniqueOrThrow({ where: { id: 'seed-watcher-01' } });
    expect(watcher.lastRunAt).not.toBeNull();
    expect(watcher.nextRunAt?.getTime()).toBeGreaterThan(Date.now());
  });

  it('matches two active users through reranking, a bounded conversation, and a safe introduction', async () => {
    const runId = randomUUID().slice(0, 8);
    await db.intent.updateMany({ data: { active: false } });
    const [userA, userB] = await Promise.all([
      db.user.create({
        data: {
          email: `nightly-a-${runId}@orbit.local`,
          dateOfBirth: new Date('1998-01-01T00:00:00.000Z'),
          ageVerifiedAt: new Date(),
          emailVerifiedAt: new Date(),
          displayName: 'Nightly Alpha',
          handle: `nightly_a_${runId}`,
          agent: {
            create: {
              name: 'Nightly Alpha Agent',
              identitySeed: `nightly-alpha-${runId}`,
              profileSummary: 'methodical reliable direct plans quiet work',
            },
          },
          intents: {
            create: { kind: IntentKind.FRIENDSHIP, active: true, params: { pace: 'calm' } },
          },
        },
      }),
      db.user.create({
        data: {
          email: `nightly-b-${runId}@orbit.local`,
          dateOfBirth: new Date('1999-01-01T00:00:00.000Z'),
          ageVerifiedAt: new Date(),
          emailVerifiedAt: new Date(),
          displayName: 'Nightly Beta',
          handle: `nightly_b_${runId}`,
          agent: {
            create: {
              name: 'Nightly Beta Agent',
              identitySeed: `nightly-beta-${runId}`,
              profileSummary: 'methodical reliable direct plans quiet work',
            },
          },
          intents: {
            create: { kind: IntentKind.FRIENDSHIP, active: true, params: { pace: 'calm' } },
          },
        },
      }),
    ]);
    const config = loadConfig({
      ...process.env,
      NODE_ENV: 'test',
      LLM_DEFAULT_PROVIDER: 'stub',
      INTRODUCTIONS_PER_USER_PER_DAY: '1',
    });
    const agents = await db.agent.findMany({ where: { userId: { in: [userA.id, userB.id] } } });
    const vector = `[${['1', ...Array.from({ length: 1535 }, () => '0')].join(',')}]`;
    for (const agent of agents) {
      await db.$executeRaw(
        Prisma.sql`UPDATE "Agent" SET "profileEmbedding" = ${vector}::vector WHERE "id" = ${agent.id}`,
      );
    }
    const participants = { OR: [{ userAId: userA.id }, { userBId: userA.id }] };
    const before = await db.introduction.count({ where: participants });
    const result = await runNightly(db, createModelRouter(db, config), config);
    const after = await db.introduction.count({ where: participants });
    expect(result.introductions).toBe(1);
    expect(after).toBe(before + 1);
    const generated = await db.introduction.findFirstOrThrow({
      where: {
        OR: [
          { userAId: userA.id, userBId: userB.id },
          { userAId: userB.id, userBId: userA.id },
        ],
      },
      include: { conversation: { include: { messages: true } } },
    });
    expect(generated.conversation.redactionPassed).toBe(true);
    expect(generated.conversation.messages).toHaveLength(8);
    expect(
      generated.conversation.messages.every((message) => message.contentHash.length === 64),
    ).toBe(true);
  });
});
