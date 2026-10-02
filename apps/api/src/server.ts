import { createPrismaClient } from '@orbit/db';
import * as Sentry from '@sentry/node';

import { buildApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
if (config.SENTRY_DSN !== undefined) {
  Sentry.init({ dsn: config.SENTRY_DSN, environment: config.SENTRY_ENVIRONMENT });
}
const db = createPrismaClient(config.DATABASE_URL);
const app = await buildApp(db, config);

const close = async (signal: string): Promise<void> => {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  await db.$disconnect();
  process.exit(0);
};

process.on('SIGINT', () => void close('SIGINT'));
process.on('SIGTERM', () => void close('SIGTERM'));

await app.listen({ host: config.API_HOST, port: config.API_PORT });
