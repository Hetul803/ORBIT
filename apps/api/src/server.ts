import { createPrismaClient } from '@orbit/db';

import { buildApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
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
