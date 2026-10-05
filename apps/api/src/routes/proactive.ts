import { ProactiveAutonomyLevel, ProactiveProposalType } from '@orbit/db';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { requireAuth } from '../auth.js';
import { ApiError, parseWith } from '../errors.js';
import {
  approvePromotion,
  listProactive,
  respondToProposal,
  setProactiveLevel,
} from '../proactive.js';
import type { Services } from '../services.js';

const idSchema = z.object({ id: z.string().min(8) });
const typeSchema = z.object({ type: z.enum(ProactiveProposalType) });
const levelSchema = z.object({ level: z.enum(ProactiveAutonomyLevel) });
const responseSchema = z.object({ decision: z.enum(['accept', 'dismiss', 'snooze']) });

export const registerProactiveRoutes = (app: FastifyInstance, services: Services): void => {
  app.get('/v1/proactive', async (request) => {
    const auth = await requireAuth(request, services.config);
    return listProactive(services, auth.id);
  });

  app.post('/v1/proactive/:id/respond', async (request) => {
    const auth = await requireAuth(request, services.config);
    const { id } = parseWith(idSchema, request.params);
    const { decision } = parseWith(responseSchema, request.body);
    try {
      const proposal = await respondToProposal(services, auth.id, id, decision);
      if (proposal === null)
        throw new ApiError(404, 'PROPOSAL_NOT_FOUND', 'That proposal is unavailable.');
      return { ok: true, proposalId: proposal.id, status: proposal.status.toLowerCase() };
    } catch (error: unknown) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(
        409,
        'PROPOSAL_ALREADY_DECIDED',
        error instanceof Error ? error.message : 'That proposal has already been decided.',
      );
    }
  });

  app.put('/v1/proactive/policies/:type', async (request) => {
    const auth = await requireAuth(request, services.config);
    const { type } = parseWith(typeSchema, request.params);
    const { level } = parseWith(levelSchema, request.body);
    try {
      const policy = await setProactiveLevel(services, auth.id, type, level);
      return { ...policy, level: policy.level.toLowerCase(), type: policy.type.toLowerCase() };
    } catch (error: unknown) {
      throw new ApiError(
        400,
        'ACT_NOT_ALLOWED',
        error instanceof Error ? error.message : 'That level is not available.',
      );
    }
  });

  app.post('/v1/proactive/policies/:type/approve-act', async (request) => {
    const auth = await requireAuth(request, services.config);
    const { type } = parseWith(typeSchema, request.params);
    try {
      const policy = await approvePromotion(services, auth.id, type);
      if (policy === null)
        throw new ApiError(
          409,
          'PROMOTION_NOT_READY',
          'Five consecutive accepts are required first.',
        );
      return { ...policy, level: policy.level.toLowerCase(), type: policy.type.toLowerCase() };
    } catch (error: unknown) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(
        400,
        'ACT_NOT_ALLOWED',
        error instanceof Error ? error.message : 'That level is not available.',
      );
    }
  });
};
