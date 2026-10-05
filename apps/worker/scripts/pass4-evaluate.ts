import { runBoundedConversation, type AgentPersona } from '@orbit/agent';
import { ConversationStatus, RunStatus, createPrismaClient } from '@orbit/db';

import { loadConfig } from '../src/config.js';
import { createModelRouter } from '../src/runtime.js';

type LoadedAgent = Awaited<
  ReturnType<ReturnType<typeof createPrismaClient>['agent']['findMany']>
>[number];

const parsePairs = (value: string | undefined): readonly (readonly [string, string])[] => {
  if (value === undefined || value.trim().length === 0) {
    throw new Error(
      'PASS4_EVALUATION_PAIRS must contain display-name pairs, for example Diego:Priya',
    );
  }
  return value.split(',').map((entry) => {
    const [left, right, extra] = entry.split(':').map((part) => part.trim());
    if (left === undefined || right === undefined || extra !== undefined || !left || !right) {
      throw new Error(`Invalid evaluation pair: ${entry}`);
    }
    return [left, right] as const;
  });
};

const object = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const strings = (value: unknown): readonly string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

const persona = (agent: LoadedAgent): AgentPersona => {
  const voice = object(agent.voiceProfile);
  return {
    agentId: agent.id,
    agentName: agent.name,
    facts: agent.memoryFacts.map((fact) => ({
      kind: fact.kind.toLowerCase() as AgentPersona['facts'][number]['kind'],
      content: fact.content,
      confidence: fact.confidence,
    })),
    voice: {
      tone: strings(voice.tone),
      sentenceStyle:
        typeof voice.sentenceStyle === 'string' ? voice.sentenceStyle : 'direct and concise',
      avoids: strings(voice.avoids),
    },
  };
};

const conversationStatus = (
  status: Awaited<ReturnType<typeof runBoundedConversation>>['status'],
): ConversationStatus => {
  if (status === 'completed') return ConversationStatus.COMPLETED;
  if (status === 'ended_early') return ConversationStatus.ENDED_EARLY;
  if (status === 'moderation_flagged') return ConversationStatus.MODERATION_FLAGGED;
  return ConversationStatus.REDACTION_FAILED;
};

const db = createPrismaClient();
const config = loadConfig();
const router = createModelRouter(db, config);

try {
  const pairs = parsePairs(process.env.PASS4_EVALUATION_PAIRS);
  const names = [...new Set(pairs.flat())];
  const agents = await db.agent.findMany({
    where: { user: { displayName: { in: names } }, deletedAt: null },
    include: {
      user: true,
      memoryFacts: { where: { deletedAt: null, supersededById: null } },
    },
  });
  const byName = new Map(agents.map((agent) => [agent.user.displayName, agent]));
  const results: Array<Record<string, unknown>> = [];

  for (const [leftName, rightName] of pairs) {
    const left = byName.get(leftName);
    const right = byName.get(rightName);
    if (left === undefined || right === undefined) {
      throw new Error(`Evaluation profile missing: ${leftName}:${rightName}`);
    }
    const run = await db.run.create({
      data: {
        userId: left.userId,
        kind: 'pass4_controlled_evaluation',
        status: RunStatus.RUNNING,
        steps: [],
        startedAt: new Date(),
      },
    });
    const conversation = await db.agentConversation.create({
      data: {
        intentKind: 'FRIENDSHIP',
        agentAId: left.id,
        agentBId: right.id,
        status: ConversationStatus.RUNNING,
      },
    });
    const result = await runBoundedConversation(
      persona(left),
      persona(right),
      { kind: 'friendship', params: { goal: 'friendship', pace: 'low-pressure' } },
      router,
      {
        maxTurns: 8,
        maxTokenBudget: 8_000,
        userId: left.userId,
        runId: run.id,
        conversationId: conversation.id,
      },
    );
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
          status: conversationStatus(result.status),
          turnCount: result.turns.length,
          redactionPassed: result.redactionPassed,
          ...(result.verdict === null ? {} : { verdict: result.verdict }),
          endedAt: new Date(),
        },
      });
      await tx.run.update({
        where: { id: run.id },
        data: {
          status: RunStatus.SUCCEEDED,
          costCents: result.modelCostCents,
          endedAt: new Date(),
        },
      });
    });
    results.push({
      pair: [leftName, rightName],
      conversationId: conversation.id,
      status: result.status,
      redactionPassed: result.redactionPassed,
      turns: result.turns.length,
      verdict: result.verdict,
    });
  }
  process.stdout.write(`${JSON.stringify({ ok: true, results })}\n`);
} finally {
  await db.$disconnect();
}
