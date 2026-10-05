import { randomBytes } from 'node:crypto';

import { MemoryKind, MemorySource, ProfileLayer, SkillStatus, type Prisma } from '@orbit/db';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { requireAuth } from '../auth.js';
import { ApiError, parseWith } from '../errors.js';
import {
  consolidateProfile,
  exportOrbitProfile,
  profileForUser,
  recordProfileFact,
} from '../profile.js';
import type { Services } from '../services.js';

const layerByName: Readonly<Record<string, ProfileLayer>> = {
  identity: ProfileLayer.IDENTITY,
  preferences: ProfileLayer.PREFERENCES,
  relationships: ProfileLayer.RELATIONSHIPS,
  judgment: ProfileLayer.JUDGMENT,
  state: ProfileLayer.STATE,
};

const kindByName: Readonly<Record<string, MemoryKind>> = {
  trait: MemoryKind.TRAIT,
  preference: MemoryKind.PREFERENCE,
  goal: MemoryKind.GOAL,
  constraint: MemoryKind.CONSTRAINT,
  person: MemoryKind.PERSON,
  event: MemoryKind.EVENT,
  voice: MemoryKind.VOICE,
};

const importFactSchema = z.object({
  layer: z.string(),
  kind: z.string(),
  content: z.string().trim().min(1).max(8_000),
  confidence: z.number().min(0).max(1).optional(),
  sourceRef: z.string().max(1_000).nullable().optional(),
  canonicalKey: z.string().max(180).nullable().optional(),
  expiresAt: z.iso.datetime().nullable().optional(),
  expiryPolicy: z.string().max(100).optional(),
  lockedByUser: z.boolean().optional(),
});

const importSchema = z.object({
  format: z.literal('orbit-profile.json'),
  version: z.literal(1),
  profile: z.object({
    agent: z.object({ name: z.string().trim().min(1).max(48) }),
    layers: z.record(z.string(), z.array(importFactSchema)),
  }),
  skills: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        version: z.number().int().positive().optional(),
        definition: z.unknown(),
        confidence: z.number().min(0).max(1).optional(),
        status: z.string().optional(),
      }),
    )
    .optional(),
  judgment: z
    .array(
      z.object({
        met: z.boolean(),
        rating: z.number().int().min(1).max(5).nullable().optional(),
        notes: z.string().max(8_000).nullable().optional(),
        reportedAt: z.iso.datetime().optional(),
      }),
    )
    .optional(),
});

const importedSkillStatus = (value: string | undefined): SkillStatus => {
  const candidate = value?.toUpperCase();
  return candidate === 'ACTIVE' || candidate === 'PAUSED' || candidate === 'RETIRED'
    ? candidate
    : SkillStatus.DRAFT;
};

export const registerProfileRoutes = (app: FastifyInstance, services: Services): void => {
  app.get('/v1/profile', async (request) => {
    const auth = await requireAuth(request, services.config);
    const profile = await profileForUser(services, auth.id, true);
    if (profile === null) throw new ApiError(404, 'AGENT_NOT_FOUND', 'Create your agent first.');
    return profile;
  });

  app.post('/v1/profile/consolidate', async (request) => {
    const auth = await requireAuth(request, services.config);
    return consolidateProfile(services, auth.id);
  });

  app.get('/v1/profile/export', async (request, reply) => {
    const auth = await requireAuth(request, services.config);
    const payload = await exportOrbitProfile(services, auth.id);
    if (payload === null) throw new ApiError(404, 'AGENT_NOT_FOUND', 'Create your agent first.');
    return reply
      .header('content-type', 'application/json; charset=utf-8')
      .header('content-disposition', 'attachment; filename="orbit-profile.json"')
      .send(payload);
  });

  app.post('/v1/profile/import', async (request) => {
    const auth = await requireAuth(request, services.config);
    const body = parseWith(importSchema, request.body);
    let agent = await services.db.agent.findUnique({ where: { userId: auth.id } });
    agent ??= await services.db.agent.create({
      data: {
        userId: auth.id,
        name: body.profile.agent.name,
        identitySeed: randomBytes(18).toString('base64url'),
        voiceProfile: {},
        autonomyDefaults: {},
      },
    });
    let importedFacts = 0;
    for (const [layerName, entries] of Object.entries(body.profile.layers)) {
      const layer = layerByName[layerName];
      if (layer === undefined) continue;
      for (const entry of entries) {
        const kind = kindByName[entry.kind];
        if (kind === undefined) continue;
        await recordProfileFact(services, agent.id, {
          layer,
          kind,
          content: entry.content,
          source: MemorySource.IMPORT,
          ...(entry.sourceRef === null || entry.sourceRef === undefined
            ? {}
            : { sourceRef: entry.sourceRef }),
          ...(entry.confidence === undefined ? {} : { confidence: entry.confidence }),
          ...(entry.canonicalKey === null || entry.canonicalKey === undefined
            ? {}
            : { canonicalKey: entry.canonicalKey }),
          ...(entry.expiryPolicy === undefined ? {} : { expiryPolicy: entry.expiryPolicy }),
          ...(entry.expiresAt === null || entry.expiresAt === undefined
            ? {}
            : { expiresAt: new Date(entry.expiresAt) }),
          ...(entry.lockedByUser === true ? { userLocked: true } : {}),
        });
        importedFacts += 1;
      }
    }
    let importedSkills = 0;
    for (const skill of body.skills ?? []) {
      const existing = await services.db.skill.findFirst({
        where: { ownerUserId: auth.id, name: skill.name, deletedAt: null },
        select: { id: true },
      });
      if (existing !== null) continue;
      await services.db.skill.create({
        data: {
          ownerUserId: auth.id,
          name: skill.name,
          version: skill.version ?? 1,
          definition: skill.definition as Prisma.InputJsonValue,
          confidence: skill.confidence ?? 0.5,
          status: importedSkillStatus(skill.status),
        },
      });
      importedSkills += 1;
    }
    let importedJudgments = 0;
    for (const outcome of body.judgment ?? []) {
      const content = [
        `Imported outcome: ${outcome.met ? 'met' : 'did not meet'}.`,
        outcome.rating === null || outcome.rating === undefined
          ? ''
          : `Rating ${String(outcome.rating)}/5.`,
        outcome.notes ?? '',
      ]
        .filter(Boolean)
        .join(' ');
      if (content.length === 0) continue;
      await recordProfileFact(services, agent.id, {
        layer: ProfileLayer.JUDGMENT,
        kind: MemoryKind.EVENT,
        content,
        source: MemorySource.IMPORT,
        sourceRef: outcome.reportedAt ?? 'orbit-profile outcome import',
        confidence: 0.7,
      });
      importedJudgments += 1;
    }
    const consolidated = await consolidateProfile(services, auth.id);
    return {
      imported: { facts: importedFacts, skills: importedSkills, judgments: importedJudgments },
      consolidated,
      profile: await profileForUser(services, auth.id, true),
    };
  });
};
