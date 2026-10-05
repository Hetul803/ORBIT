import {
  ProfileFactState,
  ProfileLayer,
  type MemoryKind,
  type MemorySource,
  type Prisma,
} from '@orbit/db';

import { refreshAgentProfileEmbedding } from './embeddings.js';
import type { Services } from './services.js';

export const profileLayers = [
  ProfileLayer.IDENTITY,
  ProfileLayer.PREFERENCES,
  ProfileLayer.RELATIONSHIPS,
  ProfileLayer.JUDGMENT,
  ProfileLayer.STATE,
] as const;

const json = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;

const canonical = (value: string): string =>
  value
    .toLowerCase()
    .replaceAll(/[^a-z0-9\s]/gu, ' ')
    .replaceAll(/\s+/gu, ' ')
    .trim()
    .slice(0, 180);

const expiryFor = (
  layer: ProfileLayer,
  policy: string,
  explicit: Date | null | undefined,
): Date | null => {
  if (explicit !== undefined) return explicit;
  if (layer !== ProfileLayer.STATE || policy === 'never') return null;
  const match = /^(\d{1,3})d$/u.exec(policy);
  if (match === null) return null;
  const days = Number(match[1]);
  return Number.isSafeInteger(days) && days > 0 ? new Date(Date.now() + days * 86_400_000) : null;
};

const factView = (fact: {
  id: string;
  kind: MemoryKind;
  content: string;
  confidence: number;
  source: MemorySource;
  profileLayer: ProfileLayer;
  state: ProfileFactState;
  canonicalKey: string | null;
  sourceRef: string | null;
  firstSeenAt: Date;
  lastConfirmedAt: Date;
  expiresAt: Date | null;
  expiryPolicy: string;
  observationCount: number;
  userEditedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  receipts?: readonly {
    id: string;
    createdAt: Date;
    action: string;
    reason: string;
    previous: unknown;
    next: unknown;
  }[];
}) => ({
  id: fact.id,
  layer: fact.profileLayer.toLowerCase(),
  kind: fact.kind.toLowerCase(),
  content: fact.content,
  confidence: fact.confidence,
  source: fact.source.toLowerCase(),
  sourceRef: fact.sourceRef,
  state: fact.state.toLowerCase(),
  canonicalKey: fact.canonicalKey,
  firstSeenAt: fact.firstSeenAt.toISOString(),
  lastConfirmedAt: fact.lastConfirmedAt.toISOString(),
  expiresAt: fact.expiresAt?.toISOString() ?? null,
  expiryPolicy: fact.expiryPolicy,
  observationCount: fact.observationCount,
  lockedByUser: fact.userEditedAt !== null,
  createdAt: fact.createdAt.toISOString(),
  updatedAt: fact.updatedAt.toISOString(),
  ...(fact.receipts === undefined
    ? {}
    : {
        history: fact.receipts.map((receipt) => ({
          id: receipt.id,
          at: receipt.createdAt.toISOString(),
          action: receipt.action,
          reason: receipt.reason,
          previous: receipt.previous,
          next: receipt.next,
        })),
      }),
});

export interface ProfileFactInput {
  readonly layer: ProfileLayer;
  readonly kind: MemoryKind;
  readonly content: string;
  readonly source: MemorySource;
  readonly sourceRef?: string;
  readonly confidence?: number;
  readonly expiryPolicy?: string;
  readonly expiresAt?: Date | null;
  readonly userLocked?: boolean;
  readonly canonicalKey?: string;
}

/** Applies contradiction, lock, repetition, and expiry rules for one fact. */
export const recordProfileFact = async (
  services: Services,
  agentId: string,
  input: ProfileFactInput,
) => {
  const key = input.canonicalKey ?? canonical(input.content);
  const expiryPolicy = input.expiryPolicy ?? (input.layer === ProfileLayer.STATE ? '30d' : 'never');
  const expiresAt = expiryFor(input.layer, expiryPolicy, input.expiresAt);
  const existing = await services.db.memoryFact.findFirst({
    where: {
      agentId,
      profileLayer: input.layer,
      canonicalKey: key,
      state: ProfileFactState.ACTIVE,
      deletedAt: null,
    },
    orderBy: { updatedAt: 'desc' },
  });
  const now = new Date();
  if (existing !== null && existing.userEditedAt !== null && input.userLocked !== true) {
    await services.db.profileFactReceipt.create({
      data: {
        factId: existing.id,
        action: 'ignored_locked_inference',
        reason: 'A user-edited fact cannot be replaced by an inferred observation.',
        next: json({ source: input.source, sourceRef: input.sourceRef ?? null }),
      },
    });
    return existing;
  }
  if (existing !== null && existing.content === input.content) {
    const observations = existing.observationCount + 1;
    const confidence = Math.max(
      existing.confidence,
      observations >= 3 ? 0.85 : (input.confidence ?? 0.7),
    );
    const updated = await services.db.memoryFact.update({
      where: { id: existing.id },
      data: {
        lastConfirmedAt: now,
        observationCount: observations,
        confidence,
        ...(input.userLocked === true ? { userEditedAt: now } : {}),
      },
    });
    await services.db.profileFactReceipt.create({
      data: {
        factId: updated.id,
        action: observations >= 3 ? 'repetition_promoted' : 'reconfirmed',
        reason:
          observations >= 3
            ? 'Observed in three contexts; promoted from observation to a durable belief.'
            : 'Observed again without contradiction.',
        previous: json({
          confidence: existing.confidence,
          observationCount: existing.observationCount,
        }),
        next: json({ confidence, observationCount: observations }),
      },
    });
    return updated;
  }

  const created = await services.db.memoryFact.create({
    data: {
      agentId,
      kind: input.kind,
      content: input.content,
      confidence: input.confidence ?? (input.userLocked === true ? 1 : 0.7),
      source: input.source,
      profileLayer: input.layer,
      state: ProfileFactState.ACTIVE,
      canonicalKey: key,
      ...(input.sourceRef === undefined ? {} : { sourceRef: input.sourceRef }),
      expiryPolicy,
      ...(expiresAt === null ? {} : { expiresAt }),
      ...(input.userLocked === true ? { userEditedAt: now } : {}),
    },
  });
  if (existing !== null) {
    await services.db.memoryFact.update({
      where: { id: existing.id },
      data: { state: ProfileFactState.SUPERSEDED, supersededById: created.id },
    });
    await services.db.profileFactReceipt.create({
      data: {
        factId: existing.id,
        action: 'superseded',
        reason: 'A newer fact with the same canonical key replaced it.',
        previous: json({ content: existing.content, confidence: existing.confidence }),
        next: json({ replacementId: created.id, content: created.content }),
      },
    });
  }
  await services.db.profileFactReceipt.create({
    data: {
      factId: created.id,
      action: existing === null ? 'created' : 'created_as_replacement',
      reason: existing === null ? 'New fact observed.' : 'Newer conflicting fact recorded.',
      next: json({ layer: input.layer, source: input.source, sourceRef: input.sourceRef ?? null }),
    },
  });
  return created;
};

export const consolidateProfile = async (services: Services, userId: string) => {
  const agent = await services.db.agent.findUnique({ where: { userId } });
  if (agent === null) return { expired: 0, embedded: false };
  const now = new Date();
  const expiring = await services.db.memoryFact.findMany({
    where: {
      agentId: agent.id,
      state: ProfileFactState.ACTIVE,
      expiresAt: { lte: now },
      deletedAt: null,
    },
  });
  if (expiring.length > 0) {
    await services.db.$transaction(
      expiring.flatMap((fact) => [
        services.db.memoryFact.update({
          where: { id: fact.id },
          data: { state: ProfileFactState.RETIRED },
        }),
        services.db.profileFactReceipt.create({
          data: {
            factId: fact.id,
            action: 'expired_state_retired',
            reason: 'The state fact reached its expiry date.',
          },
        }),
      ]),
    );
  }
  const embedded = await refreshAgentProfileEmbedding(services, agent.id, { userId });
  await services.db.agent.update({ where: { id: agent.id }, data: { lastConsolidatedAt: now } });
  return { expired: expiring.length, embedded };
};

export const profileForUser = async (
  services: Services,
  userId: string,
  includeHistory = false,
) => {
  const agent = await services.db.agent.findUnique({ where: { userId } });
  if (agent === null) return null;
  const facts = await services.db.memoryFact.findMany({
    where: { agentId: agent.id, deletedAt: null },
    orderBy: [{ profileLayer: 'asc' }, { updatedAt: 'desc' }],
    ...(includeHistory ? { include: { receipts: { orderBy: { createdAt: 'asc' } } } } : {}),
  });
  const layers = Object.fromEntries(
    profileLayers.map((layer) => [
      layer.toLowerCase(),
      facts.filter((fact) => fact.profileLayer === layer).map(factView),
    ]),
  );
  return {
    agent: {
      id: agent.id,
      name: agent.name,
      lastConsolidatedAt: agent.lastConsolidatedAt?.toISOString() ?? null,
    },
    layers,
  };
};

export const exportOrbitProfile = async (services: Services, userId: string) => {
  const profile = await profileForUser(services, userId, true);
  if (profile === null) return null;
  const [skills, judgments] = await Promise.all([
    services.db.skill.findMany({ where: { ownerUserId: userId, deletedAt: null } }),
    services.db.introductionOutcome.findMany({ where: { userId, deletedAt: null } }),
  ]);
  return {
    format: 'orbit-profile.json',
    version: 1,
    exportedAt: new Date().toISOString(),
    embedding: {
      model: services.config.OPENROUTER_EMBEDDING_MODEL,
      dimensions: 1536,
      included: false,
    },
    profile,
    skills: skills.map((skill) => ({
      name: skill.name,
      version: skill.version,
      definition: skill.definition,
      confidence: skill.confidence,
      status: skill.status.toLowerCase(),
    })),
    judgment: judgments.map((outcome) => ({
      met: outcome.met,
      rating: outcome.rating,
      notes: outcome.notes,
      reportedAt: outcome.reportedAt.toISOString(),
    })),
  };
};
