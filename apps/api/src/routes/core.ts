import { randomBytes } from 'node:crypto';

import {
  ExchangeDirection,
  IntentKind,
  MemoryKind,
  MemorySource,
  type Prisma,
  type Urgency,
  UserStatus,
  type PrismaClient,
} from '@orbit/db';
import {
  createAgentSchema,
  createExchangeItemSchema,
  intentKindSchema,
  interviewTurnSchema,
  updateAgentSchema,
  updateMemoryFactSchema,
  upsertIntentSchema,
} from '@orbit/shared';
import AdmZip from 'adm-zip';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { requireAuth } from '../auth.js';
import { encryptField, signExport } from '../crypto.js';
import {
  embedMemoryAndProfile,
  refreshAgentProfileEmbedding,
  storeMemoryEmbedding,
} from '../embeddings.js';
import { ApiError, parseWith } from '../errors.js';
import type { Services } from '../services.js';
import { asArray, asRecord, iso, logActivity, publicUser } from './helpers.js';

const idParamsSchema = z.object({ id: z.string().min(8) });
const updateMeSchema = z.object({
  displayName: z.string().trim().min(1).max(80).optional(),
  handle: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9_]+$/)
    .nullable()
    .optional(),
  locale: z.string().min(2).max(16).optional(),
  timezone: z.string().min(3).max(80).optional(),
});

const interviewQuestions = [
  'When a week goes well for you, what usually made the difference?',
  'What kinds of people give you energy, and what kinds drain it?',
  'When you make a hard decision, what do you protect first?',
  'What are you trying to change in the next six months?',
  'How should your agent sound when it drafts something for you?',
  'What should your agent never assume or do without asking?',
] as const;

const intentFromApi = (value: string): IntentKind => {
  const map: Record<string, IntentKind> = {
    dating: IntentKind.DATING,
    friendship: IntentKind.FRIENDSHIP,
    roommate: IntentKind.ROOMMATE,
    cofounder: IntentKind.COFOUNDER,
    study_partner: IntentKind.STUDY_PARTNER,
    gym_partner: IntentKind.GYM_PARTNER,
    mentor: IntentKind.MENTOR,
    hiring: IntentKind.HIRING,
    exchange: IntentKind.EXCHANGE,
  };
  const result = map[value];
  if (result === undefined) throw new ApiError(400, 'INVALID_INTENT', 'Unknown intent kind.');
  return result;
};

const intentToApi = (value: IntentKind): string => value.toLowerCase();
const memoryToApi = (value: MemoryKind): string => value.toLowerCase();

const agentDto = (agent: {
  id: string;
  userId: string;
  name: string;
  identitySeed: string;
  voiceProfile: unknown;
  autonomyDefaults: unknown;
  profileSummary: string;
  createdAt: Date;
  updatedAt: Date;
}): Record<string, unknown> => ({
  id: agent.id,
  userId: agent.userId,
  name: agent.name,
  identitySeed: agent.identitySeed,
  voiceProfile: asRecord(agent.voiceProfile),
  autonomyDefaults: asRecord(agent.autonomyDefaults),
  profileSummary: agent.profileSummary,
  createdAt: agent.createdAt.toISOString(),
  updatedAt: agent.updatedAt.toISOString(),
});

const memoryDto = (fact: {
  id: string;
  agentId: string;
  kind: MemoryKind;
  content: string;
  confidence: number;
  source: MemorySource;
  userEditedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): Record<string, unknown> => ({
  id: fact.id,
  agentId: fact.agentId,
  kind: memoryToApi(fact.kind),
  content: fact.content,
  confidence: fact.confidence,
  source: fact.source.toLowerCase(),
  userEditedAt: iso(fact.userEditedAt),
  createdAt: fact.createdAt.toISOString(),
  updatedAt: fact.updatedAt.toISOString(),
});

const requireOwnedAgent = async (db: PrismaClient, userId: string) => {
  const agent = await db.agent.findFirst({ where: { userId, deletedAt: null } });
  if (agent === null) throw new ApiError(404, 'AGENT_NOT_FOUND', 'Create your agent first.');
  return agent;
};

const readInterviewAnswers = (steps: unknown): string[] =>
  asArray(steps)
    .map((entry) => asRecord(entry).answer)
    .filter((answer): answer is string => typeof answer === 'string');

const extractStrings = (value: unknown, output: string[], depth = 0): void => {
  if (output.length >= 10_000 || depth > 12) return;
  if (typeof value === 'string') {
    if (value.trim().length >= 8) output.push(value.trim());
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) extractStrings(item, output, depth + 1);
    return;
  }
  if (typeof value === 'object' && value !== null) {
    for (const item of Object.values(value)) extractStrings(item, output, depth + 1);
  }
};

const durableFactsFromStrings = (strings: readonly string[]) => {
  const patterns = [
    {
      kind: MemoryKind.PREFERENCE,
      expression: /\bI (?:prefer|like|love|enjoy)\s+([^.!?]{3,160})/giu,
    },
    {
      kind: MemoryKind.GOAL,
      expression: /\b(?:my goal is|I want to|I am trying to)\s+([^.!?]{3,180})/giu,
    },
    {
      kind: MemoryKind.CONSTRAINT,
      expression: /\bI (?:cannot|can't|do not|don't|never)\s+([^.!?]{3,160})/giu,
    },
  ] as const;
  const found = new Map<string, { kind: MemoryKind; content: string; confidence: number }>();
  for (const text of strings) {
    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern.expression)) {
        const fragment = match[0].trim();
        if (fragment.length <= 220) {
          const key = fragment.toLowerCase();
          found.set(key, { kind: pattern.kind, content: fragment, confidence: 0.72 });
        }
      }
    }
    if (found.size >= 200) break;
  }
  return [...found.values()];
};

const voiceProfileFromStrings = (strings: readonly string[]): Prisma.InputJsonObject => {
  const sample = strings.slice(0, 1_000);
  const totalCharacters = sample.reduce((total, value) => total + value.length, 0);
  const averageLength = sample.length === 0 ? 0 : totalCharacters / sample.length;
  const exclamations = sample.filter((value) => value.includes('!')).length;
  const questions = sample.filter((value) => value.includes('?')).length;
  const tone = [
    averageLength > 140 ? 'reflective' : 'concise',
    exclamations / Math.max(1, sample.length) > 0.12 ? 'energetic' : 'measured',
    questions / Math.max(1, sample.length) > 0.2 ? 'curious' : 'direct',
  ];
  return {
    tone,
    sentenceStyle:
      averageLength > 140
        ? 'Develops context before reaching a conclusion.'
        : 'Uses short, direct statements.',
    vocabulary: ['calibrated from aggregate writing patterns'],
    avoids: ['invented facts', 'contact details without consent'],
    examples: [],
  };
};

const exportUserData = async (
  db: PrismaClient,
  userId: string,
): Promise<Record<string, unknown>> => {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    include: {
      agent: { include: { memoryFacts: { where: { deletedAt: null } } } },
      intents: { where: { deletedAt: null } },
      exchangeItems: { where: { deletedAt: null } },
      introductionsAsA: {
        include: { conversation: { include: { messages: true } }, reveals: true },
      },
      introductionsAsB: {
        include: { conversation: { include: { messages: true } }, reveals: true },
      },
      watchers: { include: { hits: true } },
      runs: { include: { modelCalls: true, receipts: true } },
      ownedSkills: { include: { versions: true, dependencies: true } },
      activity: { orderBy: { createdAt: 'asc' } },
      consents: true,
      connections: {
        select: { id: true, provider: true, scopes: true, status: true, lastSyncedAt: true },
      },
    },
  });
  return {
    exportedAt: new Date().toISOString(),
    formatVersion: '1.0',
    product: 'ORBIT',
    data: user,
  };
};

export const registerCoreRoutes = (app: FastifyInstance, services: Services): void => {
  app.get('/v1/me', async (request) => {
    const auth = await requireAuth(request, services.config);
    const user = await services.db.user.findUnique({ where: { id: auth.id } });
    if (user === null) throw new ApiError(404, 'USER_NOT_FOUND', 'The account no longer exists.');
    return publicUser(user);
  });

  app.patch('/v1/me', async (request) => {
    const auth = await requireAuth(request, services.config);
    const body = parseWith(updateMeSchema, request.body);
    const data: Prisma.UserUpdateInput = {
      ...(body.displayName === undefined ? {} : { displayName: body.displayName }),
      ...(body.handle === undefined ? {} : { handle: body.handle }),
      ...(body.locale === undefined ? {} : { locale: body.locale }),
      ...(body.timezone === undefined ? {} : { timezone: body.timezone }),
    };
    const user = await services.db.user.update({ where: { id: auth.id }, data });
    await logActivity(services.db, {
      userId: auth.id,
      actorType: 'USER',
      action: 'profile.updated',
      targetType: 'User',
      targetId: auth.id,
      requestId: request.id,
    });
    return publicUser(user);
  });

  app.delete('/v1/me', async (request, reply) => {
    const auth = await requireAuth(request, services.config);
    const deletionRequestedAt = new Date();
    const deleteAfter = new Date(
      deletionRequestedAt.getTime() + services.config.DELETION_GRACE_DAYS * 86_400_000,
    );
    await services.db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: auth.id },
        data: { status: UserStatus.PENDING_DELETION, deletionRequestedAt },
      });
      await logActivity(tx, {
        userId: auth.id,
        actorType: 'USER',
        action: 'account.deletion_scheduled',
        targetType: 'User',
        targetId: auth.id,
        payload: { deleteAfter: deleteAfter.toISOString() },
        requestId: request.id,
      });
    });
    return reply.code(202).send({
      ok: true,
      deleteAfter: deleteAfter.toISOString(),
      graceDays: services.config.DELETION_GRACE_DAYS,
    });
  });

  app.post('/v1/me/deletion/cancel', async (request) => {
    const auth = await requireAuth(request, services.config);
    const user = await services.db.user.findUnique({ where: { id: auth.id } });
    if (user === null) throw new ApiError(404, 'USER_NOT_FOUND', 'The account no longer exists.');
    if (user.status !== UserStatus.PENDING_DELETION || user.deletionRequestedAt === null) {
      throw new ApiError(
        409,
        'DELETION_NOT_PENDING',
        'This account is not scheduled for deletion.',
      );
    }
    await services.db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: auth.id },
        data: { status: UserStatus.ACTIVE, deletionRequestedAt: null },
      });
      await logActivity(tx, {
        userId: auth.id,
        actorType: 'USER',
        action: 'account.deletion_cancelled',
        targetType: 'User',
        targetId: auth.id,
        requestId: request.id,
      });
    });
    return { ok: true };
  });

  app.get('/v1/me/deletion', async (request) => {
    const auth = await requireAuth(request, services.config);
    const user = await services.db.user.findUnique({ where: { id: auth.id } });
    if (user === null) throw new ApiError(404, 'USER_NOT_FOUND', 'The account no longer exists.');
    const pending =
      user.status === UserStatus.PENDING_DELETION && user.deletionRequestedAt !== null;
    return {
      pending,
      requestedAt: pending ? user.deletionRequestedAt?.toISOString() : null,
      deleteAfter: pending
        ? new Date(
            (user.deletionRequestedAt?.getTime() ?? 0) +
              services.config.DELETION_GRACE_DAYS * 86_400_000,
          ).toISOString()
        : null,
    };
  });

  app.get('/v1/me/export', async (request, reply) => {
    const auth = await requireAuth(request, services.config);
    const payload = await exportUserData(services.db, auth.id);
    const manifest = Buffer.from(JSON.stringify(payload, null, 2));
    const signature = signExport(manifest, services.config.EXPORT_SIGNING_SECRET);
    const archive = new AdmZip();
    archive.addFile('orbit-export.json', manifest);
    archive.addFile(
      'SIGNATURE.json',
      Buffer.from(
        JSON.stringify(
          { algorithm: 'HMAC-SHA256', signedFile: 'orbit-export.json', signature },
          null,
          2,
        ),
      ),
    );
    const buffer = archive.toBuffer();
    await logActivity(services.db, {
      userId: auth.id,
      actorType: 'USER',
      action: 'data.exported',
      targetType: 'User',
      targetId: auth.id,
      payload: { bytes: buffer.length },
      requestId: request.id,
    });
    return reply
      .header('content-type', 'application/zip')
      .header(
        'content-disposition',
        `attachment; filename="orbit-export-${String(Date.now())}.zip"`,
      )
      .send(buffer);
  });

  app.post('/v1/agent', async (request, reply) => {
    const auth = await requireAuth(request, services.config);
    const body = parseWith(createAgentSchema, request.body);
    const existing = await services.db.agent.findUnique({ where: { userId: auth.id } });
    if (existing !== null)
      throw new ApiError(409, 'AGENT_EXISTS', 'This account already has an agent.');
    const agent = await services.db.agent.create({
      data: {
        userId: auth.id,
        name: body.name,
        identitySeed: randomBytes(18).toString('base64url'),
        voiceProfile: {
          tone: [],
          sentenceStyle: 'direct and natural',
          vocabulary: [],
          avoids: [],
          examples: [],
        },
        autonomyDefaults: {
          introductions: 'ask_first',
          external_messages: 'ask_first',
          watcher_writes: 'ask_first',
        },
      },
    });
    await logActivity(services.db, {
      userId: auth.id,
      actorType: 'USER',
      action: 'agent.created',
      targetType: 'Agent',
      targetId: agent.id,
      requestId: request.id,
    });
    return reply.code(201).send(agentDto(agent));
  });

  app.get('/v1/agent', async (request) => {
    const auth = await requireAuth(request, services.config);
    return agentDto(await requireOwnedAgent(services.db, auth.id));
  });

  app.patch('/v1/agent', async (request) => {
    const auth = await requireAuth(request, services.config);
    const body = parseWith(updateAgentSchema, request.body);
    const current = await requireOwnedAgent(services.db, auth.id);
    const data: Prisma.AgentUpdateInput = {
      ...(body.name === undefined ? {} : { name: body.name }),
      ...(body.autonomyDefaults === undefined ? {} : { autonomyDefaults: body.autonomyDefaults }),
    };
    const agent = await services.db.agent.update({ where: { id: current.id }, data });
    await logActivity(services.db, {
      userId: auth.id,
      actorType: 'USER',
      action: 'agent.updated',
      targetType: 'Agent',
      targetId: agent.id,
      requestId: request.id,
    });
    return agentDto(agent);
  });

  app.post('/v1/agent/interview/turn', async (request) => {
    const auth = await requireAuth(request, services.config);
    const body = parseWith(interviewTurnSchema, request.body);
    const agent = await requireOwnedAgent(services.db, auth.id);
    const run =
      body.sessionId === undefined
        ? await services.db.run.create({
            data: {
              userId: auth.id,
              kind: 'agent_interview',
              status: 'RUNNING',
              steps: [],
              startedAt: new Date(),
            },
          })
        : await services.db.run.findFirst({
            where: { id: body.sessionId, userId: auth.id, kind: 'agent_interview' },
          });
    if (run === null)
      throw new ApiError(404, 'INTERVIEW_NOT_FOUND', 'The interview session was not found.');
    const answers = [...readInterviewAnswers(run.steps), body.answer];
    const newFactKind = ['trait', 'preference', 'constraint', 'goal', 'voice', 'constraint'][
      Math.min(answers.length - 1, 5)
    ];
    if (newFactKind === undefined) throw new Error('Interview fact mapping is incomplete');
    const complete = answers.length >= interviewQuestions.length;
    let nextQuestion: string | undefined = complete
      ? undefined
      : interviewQuestions[answers.length];
    let adaptive = false;
    if (!complete) {
      try {
        const completion = await services.llm.complete({
          task: 'interview',
          userId: auth.id,
          runId: run.id,
          requestId: request.id,
          messages: [
            {
              role: 'system',
              content:
                'Ask one concise, non-leading follow-up that learns a durable preference, goal, boundary, or communication style. Return JSON only: {"question":string}. Do not ask for identifying or sensitive data.',
            },
            {
              role: 'user',
              content: `Interview answers so far:\n${answers.map((answer, index) => `${String(index + 1)}. ${answer}`).join('\n')}\nAsk the best next question.`,
            },
          ],
          constraints: { maxOutputTokens: 120, temperature: 0.35, jsonMode: true },
        });
        const parsed = asRecord(JSON.parse(completion.text));
        if (
          typeof parsed.question === 'string' &&
          parsed.question.trim().length >= 10 &&
          parsed.question.trim().length <= 300 &&
          !interviewQuestions.slice(0, answers.length).includes(parsed.question.trim() as never)
        ) {
          nextQuestion = parsed.question.trim();
          adaptive = completion.provider !== 'stub';
        }
      } catch {
        // The bounded deterministic question set remains available if a configured provider fails.
      }
    }
    const learnedFact = await services.db.$transaction(async (tx) => {
      await tx.run.update({
        where: { id: run.id },
        data: {
          steps: answers.map((answer, index) => ({ index, answer })),
          status: complete ? 'SUCCEEDED' : 'RUNNING',
          endedAt: complete ? new Date() : null,
        },
      });
      const fact = await tx.memoryFact.create({
        data: {
          agentId: agent.id,
          kind: newFactKind.toUpperCase() as MemoryKind,
          content: body.answer,
          confidence: 0.8,
          source: MemorySource.INTERVIEW,
        },
      });
      if (complete) {
        await tx.agent.update({
          where: { id: agent.id },
          data: {
            profileSummary: answers.slice(0, 4).join(' '),
            voiceProfile: {
              tone: ['natural', 'user-calibrated'],
              sentenceStyle: answers[4] ?? 'direct and natural',
              vocabulary: [],
              avoids: [answers[5] ?? 'unsupported assumptions'],
              examples: [],
            },
          },
        });
      }
      return fact;
    });
    const embeddingReady = await embedMemoryAndProfile(
      services,
      learnedFact.id,
      agent.id,
      learnedFact.content,
      { userId: auth.id, runId: run.id, requestId: request.id },
    );
    return {
      sessionId: run.id,
      question: complete
        ? 'Your profile is ready. What should your agent be called?'
        : nextQuestion,
      progress: Math.min(1, answers.length / interviewQuestions.length),
      complete,
      adaptive,
      embeddingReady,
      learnedFacts: [{ kind: newFactKind, content: body.answer }],
      profilePreview: answers.map((answer, index) => ({
        label: `Signal ${String(index + 1)}`,
        value: answer,
      })),
    };
  });

  app.post('/v1/agent/import', async (request, reply) => {
    const auth = await requireAuth(request, services.config);
    const agent = await requireOwnedAgent(services.db, auth.id);
    const upload = await request.file({ limits: { fileSize: 100 * 1024 * 1024, files: 1 } });
    if (upload === undefined)
      throw new ApiError(400, 'FILE_REQUIRED', 'Attach a ChatGPT or Claude export.');
    const bytes = await upload.toBuffer();
    let document: unknown;
    if (upload.filename.toLowerCase().endsWith('.zip')) {
      const zip = new AdmZip(bytes);
      const entry = zip
        .getEntries()
        .find((candidate) => /(?:conversations|chat).*\.json$/iu.test(candidate.entryName));
      if (entry === undefined) {
        throw new ApiError(
          400,
          'IMPORT_FORMAT_UNSUPPORTED',
          'No conversations JSON file was found in the zip.',
        );
      }
      document = JSON.parse(entry.getData().toString('utf8')) as unknown;
    } else {
      document = JSON.parse(bytes.toString('utf8')) as unknown;
    }
    const strings: string[] = [];
    extractStrings(document, strings);
    const facts = durableFactsFromStrings(strings);
    if (facts.length === 0) {
      throw new ApiError(
        422,
        'NO_DURABLE_FACTS',
        'The export did not contain durable preferences or goals that ORBIT could safely extract.',
      );
    }
    const created = await services.db.$transaction(async (tx) => {
      const imported = await Promise.all(
        facts.map((fact) =>
          tx.memoryFact.create({
            data: {
              agentId: agent.id,
              kind: fact.kind,
              content: fact.content,
              confidence: fact.confidence,
              source: MemorySource.IMPORT,
            },
          }),
        ),
      );
      await tx.agent.update({
        where: { id: agent.id },
        data: { voiceProfile: voiceProfileFromStrings(strings) },
      });
      return imported;
    });
    const embedded = await Promise.all(
      created.map((fact) =>
        storeMemoryEmbedding(services, fact.id, fact.content, {
          userId: auth.id,
          requestId: request.id,
        }),
      ),
    );
    if (embedded.some(Boolean)) {
      await refreshAgentProfileEmbedding(services, agent.id, {
        userId: auth.id,
        requestId: request.id,
      });
    }
    await logActivity(services.db, {
      userId: auth.id,
      actorType: 'USER',
      action: 'agent.history_imported',
      targetType: 'Agent',
      targetId: agent.id,
      payload: { filename: upload.filename, facts: created.length },
      requestId: request.id,
    });
    return reply.code(201).send({
      imported: created.length,
      embedded: embedded.filter(Boolean).length,
      facts: created.map(memoryDto),
      privacy: 'The raw export was parsed in memory and was not retained.',
    });
  });

  app.get('/v1/agent/memory', async (request) => {
    const auth = await requireAuth(request, services.config);
    const agent = await requireOwnedAgent(services.db, auth.id);
    const facts = await services.db.memoryFact.findMany({
      where: { agentId: agent.id, deletedAt: null, supersededById: null },
      orderBy: [{ kind: 'asc' }, { createdAt: 'desc' }],
    });
    return facts.map(memoryDto);
  });

  app.patch('/v1/agent/memory/:id', async (request) => {
    const auth = await requireAuth(request, services.config);
    const params = parseWith(idParamsSchema, request.params);
    const body = parseWith(updateMemoryFactSchema, request.body);
    const agent = await requireOwnedAgent(services.db, auth.id);
    const current = await services.db.memoryFact.findFirst({
      where: { id: params.id, agentId: agent.id, deletedAt: null },
    });
    if (current === null)
      throw new ApiError(404, 'MEMORY_NOT_FOUND', 'That memory fact was not found.');
    const updated = await services.db.memoryFact.update({
      where: { id: current.id },
      data: {
        content: body.content,
        kind: body.kind === undefined ? current.kind : (body.kind.toUpperCase() as MemoryKind),
        source: MemorySource.CORRECTION,
        confidence: 1,
        userEditedAt: new Date(),
      },
    });
    const embeddingReady = await embedMemoryAndProfile(
      services,
      updated.id,
      agent.id,
      updated.content,
      { userId: auth.id, requestId: request.id },
    );
    await logActivity(services.db, {
      userId: auth.id,
      actorType: 'USER',
      action: 'memory.corrected',
      targetType: 'MemoryFact',
      targetId: updated.id,
      requestId: request.id,
    });
    return { ...memoryDto(updated), embeddingReady };
  });

  app.delete('/v1/agent/memory/:id', async (request, reply) => {
    const auth = await requireAuth(request, services.config);
    const params = parseWith(idParamsSchema, request.params);
    const agent = await requireOwnedAgent(services.db, auth.id);
    const result = await services.db.memoryFact.updateMany({
      where: { id: params.id, agentId: agent.id, deletedAt: null },
      data: { deletedAt: new Date(), embeddingHash: null },
    });
    if (result.count === 0)
      throw new ApiError(404, 'MEMORY_NOT_FOUND', 'That memory fact was not found.');
    await logActivity(services.db, {
      userId: auth.id,
      actorType: 'USER',
      action: 'memory.deleted',
      targetType: 'MemoryFact',
      targetId: params.id,
      requestId: request.id,
    });
    await refreshAgentProfileEmbedding(services, agent.id, {
      userId: auth.id,
      requestId: request.id,
    });
    return reply.code(204).send();
  });

  app.get('/v1/intents', async (request) => {
    const auth = await requireAuth(request, services.config);
    const intents = await services.db.intent.findMany({
      where: { userId: auth.id, deletedAt: null },
      orderBy: { kind: 'asc' },
    });
    return intents.map((intent) => ({
      id: intent.id,
      userId: intent.userId,
      kind: intentToApi(intent.kind),
      active: intent.active,
      params: asRecord(intent.params),
      pausedUntil: iso(intent.pausedUntil),
      createdAt: intent.createdAt.toISOString(),
      updatedAt: intent.updatedAt.toISOString(),
    }));
  });

  app.put('/v1/intents/:kind', async (request) => {
    const auth = await requireAuth(request, services.config);
    const params = parseWith(z.object({ kind: intentKindSchema }), request.params);
    const body = parseWith(upsertIntentSchema, request.body);
    const kind = intentFromApi(params.kind);
    const updateData: Prisma.IntentUpdateInput = {
      active: body.active,
      params: body.params as Prisma.InputJsonValue,
      ...(body.pausedUntil === undefined
        ? {}
        : { pausedUntil: body.pausedUntil === null ? null : new Date(body.pausedUntil) }),
    };
    const createData: Prisma.IntentUncheckedCreateInput = {
      userId: auth.id,
      kind,
      active: body.active,
      params: body.params as Prisma.InputJsonValue,
      ...(body.pausedUntil === undefined
        ? {}
        : { pausedUntil: body.pausedUntil === null ? null : new Date(body.pausedUntil) }),
    };
    const intent = await services.db.intent.upsert({
      where: { userId_kind: { userId: auth.id, kind } },
      update: updateData,
      create: createData,
    });
    await logActivity(services.db, {
      userId: auth.id,
      actorType: 'USER',
      action: body.active ? 'intent.activated' : 'intent.paused',
      targetType: 'Intent',
      targetId: intent.id,
      payload: { kind: params.kind },
      requestId: request.id,
    });
    return {
      id: intent.id,
      userId: intent.userId,
      kind: params.kind,
      active: intent.active,
      params: asRecord(intent.params),
      pausedUntil: iso(intent.pausedUntil),
      createdAt: intent.createdAt.toISOString(),
      updatedAt: intent.updatedAt.toISOString(),
    };
  });

  const exchangeDto = (item: {
    id: string;
    userId: string;
    direction: ExchangeDirection;
    title: string;
    category: string;
    condition: string | null;
    description: string;
    priceLowCents: number | null;
    priceHighCents: number | null;
    willTradeFor: string | null;
    urgency: Urgency;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) => ({
    ...item,
    direction: item.direction.toLowerCase(),
    urgency: item.urgency.toLowerCase(),
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  });

  app.get('/v1/exchange/items', async (request) => {
    const auth = await requireAuth(request, services.config);
    return (
      await services.db.exchangeItem.findMany({
        where: { userId: auth.id, deletedAt: null },
        orderBy: { createdAt: 'desc' },
      })
    ).map(exchangeDto);
  });

  app.post('/v1/exchange/items', async (request, reply) => {
    const auth = await requireAuth(request, services.config);
    const body = parseWith(createExchangeItemSchema, request.body);
    const item = await services.db.exchangeItem.create({
      data: {
        userId: auth.id,
        direction: body.direction === 'have' ? ExchangeDirection.HAVE : ExchangeDirection.WANT,
        title: body.title,
        category: body.category,
        condition: body.condition,
        description: body.description,
        priceLowCents: body.priceLowCents,
        priceHighCents: body.priceHighCents,
        willTradeFor: body.willTradeFor,
        urgency: body.urgency.toUpperCase() as Urgency,
        active: body.active,
      },
    });
    return reply.code(201).send(exchangeDto(item));
  });

  app.patch('/v1/exchange/items/:id', async (request) => {
    const auth = await requireAuth(request, services.config);
    const params = parseWith(idParamsSchema, request.params);
    const body = parseWith(createExchangeItemSchema.partial(), request.body);
    const current = await services.db.exchangeItem.findFirst({
      where: { id: params.id, userId: auth.id, deletedAt: null },
    });
    if (current === null)
      throw new ApiError(404, 'ITEM_NOT_FOUND', 'That exchange item was not found.');
    const item = await services.db.exchangeItem.update({
      where: { id: current.id },
      data: {
        ...(body.direction === undefined
          ? {}
          : {
              direction:
                body.direction === 'have' ? ExchangeDirection.HAVE : ExchangeDirection.WANT,
            }),
        ...(body.urgency === undefined ? {} : { urgency: body.urgency.toUpperCase() as Urgency }),
        ...(body.title === undefined ? {} : { title: body.title }),
        ...(body.category === undefined ? {} : { category: body.category }),
        ...(body.condition === undefined ? {} : { condition: body.condition }),
        ...(body.description === undefined ? {} : { description: body.description }),
        ...(body.priceLowCents === undefined ? {} : { priceLowCents: body.priceLowCents }),
        ...(body.priceHighCents === undefined ? {} : { priceHighCents: body.priceHighCents }),
        ...(body.willTradeFor === undefined ? {} : { willTradeFor: body.willTradeFor }),
        ...(body.active === undefined ? {} : { active: body.active }),
      },
    });
    return exchangeDto(item);
  });

  app.delete('/v1/exchange/items/:id', async (request, reply) => {
    const auth = await requireAuth(request, services.config);
    const params = parseWith(idParamsSchema, request.params);
    const result = await services.db.exchangeItem.updateMany({
      where: { id: params.id, userId: auth.id, deletedAt: null },
      data: { active: false, deletedAt: new Date() },
    });
    if (result.count === 0)
      throw new ApiError(404, 'ITEM_NOT_FOUND', 'That exchange item was not found.');
    return reply.code(204).send();
  });

  app.get('/v1/connections', async (request) => {
    const auth = await requireAuth(request, services.config);
    return services.db.connection.findMany({
      where: { userId: auth.id, deletedAt: null },
      select: {
        id: true,
        provider: true,
        scopes: true,
        status: true,
        lastSyncedAt: true,
        createdAt: true,
      },
    });
  });

  app.put('/v1/settings/api-key', async (request) => {
    const auth = await requireAuth(request, services.config);
    const body = parseWith(
      z.object({
        provider: z.enum(['openai', 'anthropic', 'google']),
        apiKey: z.string().min(16).max(500),
      }),
      request.body,
    );
    const hint = body.apiKey.slice(-4);
    await services.db.encryptedApiKey.upsert({
      where: { userId_provider: { userId: auth.id, provider: body.provider } },
      update: {
        encryptedValue: encryptField(body.apiKey, services.config.FIELD_ENCRYPTION_KEY),
        keyHint: hint,
      },
      create: {
        userId: auth.id,
        provider: body.provider,
        encryptedValue: encryptField(body.apiKey, services.config.FIELD_ENCRYPTION_KEY),
        keyHint: hint,
      },
    });
    await logActivity(services.db, {
      userId: auth.id,
      actorType: 'USER',
      action: 'settings.api_key_updated',
      targetType: 'EncryptedApiKey',
      payload: { provider: body.provider, hint },
      requestId: request.id,
    });
    return { ok: true, provider: body.provider, keyHint: hint };
  });
};
