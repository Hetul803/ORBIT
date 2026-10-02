import { randomUUID } from 'node:crypto';

import { createPrismaClient } from '@orbit/db';

import { runWatchers } from '../src/jobs/watchers.js';

const db = createPrismaClient();
const suffix = randomUUID().slice(0, 8);

class SmokeRollback extends Error {
  constructor(
    readonly payload: unknown,
    readonly passed: boolean,
  ) {
    super('Rollback the public watcher smoke-test fixture.');
  }
}

try {
  await db.$transaction(
    async (tx) => {
      const user = await tx.user.create({
        data: {
          email: `watcher-smoke-${suffix}@orbit.local`,
          displayName: 'Watcher Smoke',
          dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
          ageVerifiedAt: new Date(),
          emailVerifiedAt: new Date(),
        },
      });
      const watcher = await tx.watcher.create({
        data: {
          userId: user.id,
          title: 'Live public product price',
          schedule: '0 */6 * * *',
          active: true,
          nextRunAt: new Date(0),
          spec: {
            query:
              'Watch https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html and notify me when the price is under £60.',
            source: 'web',
            url: 'https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html',
            format: 'html',
            constraints: { maximumCents: 6000, currency: 'GBP' },
            notifyOn: 'new match',
          },
        },
      });
      const result = await runWatchers(tx);
      const saved = await tx.watcher.findUniqueOrThrow({
        where: { id: watcher.id },
        include: { hits: true },
      });
      const passed = saved.hits.length > 0;
      throw new SmokeRollback(
        {
          ok: passed,
          result,
          source: 'https://books.toscrape.com',
          lastRunAt: saved.lastRunAt,
          nextRunAt: saved.nextRunAt,
          hits: saved.hits.map((hit) => hit.payload),
        },
        passed,
      );
    },
    { timeout: 30_000 },
  );
} catch (error) {
  if (!(error instanceof SmokeRollback)) throw error;
  process.stdout.write(`${JSON.stringify(error.payload, null, 2)}\n`);
  if (!error.passed) process.exitCode = 1;
} finally {
  await db.$disconnect();
}
