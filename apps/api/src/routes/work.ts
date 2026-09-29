import {
  GroupRole,
  InboxTriage,
  type Prisma,
  RunStatus,
  type ScreeningAction,
  SkillStatus,
} from '@orbit/db';
import {
  approveInboxSchema,
  askInterpretationSchema,
  createSkillSchema,
  createWatcherSchema,
  joinGroupSchema,
  skillCorrectionSchema,
  upsertScreeningRuleSchema,
  watcherSpecSchema,
} from '@orbit/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { requireAuth } from '../auth.js';
import { ApiError, parseWith } from '../errors.js';
import type { Services } from '../services.js';
import { asArray, asRecord, iso, logActivity } from './helpers.js';

const idParamsSchema = z.object({ id: z.string().min(8) });

const parseWatcherSpec = (naturalLanguage: string) => {
  const lower = naturalLanguage.toLowerCase();
  const price = /(?:under|below|less than)\s*\$?([\d,]+)/u.exec(lower)?.[1];
  const source = /email|inbox/u.test(lower)
    ? 'email'
    : /calendar|deadline/u.test(lower)
      ? 'calendar'
      : /file|document|drive/u.test(lower)
        ? 'files'
        : 'orbit';
  return watcherSpecSchema.parse({
    query: naturalLanguage,
    source,
    constraints:
      price === undefined ? {} : { maximumCents: Number(price.replaceAll(',', '')) * 100 },
    notifyOn: 'new match',
  });
};

const watcherDto = (watcher: {
  id: string;
  title: string;
  spec: unknown;
  schedule: string;
  active: boolean;
  lastRunAt: Date | null;
  nextRunAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  _count?: { hits: number };
}) => ({
  id: watcher.id,
  title: watcher.title,
  spec: asRecord(watcher.spec),
  schedule: watcher.schedule,
  active: watcher.active,
  lastRunAt: iso(watcher.lastRunAt),
  nextRunAt: iso(watcher.nextRunAt),
  hitCount: watcher._count?.hits ?? 0,
  createdAt: watcher.createdAt.toISOString(),
  updatedAt: watcher.updatedAt.toISOString(),
});

const runDto = (
  run: {
    id: string;
    kind: string;
    status: RunStatus;
    steps: unknown;
    costCents: { toString(): string };
    durationMs: number;
    createdAt: Date;
    modelCalls: readonly {
      id: string;
      task: string;
      provider: string;
      model: string;
      tokensIn: number;
      tokensOut: number;
      costCents: { toString(): string };
      latencyMs: number;
    }[];
  },
  firstRun: {
    durationMs: number;
    costCents: { toString(): string };
    modelCallCount: number;
    actionCount: number;
  } | null,
) => {
  const steps = asArray(run.steps);
  return {
    id: run.id,
    kind: run.kind,
    status: run.status.toLowerCase(),
    steps,
    modelCalls: run.modelCalls.map((call) => ({
      ...call,
      costCents: Number(call.costCents.toString()),
    })),
    costCents: Number(run.costCents.toString()),
    durationMs: run.durationMs,
    firstRunComparison:
      firstRun === null
        ? null
        : {
            actionsSaved: firstRun.actionCount - steps.length,
            durationSavedMs: firstRun.durationMs - run.durationMs,
            modelCallsSaved: firstRun.modelCallCount - run.modelCalls.length,
            costSavedCents:
              Number(firstRun.costCents.toString()) - Number(run.costCents.toString()),
          },
    createdAt: run.createdAt.toISOString(),
  };
};

export const registerWorkRoutes = (app: FastifyInstance, services: Services): void => {
  app.get('/v1/brief/today', async (request) => {
    const auth = await requireAuth(request, services.config);
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const brief = await services.db.dailyBrief.findUnique({
      where: { userId_forDate: { userId: auth.id, forDate: today } },
    });
    if (brief !== null) {
      if (brief.openedAt === null) {
        await services.db.dailyBrief.update({
          where: { id: brief.id },
          data: { openedAt: new Date() },
        });
      }
      return brief.payload;
    }
    const [recentRuns, needsUser] = await Promise.all([
      services.db.run.count({
        where: { userId: auth.id, status: RunStatus.SUCCEEDED, createdAt: { gte: today } },
      }),
      services.db.inboxItem.count({
        where: {
          recipientUserId: auth.id,
          triage: { in: [InboxTriage.ESCALATED, InboxTriage.HELD] },
        },
      }),
    ]);
    return {
      date: today.toISOString().slice(0, 10),
      greeting: `${String(recentRuns)} done. ${String(needsUser)} ${needsUser === 1 ? 'needs' : 'need'} you.`,
      completedCount: recentRuns,
      needsUserCount: needsUser,
      timeSavedMinutesThisWeek: 0,
      running: null,
      items: [],
    };
  });

  app.get('/v1/inbox', async (request) => {
    const auth = await requireAuth(request, services.config);
    const items = await services.db.inboxItem.findMany({
      where: { recipientUserId: auth.id, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return items.map((item) => ({
      id: item.id,
      kind: item.kind,
      subject: item.subject,
      body: item.body,
      triage: item.triage.toLowerCase(),
      agentReply: item.agentReply,
      approvedAt: iso(item.approvedAt),
      createdAt: item.createdAt.toISOString(),
    }));
  });

  app.post('/v1/inbox/:id/approve', async (request) => {
    const auth = await requireAuth(request, services.config);
    const params = parseWith(idParamsSchema, request.params);
    const body = parseWith(approveInboxSchema, request.body);
    const current = await services.db.inboxItem.findFirst({
      where: {
        id: params.id,
        recipientUserId: auth.id,
        deletedAt: null,
        approvedAt: null,
        declinedAt: null,
      },
    });
    if (current === null)
      throw new ApiError(404, 'INBOX_ITEM_NOT_FOUND', 'That inbox item is unavailable.');
    const approvedAt = new Date();
    await services.db.$transaction(async (tx) => {
      await tx.inboxItem.update({
        where: { id: current.id },
        data: { agentReply: body.editedReply, approvedAt, triage: InboxTriage.ANSWERED },
      });
      await logActivity(tx, {
        userId: auth.id,
        actorType: 'USER',
        action: 'outbound_reply.approved',
        targetType: 'InboxItem',
        targetId: current.id,
        payload: {
          approvedAt: approvedAt.toISOString(),
          edited: body.editedReply !== current.agentReply,
        },
        requestId: request.id,
      });
    });
    return { ok: true, approvedAt: approvedAt.toISOString(), sent: true };
  });

  app.post('/v1/inbox/:id/decline', async (request) => {
    const auth = await requireAuth(request, services.config);
    const params = parseWith(idParamsSchema, request.params);
    const result = await services.db.inboxItem.updateMany({
      where: { id: params.id, recipientUserId: auth.id, approvedAt: null, declinedAt: null },
      data: { declinedAt: new Date(), triage: InboxTriage.AUTO_DECLINED },
    });
    if (result.count === 0)
      throw new ApiError(404, 'INBOX_ITEM_NOT_FOUND', 'That inbox item is unavailable.');
    await logActivity(services.db, {
      userId: auth.id,
      actorType: 'USER',
      action: 'outbound_reply.declined',
      targetType: 'InboxItem',
      targetId: params.id,
      requestId: request.id,
    });
    return { ok: true };
  });

  app.get('/v1/screening-rules', async (request) => {
    const auth = await requireAuth(request, services.config);
    const rules = await services.db.screeningRule.findMany({
      where: { userId: auth.id, deletedAt: null },
      orderBy: { priority: 'asc' },
    });
    return rules.map((rule) => ({
      id: rule.id,
      matchOn: asRecord(rule.matchOn),
      action: rule.action.toLowerCase(),
      priority: rule.priority,
      createdAt: rule.createdAt.toISOString(),
      updatedAt: rule.updatedAt.toISOString(),
    }));
  });

  app.put('/v1/screening-rules/:id', async (request) => {
    const auth = await requireAuth(request, services.config);
    const params = parseWith(idParamsSchema, request.params);
    const body = parseWith(upsertScreeningRuleSchema, request.body);
    const existing = await services.db.screeningRule.findFirst({
      where: { id: params.id, userId: auth.id },
    });
    const data = {
      userId: auth.id,
      matchOn: body.matchOn as Prisma.InputJsonValue,
      action: body.action.toUpperCase() as ScreeningAction,
      priority: body.priority,
    };
    const rule =
      existing === null
        ? await services.db.screeningRule.create({ data: { id: params.id, ...data } })
        : await services.db.screeningRule.update({ where: { id: existing.id }, data });
    return {
      id: rule.id,
      matchOn: asRecord(rule.matchOn),
      action: rule.action.toLowerCase(),
      priority: rule.priority,
      createdAt: rule.createdAt.toISOString(),
      updatedAt: rule.updatedAt.toISOString(),
    };
  });

  app.get('/v1/watchers', async (request) => {
    const auth = await requireAuth(request, services.config);
    const watchers = await services.db.watcher.findMany({
      where: { userId: auth.id, deletedAt: null },
      include: { _count: { select: { hits: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return watchers.map(watcherDto);
  });

  app.post('/v1/watchers', async (request, reply) => {
    const auth = await requireAuth(request, services.config);
    const body = parseWith(createWatcherSchema, request.body);
    const interpreted = body.confirmedSpec ?? parseWatcherSpec(body.naturalLanguage);
    if (body.confirmedSpec === undefined) {
      return reply.code(202).send({
        needsConfirmation: true,
        interpretation: interpreted,
        title: body.title ?? body.naturalLanguage.slice(0, 80),
        schedule: body.schedule,
      });
    }
    const watcher = await services.db.watcher.create({
      data: {
        userId: auth.id,
        title: body.title ?? body.naturalLanguage.slice(0, 80),
        spec: interpreted as Prisma.InputJsonValue,
        schedule: body.schedule,
        active: true,
        nextRunAt: new Date(Date.now() + 15 * 60_000),
      },
      include: { _count: { select: { hits: true } } },
    });
    return reply.code(201).send(watcherDto(watcher));
  });

  app.patch('/v1/watchers/:id', async (request) => {
    const auth = await requireAuth(request, services.config);
    const params = parseWith(idParamsSchema, request.params);
    const body = parseWith(
      z.object({
        title: z.string().min(1).max(120).optional(),
        active: z.boolean().optional(),
        schedule: z.string().optional(),
        spec: watcherSpecSchema.optional(),
      }),
      request.body,
    );
    const current = await services.db.watcher.findFirst({
      where: { id: params.id, userId: auth.id, deletedAt: null },
    });
    if (current === null)
      throw new ApiError(404, 'WATCHER_NOT_FOUND', 'That watcher was not found.');
    const watcherData: Prisma.WatcherUpdateInput = {
      ...(body.title === undefined ? {} : { title: body.title }),
      ...(body.active === undefined ? {} : { active: body.active }),
      ...(body.schedule === undefined ? {} : { schedule: body.schedule }),
      ...(body.spec === undefined ? {} : { spec: body.spec as Prisma.InputJsonValue }),
    };
    const watcher = await services.db.watcher.update({
      where: { id: current.id },
      data: watcherData,
      include: { _count: { select: { hits: true } } },
    });
    return watcherDto(watcher);
  });

  app.delete('/v1/watchers/:id', async (request, reply) => {
    const auth = await requireAuth(request, services.config);
    const params = parseWith(idParamsSchema, request.params);
    const result = await services.db.watcher.updateMany({
      where: { id: params.id, userId: auth.id, deletedAt: null },
      data: { active: false, deletedAt: new Date() },
    });
    if (result.count === 0)
      throw new ApiError(404, 'WATCHER_NOT_FOUND', 'That watcher was not found.');
    return reply.code(204).send();
  });

  app.get('/v1/watchers/:id/hits', async (request) => {
    const auth = await requireAuth(request, services.config);
    const params = parseWith(idParamsSchema, request.params);
    const watcher = await services.db.watcher.findFirst({
      where: { id: params.id, userId: auth.id, deletedAt: null },
    });
    if (watcher === null)
      throw new ApiError(404, 'WATCHER_NOT_FOUND', 'That watcher was not found.');
    const hits = await services.db.watcherHit.findMany({
      where: { watcherId: watcher.id, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return hits.map((hit) => ({
      id: hit.id,
      watcherId: hit.watcherId,
      ...asRecord(hit.payload),
      seenAt: iso(hit.seenAt),
      createdAt: hit.createdAt.toISOString(),
    }));
  });

  app.get('/v1/runs', async (request) => {
    const auth = await requireAuth(request, services.config);
    const runs = await services.db.run.findMany({
      where: { userId: auth.id, deletedAt: null, kind: { not: 'agent_interview' } },
      include: { modelCalls: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return runs.map((run) => runDto(run, null));
  });

  app.get('/v1/runs/:id', async (request) => {
    const auth = await requireAuth(request, services.config);
    const params = parseWith(idParamsSchema, request.params);
    const run = await services.db.run.findFirst({
      where: { id: params.id, userId: auth.id, deletedAt: null },
      include: { modelCalls: true },
    });
    if (run === null) throw new ApiError(404, 'RUN_NOT_FOUND', 'That run was not found.');
    const first =
      run.skillId === null
        ? null
        : await services.db.run.findFirst({
            where: { userId: auth.id, skillId: run.skillId, status: RunStatus.SUCCEEDED },
            include: { _count: { select: { modelCalls: true } } },
            orderBy: { createdAt: 'asc' },
          });
    return runDto(
      run,
      first === null || first.id === run.id
        ? null
        : {
            durationMs: first.durationMs,
            costCents: first.costCents,
            modelCallCount: first._count.modelCalls,
            actionCount: asArray(first.steps).length,
          },
    );
  });

  const skillDto = (skill: {
    id: string;
    name: string;
    version: number;
    definition: unknown;
    autonomyPct: number;
    confidence: number;
    adoptionCount: number;
    status: SkillStatus;
    runCount: number;
    successCount: number;
    createdAt: Date;
    updatedAt: Date;
    usedBy?: readonly { parentSkill: { id: string; name: string } }[];
    receipts?: readonly { headline: string }[];
  }) => ({
    id: skill.id,
    name: skill.name,
    version: skill.version,
    definition: asRecord(skill.definition),
    autonomyPct: skill.autonomyPct,
    confidence: skill.confidence,
    adoptionCount: skill.adoptionCount,
    status: skill.status.toLowerCase(),
    runCount: skill.runCount,
    successRate: skill.runCount === 0 ? 0 : skill.successCount / skill.runCount,
    effect: skill.receipts?.[0]?.headline ?? 'Ready to learn from its next validated run.',
    reusedBy: skill.usedBy?.map((dependency) => dependency.parentSkill) ?? [],
    createdAt: skill.createdAt.toISOString(),
    updatedAt: skill.updatedAt.toISOString(),
  });

  app.get('/v1/skills', async (request) => {
    const auth = await requireAuth(request, services.config);
    const skills = await services.db.skill.findMany({
      where: { ownerUserId: auth.id, deletedAt: null },
      include: {
        usedBy: { include: { parentSkill: { select: { id: true, name: true } } } },
        receipts: { select: { headline: true }, orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
    });
    return skills.map(skillDto);
  });

  app.post('/v1/skills', async (request, reply) => {
    const auth = await requireAuth(request, services.config);
    const body = parseWith(createSkillSchema, request.body);
    const skill = await services.db.$transaction(async (tx) => {
      const created = await tx.skill.create({
        data: {
          ownerUserId: auth.id,
          name: body.name,
          definition: body.definition,
          autonomyPct: body.autonomyPct,
          confidence: 0.5,
          status: SkillStatus.DRAFT,
        },
      });
      await tx.skillVersion.create({
        data: {
          skillId: created.id,
          version: 1,
          definition: body.definition,
          confidence: 0.5,
          evidence: {},
          validation: { passed: false, reason: 'Awaiting a validated run' },
        },
      });
      return created;
    });
    return reply.code(201).send(skillDto(skill));
  });

  app.patch('/v1/skills/:id', async (request) => {
    const auth = await requireAuth(request, services.config);
    const params = parseWith(idParamsSchema, request.params);
    const body = parseWith(skillCorrectionSchema, request.body);
    const current = await services.db.skill.findFirst({
      where: { id: params.id, ownerUserId: auth.id, deletedAt: null },
    });
    if (current === null) throw new ApiError(404, 'SKILL_NOT_FOUND', 'That skill was not found.');
    const nextVersion = current.version + 1;
    const skill = await services.db.$transaction(async (tx) => {
      const updated = await tx.skill.update({
        where: { id: current.id },
        data: {
          definition: body.revisedDefinition,
          version: nextVersion,
          confidence: Math.max(0.5, current.confidence - 0.08),
          status: SkillStatus.VALIDATING,
        },
      });
      await tx.skillVersion.create({
        data: {
          skillId: current.id,
          version: nextVersion,
          definition: body.revisedDefinition,
          confidence: updated.confidence,
          evidence: { source: 'user_correction' },
          correction: body.correction,
          validation: { passed: false, reason: 'Revision requires replay validation' },
        },
      });
      return updated;
    });
    await logActivity(services.db, {
      userId: auth.id,
      actorType: 'USER',
      action: 'skill.revised',
      targetType: 'Skill',
      targetId: skill.id,
      payload: { version: nextVersion },
      requestId: request.id,
    });
    return skillDto(skill);
  });

  app.post('/v1/skills/:id/share', async (request, reply) => {
    const auth = await requireAuth(request, services.config);
    const params = parseWith(idParamsSchema, request.params);
    const body = parseWith(z.object({ recipientUserId: z.string().min(8) }), request.body);
    const skill = await services.db.skill.findFirst({
      where: { id: params.id, ownerUserId: auth.id, deletedAt: null },
    });
    if (skill === null) throw new ApiError(404, 'SKILL_NOT_FOUND', 'That skill was not found.');
    const inbox = await services.db.inboxItem.create({
      data: {
        recipientUserId: body.recipientUserId,
        senderUserId: auth.id,
        kind: 'skill_share',
        subject: `${skill.name} was shared with you`,
        body: `Inspect and adopt version ${String(skill.version)}. Shared skills never carry payment.`,
        triage: InboxTriage.ESCALATED,
        agentReply: null,
      },
    });
    return reply.code(201).send({ ok: true, inboxItemId: inbox.id, noPayment: true });
  });

  app.post('/v1/skills/:id/adopt', async (request, reply) => {
    const auth = await requireAuth(request, services.config);
    const params = parseWith(idParamsSchema, request.params);
    const skill = await services.db.skill.findFirst({ where: { id: params.id, deletedAt: null } });
    if (skill === null) throw new ApiError(404, 'SKILL_NOT_FOUND', 'That skill was not found.');
    await services.db.$transaction([
      services.db.skillAdoption.upsert({
        where: { skillId_userId: { skillId: skill.id, userId: auth.id } },
        update: {
          adaptedDefinition: skill.definition as Prisma.InputJsonValue,
          adoptedAt: new Date(),
        },
        create: {
          skillId: skill.id,
          userId: auth.id,
          adaptedDefinition: skill.definition as Prisma.InputJsonValue,
        },
      }),
      services.db.skill.update({
        where: { id: skill.id },
        data: { adoptionCount: { increment: 1 } },
      }),
    ]);
    return reply.code(201).send({ ok: true, skillId: skill.id, noPayment: true });
  });

  app.get('/v1/groups', async (request) => {
    const auth = await requireAuth(request, services.config);
    const memberships = await services.db.groupMember.findMany({
      where: { userId: auth.id, deletedAt: null },
      include: { group: { include: { _count: { select: { members: true } } } } },
    });
    return memberships.map(({ group }) => ({
      id: group.id,
      kind: group.kind.toLowerCase(),
      name: group.name,
      visibility: group.visibility.toLowerCase(),
      memberCount: group._count.members,
      createdAt: group.createdAt.toISOString(),
    }));
  });

  app.post('/v1/groups/join', async (request, reply) => {
    const auth = await requireAuth(request, services.config);
    const body = parseWith(joinGroupSchema, request.body);
    const group = await services.db.group.findUnique({ where: { joinCode: body.code } });
    if (group?.deletedAt !== null)
      throw new ApiError(404, 'GROUP_NOT_FOUND', 'That join code is invalid.');
    await services.db.groupMember.upsert({
      where: { groupId_userId: { groupId: group.id, userId: auth.id } },
      update: { deletedAt: null, joinedAt: new Date() },
      create: { groupId: group.id, userId: auth.id, role: GroupRole.MEMBER },
    });
    return reply.code(201).send({ ok: true, groupId: group.id, name: group.name });
  });

  app.get('/v1/groups/:id/skills', async (request) => {
    const auth = await requireAuth(request, services.config);
    const params = parseWith(idParamsSchema, request.params);
    const membership = await services.db.groupMember.findFirst({
      where: { groupId: params.id, userId: auth.id, deletedAt: null },
    });
    if (membership === null)
      throw new ApiError(
        403,
        'GROUP_MEMBERSHIP_REQUIRED',
        'Join the group to view its skill shelf.',
      );
    const skills = await services.db.skill.findMany({
      where: { groupId: params.id, deletedAt: null },
      orderBy: { adoptionCount: 'desc' },
    });
    return skills.map(skillDto);
  });

  app.post('/v1/ask/interpret', async (request) => {
    await requireAuth(request, services.config);
    const body = parseWith(askInterpretationSchema, request.body);
    const input = body.input.toLowerCase();
    const kind = /watch|let me know|notify|when .* appears/u.test(input)
      ? 'watcher'
      : /have|selling|looking for|need a .*book|trade/u.test(input)
        ? 'exchange'
        : /pause|turn on|match me|looking for a (?:friend|roommate|mentor)/u.test(input)
          ? 'intent'
          : /what do you know|remember about me|my agent/u.test(input)
            ? 'agent_question'
            : 'task';
    const structured =
      kind === 'watcher'
        ? parseWatcherSpec(body.input)
        : kind === 'exchange'
          ? {
              description: body.input,
              direction: /I have|selling|offering/iu.test(body.input) ? 'have' : 'want',
            }
          : { input: body.input };
    return {
      kind,
      confidence: 0.86,
      summary: `ORBIT interpreted this as a ${kind.replace('_', ' ')} request.`,
      structured,
      requiresApproval: true,
    };
  });
};
