import { LifeItemStatus } from '@orbit/db';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { requireAuth } from '../auth.js';
import { ApiError, parseWith } from '../errors.js';
import { answerLifeQuestion, lifeItemDto } from '../life.js';
import type { Services } from '../services.js';
import { logActivity } from './helpers.js';

const idParamsSchema = z.object({ id: z.string().min(8) });
const askSchema = z.object({ question: z.string().trim().min(3).max(1_000) });
const snoozeSchema = z.object({ until: z.iso.datetime() });

const activeLifeWhere = () => ({
  OR: [
    { status: LifeItemStatus.ACTIVE },
    { status: LifeItemStatus.SNOOZED, snoozedUntil: { lte: new Date() } },
  ],
});

export const registerLifeRoutes = (app: FastifyInstance, services: Services): void => {
  app.get('/v1/life/catch', async (request) => {
    const auth = await requireAuth(request, services.config);
    const items = await services.db.lifeItem.findMany({
      where: { userId: auth.id, deletedAt: null, ...activeLifeWhere() },
      orderBy: [{ dueAt: 'asc' }, { confidence: 'desc' }, { createdAt: 'desc' }],
      take: 40,
    });
    return items.map(lifeItemDto);
  });

  app.post('/v1/life/catch/:id/dismiss', async (request) => {
    const auth = await requireAuth(request, services.config);
    const params = parseWith(idParamsSchema, request.params);
    const result = await services.db.lifeItem.updateMany({
      where: { id: params.id, userId: auth.id, deletedAt: null },
      data: { status: LifeItemStatus.DISMISSED, snoozedUntil: null },
    });
    if (result.count === 0)
      throw new ApiError(404, 'LIFE_ITEM_NOT_FOUND', 'That item is unavailable.');
    await logActivity(services.db, {
      userId: auth.id,
      actorType: 'USER',
      action: 'life_item.dismissed',
      targetType: 'LifeItem',
      targetId: params.id,
      requestId: request.id,
    });
    return { ok: true };
  });

  app.post('/v1/life/catch/:id/snooze', async (request) => {
    const auth = await requireAuth(request, services.config);
    const params = parseWith(idParamsSchema, request.params);
    const body = parseWith(snoozeSchema, request.body);
    const until = new Date(body.until);
    if (until <= new Date())
      throw new ApiError(400, 'INVALID_SNOOZE', 'Choose a time in the future.');
    const result = await services.db.lifeItem.updateMany({
      where: { id: params.id, userId: auth.id, deletedAt: null },
      data: { status: LifeItemStatus.SNOOZED, snoozedUntil: until },
    });
    if (result.count === 0)
      throw new ApiError(404, 'LIFE_ITEM_NOT_FOUND', 'That item is unavailable.');
    await logActivity(services.db, {
      userId: auth.id,
      actorType: 'USER',
      action: 'life_item.snoozed',
      targetType: 'LifeItem',
      targetId: params.id,
      payload: { until: until.toISOString() },
      requestId: request.id,
    });
    return { ok: true, until: until.toISOString() };
  });

  app.post('/v1/life/catch/:id/copied', async (request) => {
    const auth = await requireAuth(request, services.config);
    const params = parseWith(idParamsSchema, request.params);
    const result = await services.db.lifeItem.updateMany({
      where: { id: params.id, userId: auth.id, deletedAt: null, draft: { not: null } },
      data: { copiedAt: new Date() },
    });
    if (result.count === 0) {
      throw new ApiError(404, 'LIFE_ITEM_DRAFT_NOT_FOUND', 'That draft is unavailable.');
    }
    await logActivity(services.db, {
      userId: auth.id,
      actorType: 'USER',
      action: 'life_item.draft_copied',
      targetType: 'LifeItem',
      targetId: params.id,
      requestId: request.id,
    });
    return { ok: true, copiedAt: new Date().toISOString() };
  });

  app.post('/v1/life/ask', async (request) => {
    const auth = await requireAuth(request, services.config);
    const body = parseWith(askSchema, request.body);
    const answer = await answerLifeQuestion(services, auth.id, body.question);
    await logActivity(services.db, {
      userId: auth.id,
      actorType: 'USER',
      action: 'life_question.answered',
      targetType: 'LifeQuestion',
      payload: {
        sourceCount: Array.isArray(answer.sources) ? answer.sources.length : 0,
        confidence: answer.confidence,
      },
      requestId: request.id,
    });
    return answer;
  });
};
