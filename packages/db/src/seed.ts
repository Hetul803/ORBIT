import { createHash } from 'node:crypto';

import { createPrismaClient } from './client.js';
import {
  ActorType,
  ConversationStatus,
  ExchangeDirection,
  GroupKind,
  GroupRole,
  GroupVisibility,
  InboxTriage,
  IntentKind,
  MemoryKind,
  MemorySource,
  RevealDecision,
  RunStatus,
  SkillStatus,
  Urgency,
  UserRole,
  UserStatus,
} from './generated/prisma/enums.js';

const allowSeed =
  process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEVELOPMENT_SEED === 'true';

if (!allowSeed) {
  throw new Error(
    'Development seed requires ALLOW_DEVELOPMENT_SEED=true and refuses NODE_ENV=production.',
  );
}

const db = createPrismaClient();
const hash = (value: string): string => createHash('sha256').update(value).digest('hex');
const today = new Date();
today.setUTCHours(0, 0, 0, 0);

const profiles = [
  ['quietly ambitious', 'prefers direct plans', 'building a community project'],
  ['curious and social', 'likes early mornings', 'learning product design'],
  ['methodical', 'values reliable follow-through', 'studying applied mathematics'],
  ['creative and candid', 'prefers small groups', 'making documentary films'],
  ['patient', 'likes strength training', 'preparing for graduate school'],
] as const;

const skillDefinition = {
  trigger: 'A new week begins or the calendar changes materially.',
  steps: [
    {
      id: 'step-1',
      title: 'Read constraints',
      instruction: 'Read the approved calendar window and fixed commitments.',
      tool: 'calendar.read',
      requiresApproval: false,
      successCheck: 'All fixed commitments are represented.',
    },
    {
      id: 'step-2',
      title: 'Draft focus blocks',
      instruction: 'Propose focus blocks around deadlines without moving fixed events.',
      tool: null,
      requiresApproval: false,
      successCheck: 'No event overlap and every deadline has preparation time.',
    },
    {
      id: 'step-3',
      title: 'Ask before writing',
      instruction: 'Show the proposed changes and wait for explicit approval.',
      tool: 'calendar.write',
      requiresApproval: true,
      successCheck: 'An approval activity receipt exists before any write.',
    },
  ],
  rules: [
    'Never move classes or medical appointments.',
    'No external write occurs without explicit approval.',
  ],
  checks: ['No overlaps', 'Deadlines have preparation blocks', 'Approval receipt exists'],
  permissions: ['calendar.read', 'calendar.write.after_approval'],
  fallback: 'Pause and ask the user when a new event type is encountered.',
};

const run = async (): Promise<void> => {
  const campus = await db.group.upsert({
    where: { joinCode: 'ORBIT-DEMO' },
    update: { name: 'Northstar Demo Campus' },
    create: {
      id: 'seed-group-campus',
      kind: GroupKind.CAMPUS,
      name: 'Northstar Demo Campus',
      joinCode: 'ORBIT-DEMO',
      emailDomain: 'northstar.edu',
      visibility: GroupVisibility.DOMAIN,
    },
  });

  for (let index = 0; index < 40; index += 1) {
    const number = String(index + 1).padStart(2, '0');
    const id = `seed-user-${number}`;
    const agentId = `seed-agent-${number}`;
    const email = index === 0 ? 'demo@orbit.local' : `person${number}@orbit.demo`;
    const displayName = index === 0 ? 'Demo Founder' : `Fictional Person ${number}`;
    const profile = profiles[index % profiles.length] ?? profiles[0];
    const user = await db.user.upsert({
      where: { email },
      update: {
        displayName,
        campusId: campus.id,
        lastActiveAt: new Date(),
      },
      create: {
        id,
        email,
        emailVerifiedAt: new Date(),
        eduVerifiedAt: index < 30 ? new Date() : null,
        phone: index === 0 ? '+15555550100' : null,
        phoneVerifiedAt: index === 0 ? new Date() : null,
        dateOfBirth: new Date(Date.UTC(1998 + (index % 5), index % 12, 1 + (index % 20))),
        ageVerifiedAt: new Date(),
        displayName,
        handle: index === 0 ? 'orbit_demo' : `fictional_${number}`,
        campusId: campus.id,
        locale: 'en-US',
        timezone: 'America/Chicago',
        status: UserStatus.ACTIVE,
        role: index === 0 ? UserRole.ADMIN : UserRole.USER,
      },
    });

    await db.agent.upsert({
      where: { userId: user.id },
      update: {
        profileSummary: profile.join('. '),
        onboardingCompletedAt: new Date(),
      },
      create: {
        id: agentId,
        userId: user.id,
        name: index === 0 ? 'Morrow' : `Orbit ${number}`,
        identitySeed: `northstar-agent-${number}`,
        voiceProfile: {
          tone: index % 2 === 0 ? ['direct', 'warm'] : ['curious', 'concise'],
          sentenceStyle: 'short, concrete sentences',
          vocabulary: [],
          avoids: ['hype', 'forced familiarity'],
          examples: [],
        },
        autonomyDefaults: {
          introductions: 'ask_first',
          external_messages: 'ask_first',
          watchers: 'do_and_tell',
          private_analysis: 'just_handle_it',
        },
        profileSummary: profile.join('. '),
        onboardingCompletedAt: new Date(),
      },
    });

    await db.groupMember.upsert({
      where: { groupId_userId: { groupId: campus.id, userId: user.id } },
      update: {},
      create: {
        id: `seed-membership-${number}`,
        groupId: campus.id,
        userId: user.id,
        role: index === 0 ? GroupRole.ADMIN : GroupRole.MEMBER,
      },
    });

    await db.intent.upsert({
      where: { userId_kind: { userId: user.id, kind: IntentKind.FRIENDSHIP } },
      update: { active: true },
      create: {
        id: `seed-intent-friend-${number}`,
        userId: user.id,
        kind: IntentKind.FRIENDSHIP,
        active: true,
        params: { pace: index % 2 === 0 ? 'calm' : 'active', radiusMiles: 5 },
      },
    });

    await db.intent.upsert({
      where: { userId_kind: { userId: user.id, kind: IntentKind.STUDY_PARTNER } },
      update: { active: index % 3 !== 0 },
      create: {
        id: `seed-intent-study-${number}`,
        userId: user.id,
        kind: IntentKind.STUDY_PARTNER,
        active: index % 3 !== 0,
        params: { cadence: 'twice weekly', quiet: true },
      },
    });

    await db.exchangeItem.upsert({
      where: { id: `seed-item-${number}` },
      update: { active: true },
      create: {
        id: `seed-item-${number}`,
        userId: user.id,
        direction: index % 2 === 0 ? ExchangeDirection.HAVE : ExchangeDirection.WANT,
        title: index % 2 === 0 ? `Fictional calculus text ${number}` : `Used desk lamp ${number}`,
        category: index % 2 === 0 ? 'textbooks' : 'furniture',
        condition: index % 2 === 0 ? 'good' : null,
        description: 'Synthetic development listing for end-to-end product testing.',
        priceLowCents: 1_000 + index * 100,
        priceHighCents: 2_500 + index * 100,
        willTradeFor: index % 2 === 0 ? 'A statistics workbook' : 'A small bookshelf',
        urgency: index % 4 === 0 ? Urgency.HIGH : Urgency.NORMAL,
        active: true,
      },
    });

    const agent = await db.agent.findUniqueOrThrow({ where: { userId: user.id } });
    for (let factIndex = 0; factIndex < profile.length; factIndex += 1) {
      const content = profile[factIndex] ?? '';
      await db.memoryFact.upsert({
        where: { id: `seed-fact-${number}-${String(factIndex + 1)}` },
        update: { content },
        create: {
          id: `seed-fact-${number}-${String(factIndex + 1)}`,
          agentId: agent.id,
          kind:
            factIndex === 0
              ? MemoryKind.TRAIT
              : factIndex === 1
                ? MemoryKind.PREFERENCE
                : MemoryKind.GOAL,
          content,
          confidence: 0.88,
          source: MemorySource.INTERVIEW,
          embeddingHash: hash(content),
        },
      });
    }
  }

  const userA = await db.user.findUniqueOrThrow({ where: { email: 'demo@orbit.local' } });
  const userB = await db.user.findUniqueOrThrow({ where: { email: 'person02@orbit.demo' } });
  const agentA = await db.agent.findUniqueOrThrow({ where: { userId: userA.id } });
  const agentB = await db.agent.findUniqueOrThrow({ where: { userId: userB.id } });

  const conversation = await db.agentConversation.upsert({
    where: { id: 'seed-conversation-01' },
    update: {
      redactionPassed: true,
      status: ConversationStatus.COMPLETED,
    },
    create: {
      id: 'seed-conversation-01',
      intentKind: IntentKind.FRIENDSHIP,
      agentAId: agentA.id,
      agentBId: agentB.id,
      status: ConversationStatus.COMPLETED,
      turnCount: 4,
      redactionPassed: true,
      verdict: {
        score: 91,
        reasons: [
          'Both prefer direct plans over open-ended maybes.',
          'They protect quiet work time and still make room for community.',
          'Neither expects instant closeness; both value consistency.',
        ],
        flags: [],
        suggestedFirstActivity: 'Compare favorite study systems over coffee in the student union.',
        oneLineReason: 'The same calm pace, with enough difference to stay interesting.',
      },
      endedAt: new Date(),
    },
  });

  const messages = [
    [agentA.id, 'What does a friendship that actually improves your week look like?'],
    [
      agentB.id,
      'Low-pressure and dependable. A walk or study break is better than a crowded event.',
    ],
    [agentA.id, 'That pace fits. Mine values direct invitations and people who follow through.'],
    [agentB.id, 'Good. Mine would rather plan one concrete thing than keep an endless chat going.'],
  ] as const;
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (message === undefined) continue;
    await db.agentMessage.upsert({
      where: {
        conversationId_turnIndex: { conversationId: conversation.id, turnIndex: index },
      },
      update: { redactedContent: message[1] },
      create: {
        id: `seed-message-${String(index + 1)}`,
        conversationId: conversation.id,
        speakerAgentId: message[0],
        turnIndex: index,
        contentHash: hash(message[1]),
        redactedContent: message[1],
        tokensIn: 45,
        tokensOut: 20,
      },
    });
  }

  const introduction = await db.introduction.upsert({
    where: { conversationId: conversation.id },
    update: { expiresAt: new Date(Date.now() + 14 * 86_400_000) },
    create: {
      id: 'seed-introduction-01',
      conversationId: conversation.id,
      userAId: userA.id,
      userBId: userB.id,
      userADecision: RevealDecision.PENDING,
      userBDecision: RevealDecision.REVEAL,
      decidedBAt: new Date(),
      revealedFields: {},
      expiresAt: new Date(Date.now() + 14 * 86_400_000),
    },
  });
  await db.reveal.upsert({
    where: {
      introductionId_userId_field: {
        introductionId: introduction.id,
        userId: userB.id,
        field: 'first_name',
      },
    },
    update: { value: userB.displayName.split(/\s+/u)[0] ?? 'Person' },
    create: {
      id: 'seed-reveal-b-first-name',
      introductionId: introduction.id,
      userId: userB.id,
      field: 'first_name',
      value: userB.displayName.split(/\s+/u)[0] ?? 'Person',
    },
  });
  const seededRevealConsent = await db.consent.findUnique({
    where: { id: 'seed-consent-b-reveal' },
  });
  if (seededRevealConsent === null) {
    await db.consent.create({
      data: {
        id: 'seed-consent-b-reveal',
        userId: userB.id,
        kind: 'introduction_reveal:first_name',
        version: '1.0',
        metadata: { introductionId: introduction.id },
      },
    });
  }

  await db.exchangeProposal.upsert({
    where: {
      haveItemId_wantItemId: { haveItemId: 'seed-item-01', wantItemId: 'seed-item-02' },
    },
    update: { expiresAt: new Date(Date.now() + 7 * 86_400_000) },
    create: {
      id: 'seed-exchange-proposal-01',
      haveItemId: 'seed-item-01',
      wantItemId: 'seed-item-02',
      terms: {
        summary: 'Trade the calculus text for the desk lamp, after both people approve.',
        payment: false,
        nextStep: 'Reveal a campus handoff window only after mutual acceptance.',
      },
      userBDecision: RevealDecision.REVEAL,
      expiresAt: new Date(Date.now() + 7 * 86_400_000),
    },
  });

  const watcher = await db.watcher.upsert({
    where: { id: 'seed-watcher-01' },
    update: { active: true },
    create: {
      id: 'seed-watcher-01',
      userId: userA.id,
      title: 'Quiet sublet under 900',
      spec: {
        query: 'A quiet sublet within walking distance under $900',
        source: 'orbit',
        constraints: { maximumCents: 90_000, quietHours: true },
        notifyOn: 'new match',
      },
      schedule: '0 */6 * * *',
      active: true,
      lastRunAt: new Date(Date.now() - 3_600_000),
      nextRunAt: new Date(Date.now() + 3_600_000),
    },
  });
  await db.watcherHit.upsert({
    where: { watcherId_dedupeKey: { watcherId: watcher.id, dedupeKey: 'seed-sublet-hit' } },
    update: {},
    create: {
      id: 'seed-watcher-hit-01',
      watcherId: watcher.id,
      dedupeKey: 'seed-sublet-hit',
      payload: {
        title: 'Fictional Oak Street sublet',
        detail: '$875, 0.6 miles away, quiet hours listed',
        href: '/watchers/seed-watcher-01',
      },
    },
  });

  await db.inboxItem.upsert({
    where: { id: 'seed-inbox-01' },
    update: {},
    create: {
      id: 'seed-inbox-01',
      recipientUserId: userA.id,
      senderAgentId: agentB.id,
      kind: 'agent_request',
      subject: 'Study session next week',
      body: 'Would your user be open to comparing notes on a shared topic?',
      triage: InboxTriage.ESCALATED,
      agentReply: 'Yes, I am interested. Send two broad time windows and I will confirm one.',
    },
  });

  const skill = await db.skill.upsert({
    where: { id: 'seed-skill-01' },
    update: { definition: skillDefinition, confidence: 0.92 },
    create: {
      id: 'seed-skill-01',
      ownerUserId: userA.id,
      name: 'Repair my week',
      version: 2,
      definition: skillDefinition,
      compiledPlan: { stableSteps: ['step-1', 'step-3'], adaptiveSteps: ['step-2'] },
      autonomyPct: 62,
      confidence: 0.92,
      adoptionCount: 14,
      runCount: 8,
      successCount: 7,
      status: SkillStatus.ACTIVE,
    },
  });
  await db.skillVersion.upsert({
    where: { skillId_version: { skillId: skill.id, version: 2 } },
    update: { definition: skillDefinition },
    create: {
      id: 'seed-skill-version-02',
      skillId: skill.id,
      version: 2,
      definition: skillDefinition,
      confidence: 0.92,
      evidence: { successfulRuns: 7, failedRuns: 1 },
      correction: 'Never move medical appointments.',
      validation: { passed: true, checks: 3 },
    },
  });

  const firstRun = await db.run.upsert({
    where: { id: 'seed-run-first' },
    update: {},
    create: {
      id: 'seed-run-first',
      userId: userA.id,
      skillId: skill.id,
      kind: 'skill',
      status: RunStatus.SUCCEEDED,
      steps: [
        { name: 'Read calendar', status: 'succeeded', detail: '14 events read', durationMs: 1200 },
        {
          name: 'Draft blocks',
          status: 'succeeded',
          detail: '4 blocks proposed',
          durationMs: 3800,
        },
        { name: 'Approval', status: 'succeeded', detail: 'Approved by user', durationMs: 9100 },
      ],
      costCents: 1.8,
      durationMs: 14_100,
      startedAt: new Date(Date.now() - 8 * 86_400_000),
      endedAt: new Date(Date.now() - 8 * 86_400_000 + 14_100),
    },
  });
  const currentRun = await db.run.upsert({
    where: { id: 'seed-run-current' },
    update: {},
    create: {
      id: 'seed-run-current',
      userId: userA.id,
      skillId: skill.id,
      parentRunId: firstRun.id,
      kind: 'skill',
      status: RunStatus.SUCCEEDED,
      steps: [
        { name: 'Read changes', status: 'succeeded', detail: '2 changes found', durationMs: 500 },
        { name: 'Adapt blocks', status: 'succeeded', detail: '1 block updated', durationMs: 900 },
        { name: 'Approval', status: 'succeeded', detail: 'Approved by user', durationMs: 2600 },
      ],
      costCents: 0.4,
      durationMs: 4_000,
      startedAt: new Date(Date.now() - 3_600_000),
      endedAt: new Date(Date.now() - 3_596_000),
    },
  });
  await db.learningReceipt.upsert({
    where: { skillId_runId: { skillId: skill.id, runId: currentRun.id } },
    update: {},
    create: {
      id: 'seed-learning-receipt-01',
      skillId: skill.id,
      runId: currentRun.id,
      headline: 'Learned 3 reusable steps',
      reusableSteps: 3,
      firstRunActions: 24,
      currentRunActions: 9,
      firstRunModelCalls: 6,
      currentRunModelCalls: 1,
      confidence: 0.92,
      fallbackUsed: true,
    },
  });

  await db.dailyBrief.upsert({
    where: { userId_forDate: { userId: userA.id, forDate: today } },
    update: {},
    create: {
      id: 'seed-brief-today',
      userId: userA.id,
      forDate: today,
      payload: {
        date: today.toISOString().slice(0, 10),
        greeting: 'Four done. One needs you.',
        completedCount: 4,
        needsUserCount: 1,
        timeSavedMinutesThisWeek: 47,
        running: null,
        items: [
          {
            id: 'seed-introduction-01',
            kind: 'introduction',
            title: 'Morrow met Orbit 02',
            detail: 'The same calm pace, with enough difference to stay interesting.',
            skillName: 'INTRODUCTIONS',
            durationMs: 8_240,
            autonomy: 0.62,
            needsUser: true,
            href: '/introductions/seed-introduction-01',
          },
          {
            id: watcher.id,
            kind: 'watcher_hit',
            title: 'A sublet matched your ceiling',
            detail: '$875 and 0.6 miles away.',
            skillName: 'HOUSING WATCH',
            durationMs: 1_320,
            autonomy: 0.94,
            needsUser: false,
            href: `/watchers/${watcher.id}`,
          },
          {
            id: currentRun.id,
            kind: 'task',
            title: 'Your week was repaired',
            detail: '15 actions avoided compared with the first run.',
            skillName: 'REPAIR MY WEEK',
            durationMs: currentRun.durationMs,
            autonomy: 0.72,
            needsUser: false,
            href: `/runs/${currentRun.id}`,
          },
        ],
      },
    },
  });

  const seededActivity = await db.activityLog.findUnique({ where: { id: 'seed-activity-01' } });
  if (seededActivity === null) {
    await db.activityLog.create({
      data: {
        id: 'seed-activity-01',
        userId: userA.id,
        actorType: ActorType.AGENT,
        action: 'skill.run.completed',
        targetType: 'Run',
        targetId: currentRun.id,
        payload: { approvedWrites: 1, learningReceiptId: 'seed-learning-receipt-01' },
      },
    });
  }
};

run()
  .then(async () => {
    await db.$disconnect();
    process.stdout.write('ORBIT development data seeded: 40 synthetic users.\n');
  })
  .catch(async (error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
    await db.$disconnect();
    process.exitCode = 1;
  });
