import {
  LifeItemStatus,
  ProfileFactState,
  ProfileLayer,
  ProactiveAutonomyLevel,
  ProactiveProposalStatus,
  ProactiveProposalType,
  type Prisma,
  type PrismaClient,
} from '@orbit/db';

import type { WorkerConfig } from '../config.js';

const dayStart = (): Date => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

const forbiddenToAct = (type: ProactiveProposalType, touchesOthers: boolean): boolean =>
  touchesOthers ||
  type === ProactiveProposalType.UNANSWERED_MESSAGE ||
  type === ProactiveProposalType.CALENDAR_CONFLICT ||
  type === ProactiveProposalType.WATCHER_HIT;

interface Candidate {
  type: ProactiveProposalType;
  stableKey: string;
  title: string;
  detail: string;
  confidence: number;
  reason: Prisma.InputJsonValue;
  dueAt?: Date;
  touchesOthers: boolean;
}

/**
 * Derives reviewable suggestions entirely from already-authorized ORBIT data.
 * This deliberately has no outbound side effects: ACT only marks a safe,
 * reversible local suggestion as handled. Communication, calendar, and watcher
 * candidates always stop at PROPOSE.
 */
const candidatesFor = async (db: PrismaClient, userId: string): Promise<Candidate[]> => {
  const now = new Date();
  const inTwoDays = new Date(now.getTime() + 2 * 86_400_000);
  const [lifeItems, watcherHits, stateFacts, judgmentCount] = await Promise.all([
    db.lifeItem.findMany({
      where: { userId, status: LifeItemStatus.ACTIVE, deletedAt: null },
      orderBy: { dueAt: 'asc' },
      take: 80,
    }),
    db.watcherHit.findMany({
      where: { watcher: { userId }, createdAt: { gte: new Date(now.getTime() - 86_400_000) } },
      include: { watcher: true },
      take: 20,
    }),
    db.memoryFact.findMany({
      where: {
        agent: { userId },
        profileLayer: ProfileLayer.STATE,
        state: ProfileFactState.ACTIVE,
        deletedAt: null,
      },
      take: 100,
    }),
    db.memoryFact.count({
      where: {
        agent: { userId },
        profileLayer: ProfileLayer.JUDGMENT,
        state: ProfileFactState.ACTIVE,
        deletedAt: null,
      },
    }),
  ]);
  const candidates: Candidate[] = [];
  for (const item of lifeItems) {
    const reason = { lifeItemId: item.id, evidence: item.evidence } as Prisma.InputJsonValue;
    if (item.dueAt !== null && item.dueAt <= inTwoDays) {
      candidates.push({
        type: ProactiveProposalType.APPROACHING_COMMITMENT,
        stableKey: `commitment:${item.id}`,
        title: `Coming up: ${item.title}`,
        detail: item.detail,
        confidence: item.confidence,
        reason,
        dueAt: item.dueAt,
        touchesOthers: false,
      });
    }
    if (/reply to|waiting|message/iu.test(`${item.title} ${item.detail}`)) {
      candidates.push({
        type: ProactiveProposalType.UNANSWERED_MESSAGE,
        stableKey: `unanswered:${item.id}`,
        title: item.title,
        detail: item.detail,
        confidence: item.confidence,
        reason,
        touchesOthers: true,
      });
    }
    if (/calendar conflict/iu.test(item.title)) {
      candidates.push({
        type: ProactiveProposalType.CALENDAR_CONFLICT,
        stableKey: `calendar:${item.id}`,
        title: item.title,
        detail: item.detail,
        confidence: item.confidence,
        reason,
        ...(item.dueAt === null ? {} : { dueAt: item.dueAt }),
        touchesOthers: true,
      });
    }
  }
  for (const hit of watcherHits) {
    candidates.push({
      type: ProactiveProposalType.WATCHER_HIT,
      stableKey: `watcher:${hit.id}`,
      title: hit.watcher.title,
      detail: 'A watcher found a new result. Review the cited source before acting.',
      confidence: 0.9,
      reason: { watcherId: hit.watcherId, watcherHitId: hit.id, payload: hit.payload },
      touchesOthers: true,
    });
  }
  for (const fact of stateFacts) {
    if (now.getTime() - fact.lastConfirmedAt.getTime() >= 7 * 86_400_000) {
      candidates.push({
        type: ProactiveProposalType.STALE_PROJECT,
        stableKey: `stale-state:${fact.id}`,
        title: `Check on: ${fact.content.slice(0, 80)}`,
        detail: 'This state has not been confirmed in at least seven days.',
        confidence: Math.max(0.4, fact.confidence),
        reason: { factId: fact.id, lastConfirmedAt: fact.lastConfirmedAt.toISOString() },
        touchesOthers: false,
      });
    }
    if (fact.expiresAt !== null && fact.expiresAt <= inTwoDays) {
      candidates.push({
        type: ProactiveProposalType.RECURRING_TASK,
        stableKey: `state-due:${fact.id}:${fact.expiresAt.toISOString().slice(0, 10)}`,
        title: `Due soon: ${fact.content.slice(0, 80)}`,
        detail: `This state expires under its ${fact.expiryPolicy} policy.`,
        confidence: fact.confidence,
        reason: { factId: fact.id, expiresAt: fact.expiresAt.toISOString() },
        dueAt: fact.expiresAt,
        touchesOthers: false,
      });
    }
  }
  if (judgmentCount >= 3) {
    candidates.push({
      type: ProactiveProposalType.PATTERN,
      stableKey: `judgment-pattern:${String(judgmentCount)}`,
      title: 'A preference pattern is ready to review',
      detail:
        'Three or more judgment records are available. Confirm the pattern before it changes your defaults.',
      confidence: 0.72,
      reason: { judgmentFacts: judgmentCount },
      touchesOthers: false,
    });
  }
  return candidates;
};

const refreshUser = async (db: PrismaClient, userId: string, dailyCap: number) => {
  const used = await db.proactiveProposal.count({
    where: { userId, createdAt: { gte: dayStart() } },
  });
  if (used >= dailyCap) return { created: 0, acted: 0 };
  let created = 0;
  let acted = 0;
  for (const candidate of (await candidatesFor(db, userId)).slice(0, dailyCap - used)) {
    const policy = await db.proactivePolicy.upsert({
      where: { userId_type: { userId, type: candidate.type } },
      update: {},
      create: { userId, type: candidate.type, level: ProactiveAutonomyLevel.PROPOSE },
    });
    const canAct =
      policy.level === ProactiveAutonomyLevel.ACT &&
      !forbiddenToAct(candidate.type, candidate.touchesOthers);
    const level = canAct ? ProactiveAutonomyLevel.ACT : policy.level;
    const status = canAct
      ? ProactiveProposalStatus.ACTED
      : level === ProactiveAutonomyLevel.OBSERVE
        ? ProactiveProposalStatus.OBSERVED
        : ProactiveProposalStatus.PROPOSED;
    const prior = await db.proactiveProposal.findUnique({
      where: { userId_stableKey: { userId, stableKey: candidate.stableKey } },
      select: { id: true },
    });
    await db.proactiveProposal.upsert({
      where: { userId_stableKey: { userId, stableKey: candidate.stableKey } },
      update: {
        policyId: policy.id,
        level,
        status,
        title: candidate.title,
        detail: candidate.detail,
        confidence: candidate.confidence,
        reason: candidate.reason,
        touchesOthers: candidate.touchesOthers,
        ...(candidate.dueAt === undefined ? {} : { dueAt: candidate.dueAt }),
        ...(canAct ? { actedAt: new Date() } : {}),
      },
      create: {
        userId,
        policyId: policy.id,
        type: candidate.type,
        level,
        status,
        stableKey: candidate.stableKey,
        title: candidate.title,
        detail: candidate.detail,
        confidence: candidate.confidence,
        reason: candidate.reason,
        touchesOthers: candidate.touchesOthers,
        ...(candidate.dueAt === undefined ? {} : { dueAt: candidate.dueAt }),
        ...(canAct ? { actedAt: new Date() } : {}),
      },
    });
    if (prior === null) created += 1;
    if (canAct) acted += 1;
  }
  return { created, acted };
};

/** Runs independently per user so one cap or database failure does not stop the batch. */
export const runProactive = async (
  db: PrismaClient,
  config: WorkerConfig,
): Promise<{ users: number; created: number; acted: number; failed: number }> => {
  const users = await db.user.findMany({
    where: { status: 'ACTIVE', deletedAt: null },
    select: { id: true },
  });
  let created = 0;
  let acted = 0;
  let failed = 0;
  for (const user of users) {
    try {
      const result = await refreshUser(db, user.id, config.PROACTIVE_DAILY_CAP);
      created += result.created;
      acted += result.acted;
    } catch {
      failed += 1;
    }
  }
  return { users: users.length, created, acted, failed };
};
