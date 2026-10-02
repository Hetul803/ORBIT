import { createPrismaClient } from '@orbit/db';
import { Queue, Worker, type Job } from 'bullmq';
import * as Sentry from '@sentry/node';

import { loadConfig } from './config.js';
import { runConsolidation } from './jobs/consolidation.js';
import { runDeletion } from './jobs/deletion.js';
import { runNightly } from './jobs/nightly.js';
import { deliverPush } from './jobs/push.js';
import { runWatchers } from './jobs/watchers.js';
import { createModelRouter } from './runtime.js';

const config = loadConfig();
if (config.SENTRY_DSN !== undefined) {
  Sentry.init({ dsn: config.SENTRY_DSN, environment: config.SENTRY_ENVIRONMENT });
}
const prisma = createPrismaClient();
const router = createModelRouter(prisma, config);

const execute = async (name: string): Promise<unknown> => {
  switch (name) {
    case 'nightly':
      return runNightly(prisma, router, config);
    case 'watchers':
      return runWatchers(prisma, router, config);
    case 'consolidation':
      return runConsolidation(prisma);
    case 'deletion':
      return runDeletion(prisma, config);
    case 'push':
      return deliverPush(prisma);
    default:
      throw new Error(`Unknown worker job: ${name}`);
  }
};

if (config.RUN_WORKER_ONCE === 'true') {
  const results = [];
  for (const jobName of ['watchers', 'consolidation', 'deletion', 'nightly', 'push']) {
    results.push({ jobName, result: await execute(jobName) });
  }
  process.stdout.write(`${JSON.stringify({ ok: true, results })}\n`);
  await prisma.$disconnect();
} else {
  const connection = { url: config.REDIS_URL };
  const schedules = [
    { name: 'nightly', pattern: config.NIGHTLY_MATCH_CRON },
    { name: 'watchers', pattern: config.WATCHER_TICK_CRON },
    { name: 'consolidation', pattern: config.CONSOLIDATION_CRON },
    { name: 'deletion', pattern: config.DELETION_CRON },
    { name: 'push', pattern: config.PUSH_TICK_CRON },
  ] as const;
  const queues: Queue[] = [];
  const workers: Worker[] = [];
  for (const schedule of schedules) {
    const queue = new Queue(`orbit-${schedule.name}`, { connection });
    await queue.upsertJobScheduler(
      `orbit-${schedule.name}-schedule`,
      { pattern: schedule.pattern },
      { name: schedule.name, data: {} },
    );
    queues.push(queue);
    const worker = new Worker(`orbit-${schedule.name}`, async (job: Job) => execute(job.name), {
      connection,
      concurrency: schedule.name === 'nightly' ? 1 : 4,
    });
    worker.on('completed', (job) => {
      process.stdout.write(
        `${JSON.stringify({ level: 'info', event: 'job.completed', job: job.name, id: job.id })}\n`,
      );
    });
    worker.on('failed', (job, error) => {
      if (config.SENTRY_DSN !== undefined) {
        Sentry.captureException(error, { tags: { job: job?.name ?? 'unknown' } });
      }
      process.stderr.write(
        `${JSON.stringify({ level: 'error', event: 'job.failed', job: job?.name, id: job?.id, error: error.message })}\n`,
      );
    });
    workers.push(worker);
  }

  const shutdown = async (): Promise<void> => {
    await Promise.all(workers.map((worker) => worker.close()));
    await Promise.all(queues.map((queue) => queue.close()));
    await prisma.$disconnect();
  };
  process.on('SIGINT', () => void shutdown().then(() => process.exit(0)));
  process.on('SIGTERM', () => void shutdown().then(() => process.exit(0)));
  process.stdout.write(`${JSON.stringify({ level: 'info', event: 'worker.ready', schedules })}\n`);
}
