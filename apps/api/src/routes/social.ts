import { RevealDecision, queuePush, type IntentKind } from '@orbit/db';
import {
  introductionDecisionSchema,
  introductionOutcomeSchema,
  verdictSchema,
} from '@orbit/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { requireAuth } from '../auth.js';
import { ApiError, parseWith } from '../errors.js';
import type { Services } from '../services.js';
import { asRecord, iso, logActivity } from './helpers.js';

const idParamsSchema = z.object({ id: z.string().min(8) });
const revealFields = ['first_name', 'handle', 'phone'] as const;
type RevealField = (typeof revealFields)[number];

const decisionToApi = (value: RevealDecision): 'pending' | 'reveal' | 'decline' =>
  value.toLowerCase() as 'pending' | 'reveal' | 'decline';

const intentToApi = (value: IntentKind): string => value.toLowerCase();

const revealedFieldsForUser = (
  value: unknown,
  isA: boolean,
): { you: Record<string, unknown>; other: Record<string, unknown> } => {
  const raw = asRecord(value);
  return {
    you: asRecord(raw[isA ? 'userA' : 'userB']),
    other: asRecord(raw[isA ? 'userB' : 'userA']),
  };
};

const userRevealValue = (
  field: RevealField,
  user: { displayName: string; handle: string | null; phone: string | null },
): string | null => {
  if (field === 'first_name') return user.displayName.trim().split(/\s+/u)[0] ?? null;
  if (field === 'handle') return user.handle;
  return user.phone;
};

interface IntroductionRecord {
  readonly id: string;
  readonly conversationId: string;
  readonly userAId: string;
  readonly userBId: string;
  readonly userADecision: RevealDecision;
  readonly userBDecision: RevealDecision;
  readonly revealedAt: Date | null;
  readonly revealedFields: unknown;
  readonly expiresAt: Date;
  readonly conversation: {
    readonly intentKind: IntentKind;
    readonly verdict: unknown;
    readonly redactionPassed: boolean;
    readonly agentA: { readonly id: string; readonly name: string; readonly identitySeed: string };
    readonly agentB: { readonly id: string; readonly name: string; readonly identitySeed: string };
  };
}

const introductionDto = (record: IntroductionRecord, userId: string): Record<string, unknown> => {
  const isA = record.userAId === userId;
  const myDecision = isA ? record.userADecision : record.userBDecision;
  const rawOtherDecision = isA ? record.userBDecision : record.userADecision;
  const otherDecision = rawOtherDecision === RevealDecision.REVEAL ? 'reveal' : 'pending';
  const otherAgent = isA ? record.conversation.agentB : record.conversation.agentA;
  const verdict = verdictSchema.parse(record.conversation.verdict);
  return {
    id: record.id,
    conversationId: record.conversationId,
    otherUserId: isA ? record.userBId : record.userAId,
    intentKind: intentToApi(record.conversation.intentKind),
    otherAgent,
    verdict,
    myDecision: decisionToApi(myDecision),
    otherDecision,
    revealedAt: iso(record.revealedAt),
    revealedFields:
      record.revealedAt === null ? {} : revealedFieldsForUser(record.revealedFields, isA),
    expiresAt: record.expiresAt.toISOString(),
  };
};

const introductionInclude = {
  conversation: { include: { agentA: true, agentB: true } },
} as const;

export const registerSocialRoutes = (app: FastifyInstance, services: Services): void => {
  app.get('/v1/introductions', async (request) => {
    const auth = await requireAuth(request, services.config);
    const records = await services.db.introduction.findMany({
      where: {
        deletedAt: null,
        expiresAt: { gt: new Date() },
        conversation: { redactionPassed: true, deletedAt: null },
        OR: [{ userAId: auth.id }, { userBId: auth.id }],
      },
      include: introductionInclude,
      orderBy: { createdAt: 'desc' },
    });
    return records.map((record) => introductionDto(record, auth.id));
  });

  app.get('/v1/introductions/:id', async (request) => {
    const auth = await requireAuth(request, services.config);
    const params = parseWith(idParamsSchema, request.params);
    const record = await services.db.introduction.findFirst({
      where: {
        id: params.id,
        deletedAt: null,
        conversation: { redactionPassed: true, deletedAt: null },
        OR: [{ userAId: auth.id }, { userBId: auth.id }],
      },
      include: introductionInclude,
    });
    if (record === null)
      throw new ApiError(404, 'INTRODUCTION_NOT_FOUND', 'That introduction is unavailable.');
    return introductionDto(record, auth.id);
  });

  app.get('/v1/introductions/:id/transcript', async (request) => {
    const auth = await requireAuth(request, services.config);
    const params = parseWith(idParamsSchema, request.params);
    const record = await services.db.introduction.findFirst({
      where: {
        id: params.id,
        deletedAt: null,
        conversation: { redactionPassed: true, deletedAt: null },
        OR: [{ userAId: auth.id }, { userBId: auth.id }],
      },
      include: {
        ...introductionInclude,
        conversation: {
          include: {
            agentA: true,
            agentB: true,
            messages: { where: { deletedAt: null }, orderBy: { turnIndex: 'asc' } },
          },
        },
      },
    });
    if (!record?.conversation.redactionPassed) {
      throw new ApiError(404, 'TRANSCRIPT_NOT_FOUND', 'No safe transcript is available.');
    }
    return {
      introduction: introductionDto(record, auth.id),
      redactionPassed: true,
      messages: record.conversation.messages.map((message) => ({
        id: message.id,
        conversationId: message.conversationId,
        speakerAgentId: message.speakerAgentId,
        turnIndex: message.turnIndex,
        redactedContent: message.redactedContent,
        createdAt: message.createdAt.toISOString(),
      })),
    };
  });

  app.post('/v1/introductions/:id/decision', async (request) => {
    const auth = await requireAuth(request, services.config);
    const params = parseWith(idParamsSchema, request.params);
    const body = parseWith(introductionDecisionSchema, request.body);
    const result = await services.db.$transaction(async (tx) => {
      const record = await tx.introduction.findFirst({
        where: {
          id: params.id,
          deletedAt: null,
          expiresAt: { gt: new Date() },
          conversation: { redactionPassed: true },
          OR: [{ userAId: auth.id }, { userBId: auth.id }],
        },
        include: {
          ...introductionInclude,
          userA: true,
          userB: true,
        },
      });
      if (record === null)
        throw new ApiError(404, 'INTRODUCTION_NOT_FOUND', 'That introduction is unavailable.');
      const isA = record.userAId === auth.id;
      const currentDecision = isA ? record.userADecision : record.userBDecision;
      if (currentDecision !== RevealDecision.PENDING) {
        throw new ApiError(409, 'DECISION_FINAL', 'Your decision has already been recorded.');
      }
      if (body.decision === 'reveal' && body.fields.length === 0) {
        throw new ApiError(400, 'REVEAL_FIELDS_REQUIRED', 'Select at least one field to reveal.');
      }
      const decision = body.decision === 'reveal' ? RevealDecision.REVEAL : RevealDecision.DECLINE;
      const now = new Date();
      const updated = await tx.introduction.update({
        where: { id: record.id },
        data: isA
          ? { userADecision: decision, decidedAAt: now }
          : { userBDecision: decision, decidedBAt: now },
        include: introductionInclude,
      });

      if (decision === RevealDecision.REVEAL) {
        const sourceUser = isA ? record.userA : record.userB;
        for (const field of body.fields) {
          const value = userRevealValue(field, sourceUser);
          if (value === null) continue;
          await tx.reveal.upsert({
            where: {
              introductionId_userId_field: {
                introductionId: record.id,
                userId: auth.id,
                field,
              },
            },
            update: { value, consentedAt: now },
            create: {
              introductionId: record.id,
              userId: auth.id,
              field,
              value,
              consentedAt: now,
            },
          });
          await tx.consent.create({
            data: {
              userId: auth.id,
              kind: `introduction_reveal:${field}`,
              version: '1.0',
              metadata: { introductionId: record.id },
            },
          });
        }
      }

      const afterA = isA ? decision : record.userADecision;
      const afterB = isA ? record.userBDecision : decision;
      if (afterA === RevealDecision.REVEAL && afterB === RevealDecision.REVEAL) {
        const reveals = await tx.reveal.findMany({ where: { introductionId: record.id } });
        const a = new Map(
          reveals
            .filter((reveal) => reveal.userId === record.userAId)
            .map((reveal) => [reveal.field, reveal.value]),
        );
        const b = new Map(
          reveals
            .filter((reveal) => reveal.userId === record.userBId)
            .map((reveal) => [reveal.field, reveal.value]),
        );
        const mutual = revealFields.filter((field) => a.has(field) && b.has(field));
        const revealedFields = {
          userA: Object.fromEntries(mutual.map((field) => [field, a.get(field)])),
          userB: Object.fromEntries(mutual.map((field) => [field, b.get(field)])),
        };
        await tx.introduction.update({
          where: { id: record.id },
          data: { revealedAt: now, revealedFields },
        });
        for (const userId of [record.userAId, record.userBId]) {
          await logActivity(tx, {
            userId,
            actorType: 'USER',
            action: 'introduction.revealed',
            targetType: 'Introduction',
            targetId: record.id,
            payload: { fields: mutual },
            requestId: request.id,
          });
        }
      } else {
        await logActivity(tx, {
          userId: auth.id,
          actorType: 'USER',
          action:
            body.decision === 'reveal' ? 'introduction.reveal_consented' : 'introduction.declined',
          targetType: 'Introduction',
          targetId: record.id,
          payload: body.decision === 'reveal' ? { fields: body.fields } : {},
          requestId: request.id,
        });
      }
      return { updated, otherUserId: isA ? record.userBId : record.userAId };
    });
    services.realtime.publish(result.otherUserId, {
      type: 'introduction.decision_recorded',
      payload: { introductionId: params.id },
    });
    const fresh = await services.db.introduction.findUniqueOrThrow({
      where: { id: params.id },
      include: introductionInclude,
    });
    if (fresh.revealedAt !== null) {
      await Promise.all(
        [fresh.userAId, fresh.userBId].map((userId) =>
          queuePush(services.db, {
            userId,
            eventType: 'reveal',
            title: 'Your introduction is mutually revealed',
            body: 'Open ORBIT to see the fields you both approved.',
            deepLink: `orbit://introduction/${fresh.id}`,
          }),
        ),
      );
    }
    return introductionDto(fresh, auth.id);
  });

  app.post('/v1/introductions/:id/outcome', async (request, reply) => {
    const auth = await requireAuth(request, services.config);
    const params = parseWith(idParamsSchema, request.params);
    const body = parseWith(introductionOutcomeSchema, request.body);
    const introduction = await services.db.introduction.findFirst({
      where: { id: params.id, OR: [{ userAId: auth.id }, { userBId: auth.id }] },
    });
    if (introduction === null)
      throw new ApiError(404, 'INTRODUCTION_NOT_FOUND', 'That introduction was not found.');
    const outcomeData = {
      met: body.met,
      ...(body.rating === undefined ? {} : { rating: body.rating }),
      ...(body.notes === undefined ? {} : { notes: body.notes }),
    };
    const outcome = await services.db.introductionOutcome.upsert({
      where: { introductionId_userId: { introductionId: introduction.id, userId: auth.id } },
      update: { ...outcomeData, reportedAt: new Date() },
      create: { introductionId: introduction.id, userId: auth.id, ...outcomeData },
    });
    return reply.code(201).send({
      id: outcome.id,
      introductionId: outcome.introductionId,
      met: outcome.met,
      rating: outcome.rating,
      notes: outcome.notes,
      reportedAt: outcome.reportedAt.toISOString(),
    });
  });

  app.get('/v1/exchange/proposals', async (request) => {
    const auth = await requireAuth(request, services.config);
    const proposals = await services.db.exchangeProposal.findMany({
      where: {
        deletedAt: null,
        expiresAt: { gt: new Date() },
        OR: [{ haveItem: { userId: auth.id } }, { wantItem: { userId: auth.id } }],
      },
      include: { haveItem: { include: { user: true } }, wantItem: { include: { user: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return proposals.map((proposal) => {
      const isHave = proposal.haveItem.userId === auth.id;
      const myDecision = isHave ? proposal.userADecision : proposal.userBDecision;
      const otherDecision = isHave ? proposal.userBDecision : proposal.userADecision;
      const otherUser = isHave ? proposal.wantItem.user : proposal.haveItem.user;
      return {
        id: proposal.id,
        have: proposal.haveItem,
        want: proposal.wantItem,
        terms: asRecord(proposal.terms),
        negotiation: Array.isArray(proposal.negotiation) ? proposal.negotiation : [],
        myDecision:
          myDecision === RevealDecision.REVEAL
            ? 'accepted'
            : myDecision === RevealDecision.DECLINE
              ? 'rejected'
              : 'pending',
        otherDecision: otherDecision === RevealDecision.REVEAL ? 'accepted' : 'pending',
        acceptedAt: iso(proposal.acceptedAt),
        handoff:
          proposal.acceptedAt === null
            ? null
            : {
                handle: otherUser.handle,
                firstName: otherUser.displayName.split(/\s+/u)[0] ?? '',
                safetyPlanAvailable: true,
              },
        moneyNotice:
          'ORBIT handles no money and takes no fee. Settle directly and safely in person.',
        expiresAt: proposal.expiresAt.toISOString(),
      };
    });
  });

  app.post('/v1/exchange/proposals/:id/decision', async (request) => {
    const auth = await requireAuth(request, services.config);
    const params = parseWith(idParamsSchema, request.params);
    const body = parseWith(z.object({ decision: z.enum(['accept', 'reject']) }), request.body);
    const proposal = await services.db.exchangeProposal.findFirst({
      where: {
        id: params.id,
        deletedAt: null,
        expiresAt: { gt: new Date() },
        OR: [{ haveItem: { userId: auth.id } }, { wantItem: { userId: auth.id } }],
      },
      include: { haveItem: true, wantItem: true },
    });
    if (proposal === null)
      throw new ApiError(404, 'PROPOSAL_NOT_FOUND', 'That exchange proposal is unavailable.');
    const isHave = proposal.haveItem.userId === auth.id;
    const decision = body.decision === 'accept' ? RevealDecision.REVEAL : RevealDecision.DECLINE;
    const afterA = isHave ? decision : proposal.userADecision;
    const afterB = isHave ? proposal.userBDecision : decision;
    const acceptedAt =
      afterA === RevealDecision.REVEAL && afterB === RevealDecision.REVEAL ? new Date() : null;
    await services.db.exchangeProposal.update({
      where: { id: proposal.id },
      data: {
        ...(isHave ? { userADecision: decision } : { userBDecision: decision }),
        ...(acceptedAt === null ? {} : { acceptedAt }),
      },
    });
    await logActivity(services.db, {
      userId: auth.id,
      actorType: 'USER',
      action:
        body.decision === 'accept' ? 'exchange.proposal_accepted' : 'exchange.proposal_rejected',
      targetType: 'ExchangeProposal',
      targetId: proposal.id,
      payload: { noMoneyHandled: true },
      requestId: request.id,
    });
    return {
      ok: true,
      acceptedAt: iso(acceptedAt),
      moneyNotice: 'ORBIT handles no money and takes no fee.',
    };
  });
};
