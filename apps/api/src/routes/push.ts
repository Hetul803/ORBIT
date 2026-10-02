import { Platform, pushEventTypes } from '@orbit/db';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { requireAuth } from '../auth.js';
import { ApiError, parseWith } from '../errors.js';
import type { Services } from '../services.js';
import { asRecord, logActivity } from './helpers.js';

const preferencesSchema = z.object(
  Object.fromEntries(pushEventTypes.map((event) => [event, z.boolean().default(true)])) as Record<
    (typeof pushEventTypes)[number],
    z.ZodDefault<z.ZodBoolean>
  >,
);

const deviceSchema = z.object({
  pushToken: z
    .string()
    .regex(/^ExponentPushToken\[[A-Za-z0-9_-]+\]$|^ExpoPushToken\[[A-Za-z0-9_-]+\]$/u),
  platform: z.enum(['ios', 'android', 'web']),
  preferences: preferencesSchema,
});

const platform = (value: 'ios' | 'android' | 'web'): Platform =>
  value === 'ios' ? Platform.IOS : value === 'android' ? Platform.ANDROID : Platform.WEB;

export const registerPushRoutes = (app: FastifyInstance, services: Services): void => {
  app.get('/v1/push/devices', async (request) => {
    const auth = await requireAuth(request, services.config);
    const devices = await services.db.device.findMany({
      where: { userId: auth.id, deletedAt: null },
      orderBy: { lastSeenAt: 'desc' },
    });
    return devices.map((device) => ({
      id: device.id,
      platform: device.platform.toLowerCase(),
      preferences: asRecord(device.preferences),
      lastSeenAt: device.lastSeenAt.toISOString(),
    }));
  });

  app.post('/v1/push/register', async (request, reply) => {
    const auth = await requireAuth(request, services.config);
    const body = parseWith(deviceSchema, request.body);
    const device = await services.db.device.upsert({
      where: { pushToken: body.pushToken },
      update: {
        userId: auth.id,
        platform: platform(body.platform),
        preferences: body.preferences,
        lastSeenAt: new Date(),
        deletedAt: null,
      },
      create: {
        userId: auth.id,
        pushToken: body.pushToken,
        platform: platform(body.platform),
        preferences: body.preferences,
      },
    });
    await logActivity(services.db, {
      userId: auth.id,
      actorType: 'USER',
      action: 'push.device_registered',
      targetType: 'Device',
      targetId: device.id,
      payload: { platform: body.platform },
      requestId: request.id,
    });
    return reply.code(201).send({
      id: device.id,
      platform: body.platform,
      preferences: body.preferences,
    });
  });

  app.patch('/v1/push/devices/:id/preferences', async (request) => {
    const auth = await requireAuth(request, services.config);
    const params = parseWith(z.object({ id: z.string().min(8) }), request.params);
    const preferences = parseWith(preferencesSchema, request.body);
    const result = await services.db.device.updateMany({
      where: { id: params.id, userId: auth.id, deletedAt: null },
      data: { preferences, lastSeenAt: new Date() },
    });
    if (result.count === 0)
      throw new ApiError(404, 'DEVICE_NOT_FOUND', 'That notification device was not found.');
    return { ok: true, preferences };
  });

  app.delete('/v1/push/devices/:id', async (request, reply) => {
    const auth = await requireAuth(request, services.config);
    const params = parseWith(z.object({ id: z.string().min(8) }), request.params);
    const result = await services.db.device.updateMany({
      where: { id: params.id, userId: auth.id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (result.count === 0)
      throw new ApiError(404, 'DEVICE_NOT_FOUND', 'That notification device was not found.');
    return reply.code(204).send();
  });
};
