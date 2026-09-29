import { createPrismaClient, type PrismaClient } from '@orbit/db';
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
    await db.intent.updateMany({ data: { active: false } });
    await db.intent.updateMany({
      where: {
        id: { in: ['seed-intent-friend-03', 'seed-intent-friend-04'] },
      },
      data: { active: true },
    });
    const config = loadConfig({
      ...process.env,
      NODE_ENV: 'test',
      LLM_DEFAULT_PROVIDER: 'stub',
      INTRODUCTIONS_PER_USER_PER_DAY: '1',
    });
    const before = await db.introduction.count();
    const result = await runNightly(db, createModelRouter(db, config), config);
    const after = await db.introduction.count();
    expect(result.introductions).toBe(1);
    expect(after).toBe(before + 1);
    const generated = await db.introduction.findFirstOrThrow({
      where: {
        OR: [
          { userAId: 'seed-user-03', userBId: 'seed-user-04' },
          { userAId: 'seed-user-04', userBId: 'seed-user-03' },
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
