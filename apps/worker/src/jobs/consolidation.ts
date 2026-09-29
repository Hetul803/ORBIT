import { chooseExecutionStrategy } from '@orbit/agent';
import { SkillStatus, type Prisma, type PrismaClient } from '@orbit/db';

const normalized = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9 ]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();

export const runConsolidation = async (
  db: PrismaClient,
): Promise<{ factsSuperseded: number; skillsRevalidated: number }> => {
  const agents = await db.agent.findMany({
    where: { deletedAt: null },
    include: { memoryFacts: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } } },
  });
  let factsSuperseded = 0;
  for (const agent of agents) {
    const canonical = new Map<string, string>();
    for (const fact of agent.memoryFacts) {
      const key = `${fact.kind}:${normalized(fact.content)}`;
      const existingId = canonical.get(key);
      if (existingId === undefined || fact.userEditedAt !== null) {
        canonical.set(key, fact.id);
        continue;
      }
      if (fact.supersededById === null) {
        await db.memoryFact.update({
          where: { id: fact.id },
          data: { supersededById: existingId },
        });
        factsSuperseded += 1;
      }
    }
    await db.agent.update({ where: { id: agent.id }, data: { lastConsolidatedAt: new Date() } });
  }

  const skills = await db.skill.findMany({
    where: { deletedAt: null },
    include: {
      runs: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } },
      versions: { orderBy: { version: 'desc' }, take: 1 },
    },
  });
  let skillsRevalidated = 0;
  for (const skill of skills) {
    if (skill.runs.length === 0) continue;
    const succeeded = skill.runs.filter((run) => run.status === 'SUCCEEDED');
    const passRate = succeeded.length / skill.runs.length;
    const recentFailures = skill.runs.toReversed().findIndex((run) => run.status === 'SUCCEEDED');
    const strategy = chooseExecutionStrategy({
      confidence: skill.confidence,
      validationPassRate: passRate,
      knownInputCoverage: Math.min(1, skill.runCount / 5),
      recentConsecutiveFailures: recentFailures === -1 ? skill.runs.length : recentFailures,
      unfamiliarStepIds: [],
    });
    const confidence = Math.max(0.2, Math.min(0.98, skill.confidence * 0.7 + passRate * 0.3));
    await db.skill.update({
      where: { id: skill.id },
      data: {
        confidence,
        runCount: skill.runs.length,
        successCount: succeeded.length,
        status: passRate < 0.5 ? SkillStatus.PAUSED : skill.status,
        compiledPlan: strategy as unknown as Prisma.InputJsonValue,
      },
    });
    const latest = skill.runs.at(-1);
    const first = skill.runs[0];
    if (latest !== undefined && first !== undefined && latest.status === 'SUCCEEDED') {
      const latestCalls = await db.modelCall.count({ where: { runId: latest.id } });
      const firstCalls = await db.modelCall.count({ where: { runId: first.id } });
      await db.learningReceipt.upsert({
        where: { skillId_runId: { skillId: skill.id, runId: latest.id } },
        update: {
          confidence,
          fallbackUsed: strategy.strategy !== 'compiled_skill',
          currentRunModelCalls: latestCalls,
        },
        create: {
          skillId: skill.id,
          runId: latest.id,
          headline: `Learned ${String(Math.max(1, skill.version))} reusable steps`,
          reusableSteps: Math.max(1, skill.version),
          firstRunActions: Math.max(1, Math.round(first.durationMs / 500)),
          currentRunActions: Math.max(1, Math.round(latest.durationMs / 500)),
          firstRunModelCalls: firstCalls,
          currentRunModelCalls: latestCalls,
          confidence,
          fallbackUsed: strategy.strategy !== 'compiled_skill',
        },
      });
    }
    skillsRevalidated += 1;
  }
  return { factsSuperseded, skillsRevalidated };
};
