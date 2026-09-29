import {
  rerankCandidates,
  runBoundedConversation,
  selectCandidates,
  type AgentPersona,
  type Candidate,
} from '@orbit/agent';
import {
  ConversationStatus,
  MatchStatus,
  RevealDecision,
  RunStatus,
  type IntentKind,
  type Prisma,
  type PrismaClient,
} from '@orbit/db';
import type { ModelRouter } from '@orbit/llm';
import type { IntentKind as ApiIntentKind } from '@orbit/shared';

import type { WorkerConfig } from '../config.js';

type LoadedAgent = Awaited<ReturnType<typeof loadAgents>>[number];

const loadAgents = async (db: PrismaClient) =>
  db.agent.findMany({
    where: {
      deletedAt: null,
      user: { status: 'ACTIVE', deletedAt: null },
    },
    include: {
      user: { include: { intents: { where: { active: true, deletedAt: null } } } },
      memoryFacts: { where: { deletedAt: null, supersededById: null } },
    },
  });

const toApiIntent = (kind: IntentKind): ApiIntentKind => kind.toLowerCase() as ApiIntentKind;

const tokens = (value: string): Set<string> =>
  new Set(value.toLowerCase().match(/[a-z0-9]{3,}/gu) ?? []);

const lexicalScore = (left: string, right: string): number => {
  const a = tokens(left);
  const b = tokens(right);
  if (a.size === 0 || b.size === 0) return 0.25;
  const overlap = [...a].filter((token) => b.has(token)).length;
  return Math.min(0.99, 0.25 + overlap / Math.max(a.size, b.size));
};

const profileText = (agent: LoadedAgent): string =>
  [agent.profileSummary, ...agent.memoryFacts.map((fact) => fact.content)].join(' ');

const voice = (value: Prisma.JsonValue): AgentPersona['voice'] => {
  const record =
    typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return {
    tone: Array.isArray(record.tone)
      ? record.tone.filter((item): item is string => typeof item === 'string')
      : [],
    sentenceStyle:
      typeof record.sentenceStyle === 'string' ? record.sentenceStyle : 'direct and concise',
    avoids: Array.isArray(record.avoids)
      ? record.avoids.filter((item): item is string => typeof item === 'string')
      : [],
  };
};

const persona = (agent: LoadedAgent): AgentPersona => ({
  agentId: agent.id,
  agentName: agent.name,
  facts: agent.memoryFacts.map((fact) => ({
    kind: fact.kind.toLowerCase() as AgentPersona['facts'][number]['kind'],
    content: fact.content,
    confidence: fact.confidence,
  })),
  voice: voice(agent.voiceProfile),
});

const pairKey = (left: string, right: string, intent: string): string =>
  [left, right].toSorted().join(':') + `:${intent}`;

const storeConversation = async (
  db: PrismaClient,
  input: {
    source: LoadedAgent;
    target: LoadedAgent;
    intent: LoadedAgent['user']['intents'][number];
    router: ModelRouter;
    matchScore: number;
  },
): Promise<boolean> => {
  const run = await db.run.create({
    data: {
      userId: input.source.userId,
      kind: 'nightly_introduction',
      status: RunStatus.RUNNING,
      startedAt: new Date(),
      steps: [{ name: 'Compatibility conversation', status: 'running', detail: '', durationMs: 0 }],
    },
  });
  const conversation = await db.agentConversation.create({
    data: {
      intentKind: input.intent.kind,
      agentAId: input.source.id,
      agentBId: input.target.id,
      status: ConversationStatus.RUNNING,
    },
  });
  const startedAt = Date.now();
  try {
    const result = await runBoundedConversation(
      persona(input.source),
      persona(input.target),
      {
        kind: toApiIntent(input.intent.kind),
        params: input.intent.params as Record<string, unknown>,
      },
      input.router,
      {
        maxTurns: 8,
        maxTokenBudget: 8_000,
        userId: input.source.userId,
        runId: run.id,
        conversationId: conversation.id,
      },
    );
    const status =
      result.status === 'completed'
        ? ConversationStatus.COMPLETED
        : result.status === 'ended_early'
          ? ConversationStatus.ENDED_EARLY
          : result.status === 'moderation_flagged'
            ? ConversationStatus.MODERATION_FLAGGED
            : ConversationStatus.REDACTION_FAILED;
    await db.$transaction(async (tx) => {
      for (const turn of result.turns) {
        await tx.agentMessage.create({
          data: {
            conversationId: conversation.id,
            speakerAgentId: turn.speakerAgentId,
            turnIndex: turn.turnIndex,
            contentHash: turn.originalContentHash,
            redactedContent: turn.content,
          },
        });
      }
      await tx.agentConversation.update({
        where: { id: conversation.id },
        data: {
          status,
          turnCount: result.turns.length,
          redactionPassed: result.redactionPassed,
          ...(result.verdict === null ? {} : { verdict: result.verdict }),
          endedAt: new Date(),
        },
      });
      await tx.matchCandidate.update({
        where: {
          intentKind_agentAId_agentBId: {
            intentKind: input.intent.kind,
            agentAId: input.source.id,
            agentBId: input.target.id,
          },
        },
        data: { status: MatchStatus.CONVERSED },
      });
      if (result.redactionPassed && result.verdict !== null && result.verdict.score >= 60) {
        await tx.introduction.create({
          data: {
            conversationId: conversation.id,
            userAId: input.source.userId,
            userBId: input.target.userId,
            userADecision: RevealDecision.PENDING,
            userBDecision: RevealDecision.PENDING,
            expiresAt: new Date(Date.now() + 14 * 86_400_000),
          },
        });
      }
      await tx.run.update({
        where: { id: run.id },
        data: {
          status: RunStatus.SUCCEEDED,
          costCents: result.modelCostCents,
          durationMs: Date.now() - startedAt,
          endedAt: new Date(),
          steps: [
            {
              name: 'Compatibility conversation',
              status: 'succeeded',
              detail: result.redactionPassed
                ? 'Redacted transcript passed.'
                : 'No introduction created.',
              durationMs: Date.now() - startedAt,
            },
          ],
        },
      });
    });
    return result.redactionPassed && result.verdict !== null && result.verdict.score >= 60;
  } catch (error: unknown) {
    await db.$transaction([
      db.agentConversation.update({
        where: { id: conversation.id },
        data: { status: ConversationStatus.REDACTION_FAILED, endedAt: new Date() },
      }),
      db.run.update({
        where: { id: run.id },
        data: {
          status: RunStatus.FAILED,
          endedAt: new Date(),
          durationMs: Date.now() - startedAt,
          steps: [
            {
              name: 'Compatibility conversation',
              status: 'failed',
              detail: error instanceof Error ? error.message : 'Unknown worker failure',
              durationMs: Date.now() - startedAt,
            },
          ],
        },
      }),
    ]);
    return false;
  }
};

const buildBriefs = async (db: PrismaClient): Promise<void> => {
  const users = await db.user.findMany({ where: { status: 'ACTIVE', deletedAt: null } });
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  for (const user of users) {
    const [introductions, hits, runs] = await Promise.all([
      db.introduction.findMany({
        where: {
          createdAt: { gte: today },
          OR: [{ userAId: user.id }, { userBId: user.id }],
        },
        include: { conversation: true },
        take: 8,
      }),
      db.watcherHit.findMany({
        where: { createdAt: { gte: today }, watcher: { userId: user.id } },
        include: { watcher: true },
        take: 8,
      }),
      db.run.findMany({
        where: { userId: user.id, createdAt: { gte: today }, status: RunStatus.SUCCEEDED },
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),
    ]);
    const verdictReason = (value: Prisma.JsonValue | null): string => {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return 'Review the conversation.';
      }
      const reason = (value as Record<string, unknown>).oneLineReason;
      return typeof reason === 'string' ? reason : 'Review the conversation.';
    };
    const items = [
      ...introductions.map((intro) => ({
        id: intro.id,
        kind: 'introduction',
        title: 'Your agents found a promising fit',
        detail: verdictReason(intro.conversation.verdict),
        skillName: 'INTRODUCTIONS',
        durationMs: 0,
        autonomy: 0.62,
        needsUser: true,
        href: `/introductions/${intro.id}`,
      })),
      ...hits.map((hit) => ({
        id: hit.id,
        kind: 'watcher_hit',
        title: hit.watcher.title,
        detail: 'A monitored condition has a new match.',
        skillName: 'WATCHER',
        durationMs: 0,
        autonomy: 0.95,
        needsUser: false,
        href: `/watchers/${hit.watcherId}`,
      })),
      ...runs.slice(0, 4).map((run) => ({
        id: run.id,
        kind: 'task',
        title: run.kind.replaceAll('_', ' '),
        detail: 'Completed with a visible receipt.',
        skillName: run.kind.toUpperCase(),
        durationMs: run.durationMs,
        autonomy: 0.7,
        needsUser: false,
        href: `/runs/${run.id}`,
      })),
    ];
    await db.dailyBrief.upsert({
      where: { userId_forDate: { userId: user.id, forDate: today } },
      update: {
        payload: {
          date: today.toISOString().slice(0, 10),
          greeting:
            items.length === 0
              ? 'Quiet night. Nothing needs you.'
              : `${String(items.length)} things moved while you slept.`,
          completedCount: runs.length + hits.length,
          needsUserCount: introductions.length,
          timeSavedMinutesThisWeek: Math.round(
            runs.reduce((sum, run) => sum + run.durationMs, 0) / 60_000,
          ),
          running: null,
          items,
        },
      },
      create: {
        userId: user.id,
        forDate: today,
        payload: {
          date: today.toISOString().slice(0, 10),
          greeting:
            items.length === 0
              ? 'Quiet night. Nothing needs you.'
              : `${String(items.length)} things moved while you slept.`,
          completedCount: runs.length + hits.length,
          needsUserCount: introductions.length,
          timeSavedMinutesThisWeek: Math.round(
            runs.reduce((sum, run) => sum + run.durationMs, 0) / 60_000,
          ),
          running: null,
          items,
        },
      },
    });
  }
};

export const runNightly = async (
  db: PrismaClient,
  router: ModelRouter,
  config: WorkerConfig,
): Promise<{ introductions: number }> => {
  const agents = await loadAgents(db);
  const [blocks, existing] = await Promise.all([
    db.block.findMany({ where: { deletedAt: null } }),
    db.introduction.findMany({ include: { conversation: true } }),
  ]);
  const blocked = new Set(
    blocks.flatMap((block) => [
      `${block.blockerUserId}:${block.blockedUserId}`,
      `${block.blockedUserId}:${block.blockerUserId}`,
    ]),
  );
  const previouslyIntroduced = new Set(
    existing.map((intro) => pairKey(intro.userAId, intro.userBId, intro.conversation.intentKind)),
  );
  const processed = new Set<string>();
  const createdByUser = new Map<string, number>();
  let introductions = 0;

  for (const source of agents) {
    for (const intent of source.user.intents) {
      if (intent.pausedUntil !== null && intent.pausedUntil > new Date()) continue;
      if ((createdByUser.get(source.userId) ?? 0) >= config.INTRODUCTIONS_PER_USER_PER_DAY)
        continue;
      const potential = agents.filter(
        (candidate) =>
          candidate.id !== source.id &&
          candidate.user.intents.some((value) => value.kind === intent.kind) &&
          !processed.has(pairKey(source.userId, candidate.userId, intent.kind)),
      );
      const candidates: Candidate[] = potential.map((candidate) => ({
        agentId: candidate.id,
        retrievalScore: lexicalScore(profileText(source), profileText(candidate)),
        compatible: true,
        sameScope:
          source.user.campusId === null ||
          candidate.user.campusId === null ||
          source.user.campusId === candidate.user.campusId,
        withinAgeBand: true,
        blocked: blocked.has(`${source.userId}:${candidate.userId}`),
        alreadyIntroduced: previouslyIntroduced.has(
          pairKey(source.userId, candidate.userId, intent.kind),
        ),
        activeWithin14Days: candidate.user.lastActiveAt >= new Date(Date.now() - 14 * 86_400_000),
      }));
      const selected = selectCandidates(candidates);
      if (selected.length === 0) continue;
      const run = await db.run.create({
        data: {
          userId: source.userId,
          kind: 'nightly_rerank',
          status: RunStatus.RUNNING,
          startedAt: new Date(),
        },
      });
      const ranked = await rerankCandidates(
        selected,
        new Map(potential.map((candidate) => [candidate.id, profileText(candidate)])),
        { kind: toApiIntent(intent.kind), params: intent.params as Record<string, unknown> },
        router,
        { userId: source.userId, runId: run.id },
      );
      await db.run.update({
        where: { id: run.id },
        data: { status: RunStatus.SUCCEEDED, endedAt: new Date() },
      });
      const top = ranked[0];
      if (top === undefined) continue;
      const target = potential.find((candidate) => candidate.id === top.agentId);
      if (target === undefined) continue;
      const key = pairKey(source.userId, target.userId, intent.kind);
      processed.add(key);
      await db.matchCandidate.upsert({
        where: {
          intentKind_agentAId_agentBId: {
            intentKind: intent.kind,
            agentAId: source.id,
            agentBId: target.id,
          },
        },
        update: {
          retrievalScore: top.retrievalScore,
          rerankScore: top.rerankScore,
          reason: top.rationale,
          status: MatchStatus.PENDING,
        },
        create: {
          intentKind: intent.kind,
          agentAId: source.id,
          agentBId: target.id,
          retrievalScore: top.retrievalScore,
          rerankScore: top.rerankScore,
          reason: top.rationale,
        },
      });
      const created = await storeConversation(db, {
        source,
        target,
        intent,
        router,
        matchScore: top.rerankScore,
      });
      if (created) {
        introductions += 1;
        createdByUser.set(source.userId, (createdByUser.get(source.userId) ?? 0) + 1);
        createdByUser.set(target.userId, (createdByUser.get(target.userId) ?? 0) + 1);
      }
    }
  }
  await buildBriefs(db);
  return { introductions };
};
