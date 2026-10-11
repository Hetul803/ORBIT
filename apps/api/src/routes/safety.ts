import { randomBytes } from 'node:crypto';

import {
  ConversationStatus,
  ReportStatus,
  UserStatus,
  queuePush,
  lockSafetyPair,
  queueModerationAlerts,
  operatorEmails,
  deliverModerationAlerts,
  visibleIntroductionWhere,
} from '@orbit/db';
import { blockSchema, reportSchema, safetyPlanSchema } from '@orbit/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { requireAdmin, requireAuth } from '../auth.js';
import { ApiError, parseWith } from '../errors.js';
import type { Services } from '../services.js';
import { asRecord, iso, logActivity } from './helpers.js';

const idParamsSchema = z.object({ id: z.string().min(8) });

export const registerSafetyRoutes = (app: FastifyInstance, services: Services): void => {
  app.post('/v1/blocks', async (request, reply) => {
    const auth = await requireAuth(request, services.config);
    const body = parseWith(blockSchema, request.body);
    if (body.userId === auth.id)
      throw new ApiError(400, 'SELF_BLOCK', 'You cannot block your own account.');
    const block = await services.db.$transaction(async (tx) => {
      await lockSafetyPair(tx, auth.id, body.userId);
      const target = await tx.user.findUnique({ where: { id: body.userId }, select: { id: true } });
      if (!target) throw new ApiError(404, 'USER_NOT_FOUND', 'That account is unavailable.');
      const blocked = await tx.block.upsert({
        where: {
          blockerUserId_blockedUserId: { blockerUserId: auth.id, blockedUserId: body.userId },
        },
        update: { reason: body.reason, deletedAt: null },
        create: { blockerUserId: auth.id, blockedUserId: body.userId, reason: body.reason },
      });
      const pair = {
        OR: [
          { userAId: auth.id, userBId: body.userId },
          { userAId: body.userId, userBId: auth.id },
        ],
      };
      await tx.agentConversation.updateMany({
        where: {
          OR: [
            { agentA: { userId: auth.id }, agentB: { userId: body.userId } },
            { agentA: { userId: body.userId }, agentB: { userId: auth.id } },
          ],
          suppressedAt: null,
        },
        data: { suppressedAt: new Date() },
      });
      await tx.safetyPlan.updateMany({
        where: { introduction: pair, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      const intros = await tx.introduction.findMany({ where: pair, select: { id: true } });
      await tx.pushDelivery.updateMany({
        where: {
          status: { in: ['QUEUED', 'RETRY'] },
          deepLink: { in: intros.map((intro) => `orbit://introduction/${intro.id}`) },
        },
        data: { status: 'CANCELLED' },
      });
      await logActivity(tx, {
        userId: auth.id,
        actorType: 'USER',
        action: 'safety.user_blocked',
        targetType: 'User',
        targetId: body.userId,
        payload: { blockId: blocked.id },
        requestId: request.id,
      });
      return blocked;
    });
    for (const userId of [auth.id, body.userId])
      services.realtime.publish(userId, { type: 'safety.suppressed', payload: {} });
    return reply.code(201).send({
      id: block.id,
      blockedUserId: body.userId,
      createdAt: block.createdAt.toISOString(),
      bidirectional: true,
      permanent: true,
    });
  });

  app.post('/v1/mutes', async (request, reply) => {
    const auth = await requireAuth(request, services.config);
    const body = parseWith(
      z.object({
        userId: z.string().min(8),
        reason: z.string().max(500).optional(),
        until: z.iso.datetime().optional(),
      }),
      request.body,
    );
    const mute = await services.db.mute.upsert({
      where: { muterUserId_mutedUserId: { muterUserId: auth.id, mutedUserId: body.userId } },
      update: {
        ...(body.reason === undefined ? {} : { reason: body.reason }),
        expiresAt: body.until === undefined ? null : new Date(body.until),
        deletedAt: null,
      },
      create: {
        muterUserId: auth.id,
        mutedUserId: body.userId,
        ...(body.reason === undefined ? {} : { reason: body.reason }),
        expiresAt: body.until === undefined ? null : new Date(body.until),
      },
    });
    return reply
      .code(201)
      .send({ id: mute.id, mutedUserId: mute.mutedUserId, expiresAt: iso(mute.expiresAt) });
  });

  app.post('/v1/reports', async (request, reply) => {
    const auth = await requireAuth(request, services.config);
    const body = parseWith(reportSchema, request.body);
    if (body.subjectUserId === auth.id)
      throw new ApiError(400, 'SELF_REPORT', 'You cannot report yourself.');
    if (body.conversationId !== undefined) {
      const allowed = await services.db.introduction.count({
        where: {
          conversationId: body.conversationId,
          OR: [
            { userAId: auth.id, userBId: body.subjectUserId },
            { userBId: auth.id, userAId: body.subjectUserId },
          ],
        },
      });
      if (allowed === 0)
        throw new ApiError(
          403,
          'CONVERSATION_ACCESS_DENIED',
          'You cannot report a conversation you cannot access.',
        );
    }
    const report = await services.db.$transaction(async (tx) => {
      await lockSafetyPair(tx, auth.id, body.subjectUserId);
      if (!(await tx.user.findUnique({ where: { id: body.subjectUserId }, select: { id: true } })))
        throw new ApiError(404, 'USER_NOT_FOUND', 'That account is unavailable.');
      const previous = await tx.report.findFirst({
        where: {
          reporterUserId: auth.id,
          subjectUserId: body.subjectUserId,
          conversationId: body.conversationId ?? null,
          status: { in: ['OPEN', 'REVIEWING'] },
        },
      });
      if (previous) {
        await queueModerationAlerts(
          tx,
          previous.id,
          operatorEmails(services.config.MODERATION_OPERATOR_EMAILS),
        );
        return previous;
      }
      const created = await tx.report.create({
        data: {
          reporterUserId: auth.id,
          subjectUserId: body.subjectUserId,
          ...(body.conversationId === undefined ? {} : { conversationId: body.conversationId }),
          category: body.category,
          detail: body.detail,
        },
      });
      if (body.conversationId !== undefined) {
        await tx.agentConversation.update({
          where: { id: body.conversationId },
          data: { status: ConversationStatus.MODERATION_FLAGGED, suppressedAt: new Date() },
        });
        await tx.safetyPlan.updateMany({
          where: { introduction: { conversationId: body.conversationId }, deletedAt: null },
          data: { deletedAt: new Date() },
        });
        const introductions = await tx.introduction.findMany({
          where: { conversationId: body.conversationId },
          select: { id: true },
        });
        await tx.pushDelivery.updateMany({
          where: {
            status: { in: ['QUEUED', 'RETRY'] },
            deepLink: { in: introductions.map((intro) => `orbit://introduction/${intro.id}`) },
          },
          data: { status: 'CANCELLED' },
        });
      }
      await queueModerationAlerts(
        tx,
        created.id,
        operatorEmails(services.config.MODERATION_OPERATOR_EMAILS),
      );
      await logActivity(tx, {
        userId: auth.id,
        actorType: 'USER',
        action: 'safety.report_created',
        targetType: 'Report',
        targetId: created.id,
        payload: { category: body.category },
        requestId: request.id,
      });
      return created;
    });
    for (const userId of [auth.id, body.subjectUserId])
      services.realtime.publish(userId, { type: 'safety.suppressed', payload: {} });
    const notification = await deliverModerationAlerts(services.db, services.config, {
      reportId: report.id,
    });
    await queuePush(services.db, {
      userId: auth.id,
      eventType: 'safety',
      title: 'Safety report received',
      body:
        body.conversationId === undefined
          ? 'Your report is recorded for operator review.'
          : 'Your report is recorded. The reported conversation is hidden pending review.',
      deepLink: 'orbit://activity',
    });
    return reply.code(201).send({
      id: report.id,
      status: report.status.toLowerCase(),
      createdAt: report.createdAt.toISOString(),
      conversationSuppressed: body.conversationId !== undefined,
      operatorAlerts: {
        configured: operatorEmails(services.config.MODERATION_OPERATOR_EMAILS).length > 0,
        providerAccepted: notification.accepted,
        pendingRetry: notification.retrying,
      },
    });
  });

  app.post('/v1/safety-plans', async (request, reply) => {
    const auth = await requireAuth(request, services.config);
    const body = parseWith(safetyPlanSchema, request.body);
    const introduction = await services.db.introduction.findFirst({
      where: {
        id: body.introductionId,
        revealedAt: { not: null },
        ...visibleIntroductionWhere(auth.id),
      },
    });
    if (introduction === null)
      throw new ApiError(
        404,
        'REVEALED_INTRODUCTION_REQUIRED',
        'A safety plan requires a mutually revealed introduction.',
      );
    if (/\b(?:home|house|apartment|dorm room|residence)\b/iu.test(body.placeName)) {
      throw new ApiError(400, 'PUBLIC_PLACE_REQUIRED', 'Choose a public meeting place.');
    }
    const meetAt = new Date(body.meetAt);
    const plan = await services.db.$transaction(async (tx) => {
      await lockSafetyPair(tx, introduction.userAId, introduction.userBId);
      if (
        !(await tx.introduction.findFirst({
          where: { id: introduction.id, ...visibleIntroductionWhere(auth.id) },
        }))
      )
        throw new ApiError(404, 'INTRODUCTION_UNAVAILABLE', 'That introduction is unavailable.');
      return tx.safetyPlan.create({
        data: {
          introductionId: introduction.id,
          userId: auth.id,
          placeName: body.placeName,
          meetAt,
          shareToken: randomBytes(24).toString('base64url'),
          sharedWithContact: body.shareWithContact,
          checkInDueAt: new Date(meetAt.getTime() + 90 * 60_000),
        },
      });
    });
    return reply.code(201).send({
      id: plan.id,
      placeName: plan.placeName,
      meetAt: plan.meetAt.toISOString(),
      checkInDueAt: plan.checkInDueAt.toISOString(),
      shareUrl: `${services.config.PUBLIC_API_URL}/v1/safety-plans/share/${plan.shareToken}`,
    });
  });

  app.get('/v1/safety-plans/share/:token', async (request) => {
    const params = parseWith(z.object({ token: z.string().min(20) }), request.params);
    const plan = await services.db.safetyPlan.findUnique({ where: { shareToken: params.token } });
    if (plan?.deletedAt !== null)
      throw new ApiError(404, 'PLAN_NOT_FOUND', 'That safety plan is unavailable.');
    return {
      product: 'ORBIT',
      placeName: plan.placeName,
      meetAt: plan.meetAt.toISOString(),
      checkInDueAt: plan.checkInDueAt.toISOString(),
      checkedInAt: iso(plan.checkedInAt),
      note: 'This link intentionally excludes names, handles, phone numbers, and conversation details.',
    };
  });

  app.post('/v1/safety-plans/:id/check-in', async (request) => {
    const auth = await requireAuth(request, services.config);
    const params = parseWith(idParamsSchema, request.params);
    const result = await services.db.safetyPlan.updateMany({
      where: { id: params.id, userId: auth.id, checkedInAt: null, deletedAt: null },
      data: { checkedInAt: new Date() },
    });
    if (result.count === 0)
      throw new ApiError(404, 'PLAN_NOT_FOUND', 'That safety plan is unavailable.');
    await logActivity(services.db, {
      userId: auth.id,
      actorType: 'USER',
      action: 'safety.checked_in',
      targetType: 'SafetyPlan',
      targetId: params.id,
      requestId: request.id,
    });
    return { ok: true, checkedInAt: new Date().toISOString() };
  });

  app.get('/v1/activity', async (request) => {
    const auth = await requireAuth(request, services.config);
    const query = parseWith(
      z.object({
        cursor: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      }),
      request.query,
    );
    const entries = await services.db.activityLog.findMany({
      where: { userId: auth.id },
      orderBy: { createdAt: 'desc' },
      take: query.limit + 1,
      ...(query.cursor === undefined ? {} : { cursor: { id: query.cursor }, skip: 1 }),
    });
    const hasMore = entries.length > query.limit;
    const page = hasMore ? entries.slice(0, query.limit) : entries;
    return {
      items: page.map((entry) => ({
        id: entry.id,
        actorType: entry.actorType.toLowerCase(),
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        payload: asRecord(entry.payload),
        createdAt: entry.createdAt.toISOString(),
      })),
      nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
    };
  });

  app.get('/v1/admin/moderation', async (request) => {
    await requireAdmin(request, services.config);
    const [reports, flaggedConversations] = await Promise.all([
      services.db.report.findMany({
        where: { status: { in: [ReportStatus.OPEN, ReportStatus.REVIEWING] } },
        include: {
          alerts: {
            select: {
              id: true,
              channel: true,
              status: true,
              attempts: true,
              sentAt: true,
              lastError: true,
            },
          },
          reporter: { select: { id: true, displayName: true } },
          subject: { select: { id: true, displayName: true } },
          actions: {
            include: { moderator: { select: { id: true, displayName: true } } },
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
      services.db.agentConversation.findMany({
        where: { status: ConversationStatus.MODERATION_FLAGGED },
        select: { id: true, intentKind: true, createdAt: true, redactionPassed: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    return { reports, flaggedConversations };
  });

  app.get('/v1/admin/reports/:id', async (request) => {
    const admin = await requireAdmin(request, services.config);
    const params = parseWith(idParamsSchema, request.params);
    const report = await services.db.report.findUnique({
      where: { id: params.id },
      include: {
        conversation: {
          include: { messages: { where: { deletedAt: null }, orderBy: { turnIndex: 'asc' } } },
        },
      },
    });
    if (!report) throw new ApiError(404, 'REPORT_NOT_FOUND', 'That report was not found.');
    await logActivity(services.db, {
      userId: admin.id,
      actorType: 'ADMIN',
      action: 'moderation.report_reviewed',
      targetType: 'Report',
      targetId: report.id,
      requestId: request.id,
    });
    return {
      id: report.id,
      conversationSuppressed:
        report.conversation?.suppressedAt !== null && report.conversation !== null,
      transcriptAvailable: report.conversation?.redactionPassed === true,
      messages:
        report.conversation?.redactionPassed === true
          ? report.conversation.messages.map((message) => ({
              turn: message.turnIndex,
              side: message.speakerAgentId === report.conversation?.agentAId ? 'a' : 'b',
              text: message.redactedContent,
            }))
          : [],
      acknowledgementDueAt: new Date(report.createdAt.getTime() + 15 * 60_000).toISOString(),
      firstActionDueAt: new Date(report.createdAt.getTime() + 60 * 60_000).toISOString(),
      note: 'Closing a report or restoring an account never removes a block or automatically republishes this conversation.',
    };
  });

  app.get('/v1/admin/audit', async (request) => {
    await requireAdmin(request, services.config);
    const actions = await services.db.moderationAction.findMany({
      include: {
        moderator: { select: { id: true, displayName: true, role: true } },
        report: { select: { id: true, category: true, subjectUserId: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return actions.map((action) => ({
      id: action.id,
      reportId: action.reportId,
      action: action.action,
      reason: action.reason,
      moderator: {
        id: action.moderator.id,
        displayName: action.moderator.displayName,
        role: action.moderator.role.toLowerCase(),
      },
      report: action.report,
      createdAt: action.createdAt.toISOString(),
    }));
  });

  app.post('/v1/admin/reports/:id/action', async (request) => {
    const admin = await requireAdmin(request, services.config);
    const params = parseWith(idParamsSchema, request.params);
    const body = parseWith(
      z.object({
        action: z.enum(['acknowledge', 'first_action', 'dismiss', 'warn', 'suspend', 'restore']),
        reason: z.string().trim().min(3).max(2_000),
      }),
      request.body,
    );
    const report = await services.db.report.findUnique({ where: { id: params.id } });
    if (report === null) throw new ApiError(404, 'REPORT_NOT_FOUND', 'That report was not found.');
    await services.db.$transaction(async (tx) => {
      await lockSafetyPair(tx, report.reporterUserId, report.subjectUserId);
      const current = await tx.report.findUnique({ where: { id: report.id } });
      if (current === null)
        throw new ApiError(404, 'REPORT_NOT_FOUND', 'That report was not found.');
      if (
        ['acknowledge', 'first_action'].includes(body.action) &&
        !['OPEN', 'REVIEWING'].includes(current.status)
      )
        throw new ApiError(
          409,
          'REPORT_ALREADY_CLOSED',
          'A closed report cannot be reopened by acknowledging it.',
        );
      await tx.moderationAction.create({
        data: {
          reportId: report.id,
          moderatorId: admin.id,
          action: body.action,
          reason: body.reason,
        },
      });
      await tx.report.update({
        where: { id: report.id },
        data: {
          status: ['acknowledge', 'first_action'].includes(body.action)
            ? ReportStatus.REVIEWING
            : body.action === 'dismiss'
              ? ReportStatus.DISMISSED
              : ReportStatus.RESOLVED,
          acknowledgedAt: current.acknowledgedAt ?? new Date(),
          ...(body.action === 'acknowledge'
            ? {}
            : { firstActionAt: current.firstActionAt ?? new Date() }),
          ...(['acknowledge', 'first_action'].includes(body.action)
            ? {}
            : { resolvedBy: admin.id, resolvedAt: new Date() }),
        },
      });
      if (body.action === 'suspend') {
        await tx.user.update({
          where: { id: report.subjectUserId },
          data: { status: UserStatus.SUSPENDED },
        });
        await tx.refreshToken.updateMany({
          where: { userId: report.subjectUserId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      if (body.action === 'restore') {
        await tx.user.update({
          where: { id: report.subjectUserId },
          data: { status: UserStatus.ACTIVE },
        });
      }
      await logActivity(tx, {
        userId: report.reporterUserId,
        actorType: 'ADMIN',
        action:
          body.action === 'acknowledge'
            ? 'moderation.report_acknowledged'
            : body.action === 'first_action'
              ? 'moderation.first_action_recorded'
              : 'moderation.report_resolved',
        targetType: 'Report',
        targetId: report.id,
        payload: { action: body.action },
        requestId: request.id,
      });
    });
    if (body.action === 'suspend') services.realtime.closeUser(report.subjectUserId);
    return {
      ok: true,
      reportId: report.id,
      status: ['acknowledge', 'first_action'].includes(body.action)
        ? 'reviewing'
        : body.action === 'dismiss'
          ? 'dismissed'
          : 'resolved',
    };
  });

  app.get('/v1/admin/costs', async (request) => {
    await requireAdmin(request, services.config);
    const query = parseWith(
      z.object({ days: z.coerce.number().int().min(1).max(90).default(14) }),
      request.query,
    );
    const since = new Date(Date.now() - query.days * 86_400_000);
    const calls = await services.db.modelCall.findMany({
      where: { createdAt: { gte: since } },
      select: { userId: true, createdAt: true, costCents: true, task: true },
    });
    const buckets = new Map<
      string,
      { userId: string; date: string; costCents: number; calls: number }
    >();
    for (const call of calls) {
      const date = call.createdAt.toISOString().slice(0, 10);
      const key = `${call.userId}:${date}`;
      const current = buckets.get(key) ?? { userId: call.userId, date, costCents: 0, calls: 0 };
      current.costCents += Number(call.costCents.toString());
      current.calls += 1;
      buckets.set(key, current);
    }
    return {
      days: query.days,
      spend: [...buckets.values()].toSorted((a, b) => b.costCents - a.costCents),
    };
  });

  app.get('/v1/admin/metrics', async (request) => {
    await requireAdmin(request, services.config);
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const fourteenDaysAgo = new Date(Date.now() - 14 * 86_400_000);
    const [
      latestNightly,
      conversationsRun,
      redactionFailures,
      reportDepth,
      flaggedDepth,
      cost,
      signups,
      introductions,
      reveals,
      cohort,
      retained,
      reconnectEvents,
      pendingAlerts,
      overdueAcknowledgements,
    ] = await Promise.all([
      services.db.run.findFirst({
        where: { kind: { startsWith: 'nightly_' } },
        orderBy: { createdAt: 'desc' },
      }),
      services.db.agentConversation.count({ where: { createdAt: { gte: today } } }),
      services.db.agentConversation.count({
        where: { createdAt: { gte: today }, status: ConversationStatus.REDACTION_FAILED },
      }),
      services.db.report.count({
        where: { status: { in: [ReportStatus.OPEN, ReportStatus.REVIEWING] } },
      }),
      services.db.agentConversation.count({
        where: { status: ConversationStatus.MODERATION_FLAGGED },
      }),
      services.db.modelCall.aggregate({
        where: { createdAt: { gte: today } },
        _sum: { costCents: true },
      }),
      services.db.user.count({ where: { createdAt: { gte: today } } }),
      services.db.introduction.count({ where: { createdAt: { gte: today } } }),
      services.db.introduction.count({
        where: { createdAt: { gte: today }, revealedAt: { not: null } },
      }),
      services.db.user.count({ where: { createdAt: { lte: fourteenDaysAgo } } }),
      services.db.user.count({
        where: { createdAt: { lte: fourteenDaysAgo }, lastActiveAt: { gte: fourteenDaysAgo } },
      }),
      services.db.activityLog.groupBy({
        by: ['action'],
        where: {
          createdAt: { gte: fourteenDaysAgo },
          action: {
            in: [
              'google.token_expired',
              'google.reconnect_prompt_shown',
              'google.reconnect_started',
              'google.reconnected',
            ],
          },
        },
        _count: { _all: true },
      }),
      services.db.moderationAlert.count({ where: { status: { not: 'SENT' } } }),
      services.db.report.count({
        where: {
          status: { in: [ReportStatus.OPEN, ReportStatus.REVIEWING] },
          acknowledgedAt: null,
          createdAt: { lt: new Date(Date.now() - 15 * 60_000) },
        },
      }),
    ]);
    return {
      nightlyJobDurationMs: latestNightly?.durationMs ?? 0,
      conversationsRun,
      redactionFailures,
      moderationQueueDepth: reportDepth + flaggedDepth,
      costTodayCents: Number(cost._sum.costCents?.toString() ?? 0),
      safety: { pendingOperatorAlerts: pendingAlerts, overdueAcknowledgements },
      googleReconnect: {
        windowDays: 14,
        events: Object.fromEntries(
          reconnectEvents.map((event) => [event.action, event._count._all]),
        ),
      },
      product: {
        signups,
        introductionsSurfaced: introductions,
        revealRate: introductions === 0 ? 0 : reveals / introductions,
        day14Retention: cohort === 0 ? 0 : retained / cohort,
      },
    };
  });
};
