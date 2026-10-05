import {
  LifeItemStatus,
  ProfileFactState,
  ProfileLayer,
  ProactiveAutonomyLevel,
  ProactiveProposalStatus,
  ProactiveProposalType,
  type Prisma,
} from '@orbit/db';

import type { Services } from './services.js';

const startOfDay = (): Date => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

const actForbidden = (type: ProactiveProposalType, touchesOthers: boolean): boolean =>
  touchesOthers ||
  type === ProactiveProposalType.UNANSWERED_MESSAGE ||
  type === ProactiveProposalType.CALENDAR_CONFLICT ||
  type === ProactiveProposalType.WATCHER_HIT;

interface Candidate {
  readonly type: ProactiveProposalType;
  readonly stableKey: string;
  readonly title: string;
  readonly detail: string;
  readonly confidence: number;
  readonly reason: Prisma.InputJsonValue;
  readonly dueAt?: Date;
  readonly touchesOthers: boolean;
}

const proposalDto = (proposal: {
  id: string;
  type: ProactiveProposalType;
  level: ProactiveAutonomyLevel;
  status: ProactiveProposalStatus;
  title: string;
  detail: string;
  confidence: number;
  reason: unknown;
  reversible: boolean;
  touchesOthers: boolean;
  dueAt: Date | null;
  createdAt: Date;
  actedAt: Date | null;
}) => ({
  id: proposal.id,
  type: proposal.type.toLowerCase(),
  level: proposal.level.toLowerCase(),
  status: proposal.status.toLowerCase(),
  title: proposal.title,
  detail: proposal.detail,
  confidence: proposal.confidence,
  reason: proposal.reason,
  reversible: proposal.reversible,
  touchesOthers: proposal.touchesOthers,
  dueAt: proposal.dueAt?.toISOString() ?? null,
  createdAt: proposal.createdAt.toISOString(),
  actedAt: proposal.actedAt?.toISOString() ?? null,
});

const policyDto = (policy: {
  id: string;
  type: ProactiveProposalType;
  level: ProactiveAutonomyLevel;
  consecutiveAccepts: number;
  consecutiveDismissals: number;
  promotionOfferedAt: Date | null;
  lastChangedReason: string | null;
}) => ({
  id: policy.id,
  type: policy.type.toLowerCase(),
  level: policy.level.toLowerCase(),
  consecutiveAccepts: policy.consecutiveAccepts,
  consecutiveDismissals: policy.consecutiveDismissals,
  promotionOfferedAt: policy.promotionOfferedAt?.toISOString() ?? null,
  lastChangedReason: policy.lastChangedReason,
});

const candidatesFor = async (services: Services, userId: string): Promise<readonly Candidate[]> => {
  const now = new Date();
  const inTwoDays = new Date(now.getTime() + 2 * 86_400_000);
  const [lifeItems, watcherHits, stateFacts, judgments] = await Promise.all([
    services.db.lifeItem.findMany({
      where: { userId, status: LifeItemStatus.ACTIVE, deletedAt: null },
      orderBy: { dueAt: 'asc' },
      take: 80,
    }),
    services.db.watcherHit.findMany({
      where: { watcher: { userId }, createdAt: { gte: new Date(now.getTime() - 86_400_000) } },
      include: { watcher: true },
      take: 20,
    }),
    services.db.memoryFact.findMany({
      where: {
        agent: { userId },
        profileLayer: ProfileLayer.STATE,
        state: ProfileFactState.ACTIVE,
        deletedAt: null,
      },
      take: 100,
    }),
    services.db.memoryFact.count({
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
    const detail = item.detail;
    const reason = { lifeItemId: item.id, evidence: item.evidence } as Prisma.InputJsonValue;
    if (item.dueAt !== null && item.dueAt <= inTwoDays) {
      candidates.push({
        type: ProactiveProposalType.APPROACHING_COMMITMENT,
        stableKey: `commitment:${item.id}`,
        title: `Coming up: ${item.title}`,
        detail,
        confidence: item.confidence,
        reason,
        dueAt: item.dueAt,
        touchesOthers: false,
      });
    }
    if (/reply to|waiting|message/iu.test(`${item.title} ${detail}`)) {
      candidates.push({
        type: ProactiveProposalType.UNANSWERED_MESSAGE,
        stableKey: `unanswered:${item.id}`,
        title: item.title,
        detail,
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
        detail,
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
    const stale = now.getTime() - fact.lastConfirmedAt.getTime() >= 7 * 86_400_000;
    if (stale) {
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
  if (judgments >= 3) {
    candidates.push({
      type: ProactiveProposalType.PATTERN,
      stableKey: `judgment-pattern:${String(judgments)}`,
      title: 'A preference pattern is ready to review',
      detail:
        'Three or more judgment records are available. Confirm the pattern before it changes your defaults.',
      confidence: 0.72,
      reason: { judgmentFacts: judgments },
      touchesOthers: false,
    });
  }
  return candidates;
};

export const refreshProactiveProposals = async (
  services: Services,
  userId: string,
  dailyCap = 6,
): Promise<{ created: number; acted: number }> => {
  const existingToday = await services.db.proactiveProposal.count({
    where: { userId, createdAt: { gte: startOfDay() } },
  });
  if (existingToday >= dailyCap) return { created: 0, acted: 0 };
  const candidates = (await candidatesFor(services, userId)).slice(0, dailyCap - existingToday);
  let created = 0;
  let acted = 0;
  for (const candidate of candidates) {
    const policy = await services.db.proactivePolicy.upsert({
      where: { userId_type: { userId, type: candidate.type } },
      update: {},
      create: { userId, type: candidate.type, level: ProactiveAutonomyLevel.PROPOSE },
    });
    const canAct =
      policy.level === ProactiveAutonomyLevel.ACT &&
      !actForbidden(candidate.type, candidate.touchesOthers);
    const level = canAct ? ProactiveAutonomyLevel.ACT : policy.level;
    const status = canAct
      ? ProactiveProposalStatus.ACTED
      : level === ProactiveAutonomyLevel.OBSERVE
        ? ProactiveProposalStatus.OBSERVED
        : ProactiveProposalStatus.PROPOSED;
    const existing = await services.db.proactiveProposal.findUnique({
      where: { userId_stableKey: { userId, stableKey: candidate.stableKey } },
      select: { id: true },
    });
    await services.db.proactiveProposal.upsert({
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
    if (existing === null) created += 1;
    if (canAct) acted += 1;
  }
  return { created, acted };
};

export const listProactive = async (services: Services, userId: string) => {
  const [policies, proposals] = await Promise.all([
    services.db.proactivePolicy.findMany({ where: { userId }, orderBy: { type: 'asc' } }),
    services.db.proactiveProposal.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 80,
    }),
  ]);
  return { policies: policies.map(policyDto), proposals: proposals.map(proposalDto) };
};

export const respondToProposal = async (
  services: Services,
  userId: string,
  proposalId: string,
  decision: 'accept' | 'dismiss' | 'snooze',
) => {
  const proposal = await services.db.proactiveProposal.findFirst({
    where: { id: proposalId, userId },
  });
  if (proposal === null) return null;
  if (
    proposal.status !== ProactiveProposalStatus.PROPOSED &&
    proposal.status !== ProactiveProposalStatus.OBSERVED &&
    proposal.status !== ProactiveProposalStatus.SNOOZED
  ) {
    throw new Error('This proposal has already been decided and cannot be counted again.');
  }
  const policy = await services.db.proactivePolicy.findUnique({
    where: { userId_type: { userId, type: proposal.type } },
  });
  if (policy === null) return null;
  const status =
    decision === 'accept'
      ? ProactiveProposalStatus.ACCEPTED
      : decision === 'dismiss'
        ? ProactiveProposalStatus.DISMISSED
        : ProactiveProposalStatus.SNOOZED;
  const after =
    decision === 'accept'
      ? {
          consecutiveAccepts: policy.consecutiveAccepts + 1,
          consecutiveDismissals: 0,
          ...(policy.consecutiveAccepts + 1 >= 5 && policy.level === ProactiveAutonomyLevel.PROPOSE
            ? {
                promotionOfferedAt: new Date(),
                lastChangedReason: 'Five consecutive accepts earned an Act opt-in.',
              }
            : {}),
        }
      : decision === 'dismiss'
        ? {
            consecutiveAccepts: 0,
            consecutiveDismissals: policy.consecutiveDismissals + 1,
            ...(policy.consecutiveDismissals + 1 >= 2
              ? {
                  level: ProactiveAutonomyLevel.PROPOSE,
                  lastChangedReason: 'Two consecutive dismissals lowered autonomy.',
                }
              : {}),
          }
        : {};
  const [updated] = await services.db.$transaction([
    services.db.proactiveProposal.update({ where: { id: proposal.id }, data: { status } }),
    services.db.proactivePolicy.update({ where: { id: policy.id }, data: after }),
  ]);
  return updated;
};

export const setProactiveLevel = async (
  services: Services,
  userId: string,
  type: ProactiveProposalType,
  level: ProactiveAutonomyLevel,
) => {
  if (level === ProactiveAutonomyLevel.ACT && actForbidden(type, false)) {
    throw new Error(
      'This proposal type always needs approval because it can affect another person.',
    );
  }
  return services.db.proactivePolicy.upsert({
    where: { userId_type: { userId, type } },
    update: { level, lastChangedReason: 'Set directly by the user.' },
    create: { userId, type, level, lastChangedReason: 'Set directly by the user.' },
  });
};

export const approvePromotion = async (
  services: Services,
  userId: string,
  type: ProactiveProposalType,
) => {
  const policy = await services.db.proactivePolicy.findUnique({
    where: { userId_type: { userId, type } },
  });
  if (policy?.promotionOfferedAt === null || policy === null || policy.consecutiveAccepts < 5)
    return null;
  if (actForbidden(type, false)) {
    throw new Error(
      'This proposal type always needs approval because it can affect another person.',
    );
  }
  return services.db.proactivePolicy.update({
    where: { id: policy.id },
    data: {
      level: ProactiveAutonomyLevel.ACT,
      promotionOfferedAt: null,
      lastChangedReason: 'User approved Act level.',
    },
  });
};
