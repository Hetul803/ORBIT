import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from './generated/prisma/client.js';

let singleton: PrismaClient | undefined;

export const createPrismaClient = (
  connectionString = process.env.DATABASE_URL ??
    'postgresql://orbit:orbit@localhost:5432/orbit?schema=public',
): PrismaClient => {
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
};

export const prisma = (): PrismaClient => {
  singleton ??= createPrismaClient();
  return singleton;
};

export const disconnectPrisma = async (): Promise<void> => {
  if (singleton !== undefined) {
    await singleton.$disconnect();
    singleton = undefined;
  }
};
