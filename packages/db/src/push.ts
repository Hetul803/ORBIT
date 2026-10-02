import type { PrismaClient } from './generated/prisma/client.js';

export const pushEventTypes = ['brief', 'reveal', 'approval', 'watcher', 'safety'] as const;
export type PushEventType = (typeof pushEventTypes)[number];

const enabled = (preferences: unknown, eventType: PushEventType): boolean => {
  if (typeof preferences !== 'object' || preferences === null || Array.isArray(preferences))
    return true;
  const value = (preferences as Record<string, unknown>)[eventType];
  return value !== false;
};

export const queuePush = async (
  db: PrismaClient,
  input: {
    userId: string;
    eventType: PushEventType;
    title: string;
    body: string;
    deepLink: string;
  },
): Promise<number> => {
  const devices = await db.device.findMany({
    where: { userId: input.userId, deletedAt: null },
    select: { id: true, preferences: true },
  });
  const eligible = devices.filter((device) => enabled(device.preferences, input.eventType));
  if (eligible.length === 0) return 0;
  const result = await db.pushDelivery.createMany({
    data: eligible.map((device) => ({
      userId: input.userId,
      deviceId: device.id,
      eventType: input.eventType,
      title: input.title.slice(0, 120),
      body: input.body.slice(0, 500),
      deepLink: input.deepLink,
    })),
  });
  return result.count;
};
