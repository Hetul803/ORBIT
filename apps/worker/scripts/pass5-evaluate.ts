import { runBoundedConversation, type AgentPersona } from '@orbit/agent';
import {
  ConversationStatus,
  MemoryKind,
  MemorySource,
  RunStatus,
  createPrismaClient,
} from '@orbit/db';

import { loadConfig } from '../src/config.js';
import { createModelRouter } from '../src/runtime.js';

if (process.env.NODE_ENV === 'production') {
  throw new Error('The Pass 5 synthetic evaluation refuses NODE_ENV=production.');
}

const cohort = [
  {
    name: 'Mara',
    facts: [
      'Needs uninterrupted quiet mornings for transit-map sketching.',
      'Prefers patient one-on-one conversations.',
      'Needs time to think before committing to plans.',
      'Avoids crowded or loud events.',
      'Values predictable plans and reliable follow-through.',
    ],
  },
  {
    name: 'Owen',
    facts: [
      'Works early library shifts.',
      'Protects a weekly museum sketchbook hour.',
      'Likes one unhurried coffee with a friend.',
      'Large or last-minute gatherings drain energy.',
      'Prefers low-key plans agreed in advance.',
    ],
  },
  {
    name: 'Diego',
    facts: [
      'Boulders three times each week.',
      'Enjoys pickup games and spontaneous food runs.',
      'Prefers quick, direct decisions.',
      'Is training for an outdoor climbing trip in six months.',
      'Loses momentum when plans stay undecided.',
    ],
  },
  {
    name: 'Priya',
    facts: [
      'Protects long deep-work blocks for a graduate deadline.',
      'Needs plans at least three days in advance.',
      'Avoids loud competitive activities.',
      'Likes quiet walks and structured study breaks.',
      'Has little room for spontaneous weekday plans.',
    ],
  },
  {
    name: 'Aisha',
    facts: [
      'Keeps fixed music-rehearsal and family-call commitments.',
      'Enjoys volunteering beside a friend.',
      'Prefers gentle, direct communication.',
      'Avoids last-minute schedule changes.',
      'Likes shared creative work with equal participation.',
    ],
  },
  {
    name: 'Sofia',
    facts: [
      'Cooks for friends and teaches beginner yoga.',
      'Keeps one screen-free evening each week.',
      'Likes farmers markets and affordable community classes.',
      'Can reschedule when communication is early and kind.',
      'Avoids high-pressure social plans.',
    ],
  },
  {
    name: 'Ben',
    facts: [
      'Finishes one woodworking project each month.',
      'Prefers planned outdoor activities.',
      'Relies on consistent routines and early nights.',
      'Values concise, timely communication.',
      'Does not enjoy improvising a plan after arrival.',
    ],
  },
  {
    name: 'Cal',
    facts: [
      'Plays improvisational music late at night.',
      'Gets energy from groups and unplanned outings.',
      'Prefers flexible plans over fixed itineraries.',
      'Likes meeting several new people at once.',
      'Finds strict routines limiting.',
    ],
  },
  {
    name: 'Leila',
    facts: [
      'Makes street photographs and small zines.',
      'Prefers slow, thoughtful collaboration.',
      'Hosts relaxed dinners for a few close friends.',
      'Needs solo editing time before social plans.',
      'Avoids rushed creative decisions.',
    ],
  },
  {
    name: 'Noah',
    facts: [
      'Follows a strict early-morning distance-running plan.',
      'Protects recovery and early bedtime.',
      'Prefers quiet one-on-one time.',
      'Has limited evening availability.',
      'Values people who commit to a schedule.',
    ],
  },
] as const;

const pairs = [
  ['Mara', 'Owen'],
  ['Diego', 'Priya'],
  ['Aisha', 'Sofia'],
  ['Ben', 'Cal'],
  ['Leila', 'Noah'],
  ['Mara', 'Leila'],
  ['Owen', 'Ben'],
  ['Diego', 'Cal'],
  ['Priya', 'Sofia'],
  ['Aisha', 'Noah'],
] as const;

const db = createPrismaClient();
const config = loadConfig();
const router = createModelRouter(db, config);

try {
  const agents = new Map<string, { id: string; userId: string; persona: AgentPersona }>();
  for (const member of cohort) {
    const email = `pass5.${member.name.toLowerCase()}@example.test`;
    const user = await db.user.upsert({
      where: { email },
      update: { displayName: member.name, lastActiveAt: new Date() },
      create: {
        email,
        emailVerifiedAt: new Date(),
        dateOfBirth: new Date('1995-01-01T00:00:00.000Z'),
        ageVerifiedAt: new Date(),
        displayName: member.name,
      },
    });
    const agent = await db.agent.upsert({
      where: { userId: user.id },
      update: { name: `${member.name} agent`, onboardingCompletedAt: new Date() },
      create: {
        userId: user.id,
        name: `${member.name} agent`,
        identitySeed: `pass5-${member.name.toLowerCase()}`,
        onboardingCompletedAt: new Date(),
        voiceProfile: {
          tone: ['direct', 'curious'],
          sentenceStyle: 'short, concrete sentences',
          avoids: ['flattery', 'forced agreement'],
        },
      },
    });
    await db.memoryFact.deleteMany({ where: { agentId: agent.id } });
    await db.memoryFact.createMany({
      data: member.facts.map((content, index) => ({
        agentId: agent.id,
        kind: index === 3 ? MemoryKind.CONSTRAINT : MemoryKind.PREFERENCE,
        content,
        confidence: 1,
        source: MemorySource.INTERVIEW,
      })),
    });
    agents.set(member.name, {
      id: agent.id,
      userId: user.id,
      persona: {
        agentId: agent.id,
        agentName: agent.name,
        facts: member.facts.map((content, index) => ({
          kind: index === 3 ? 'constraint' : 'preference',
          content,
          confidence: 1,
        })),
        voice: {
          tone: ['direct', 'curious'],
          sentenceStyle: 'short, concrete sentences',
          avoids: ['flattery', 'forced agreement'],
        },
      },
    });
  }

  const results: Array<Record<string, unknown>> = [];
  for (const [leftName, rightName] of pairs) {
    const left = agents.get(leftName);
    const right = agents.get(rightName);
    if (left === undefined || right === undefined) throw new Error('Evaluation agent missing');
    const run = await db.run.create({
      data: {
        userId: left.userId,
        kind: 'pass5_controlled_evaluation',
        status: RunStatus.RUNNING,
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
    const requestId = `pass5:${conversation.id}`;
    const result = await runBoundedConversation(
      left.persona,
      right.persona,
      { kind: 'friendship', params: { pace: 'low-pressure' } },
      router,
      {
        maxTurns: 8,
        maxTokenBudget: 8_000,
        userId: left.userId,
        runId: run.id,
        conversationId: conversation.id,
        requestId,
      },
    );
    for (const turn of result.turns) {
      await db.agentMessage.create({
        data: {
          conversationId: conversation.id,
          speakerAgentId: turn.speakerAgentId,
          turnIndex: turn.turnIndex,
          contentHash: turn.originalContentHash,
          redactedContent: turn.content,
        },
      });
    }
    if (result.redactionFailure !== null) {
      await db.redactionFailure.create({
        data: {
          conversationId: conversation.id,
          turnIndex: result.redactionFailure.turnIndex,
          category: result.redactionFailure.category,
          pattern: result.redactionFailure.pattern,
          source: result.redactionFailure.source,
          requestId,
        },
      });
    }
    await db.agentConversation.update({
      where: { id: conversation.id },
      data: {
        status:
          result.status === 'completed'
            ? ConversationStatus.COMPLETED
            : result.status === 'ended_early'
              ? ConversationStatus.ENDED_EARLY
              : result.status === 'moderation_flagged'
                ? ConversationStatus.MODERATION_FLAGGED
                : ConversationStatus.REDACTION_FAILED,
        turnCount: result.turns.length,
        redactionPassed: result.redactionPassed,
        ...(result.verdict === null ? {} : { verdict: result.verdict }),
        endedAt: new Date(),
      },
    });
    await db.run.update({
      where: { id: run.id },
      data: {
        status: RunStatus.SUCCEEDED,
        costCents: result.modelCostCents,
        endedAt: new Date(),
      },
    });
    results.push({
      pair: [leftName, rightName],
      conversationId: conversation.id,
      status: result.status,
      redactionPassed: result.redactionPassed,
      redactionFailure: result.redactionFailure,
      transcript: result.turns.map((turn) => ({
        speaker: turn.speakerAgentId === left.id ? leftName : rightName,
        text: turn.content,
      })),
      verdict: result.verdict,
      costCents: result.modelCostCents,
    });
  }
  process.stdout.write(
    `${JSON.stringify({ cohort: cohort.map((member) => member.name), results })}\n`,
  );
} finally {
  await db.$disconnect();
}
