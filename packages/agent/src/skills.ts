import type { CrystallizedSkill, ExecutionDecision, ExperienceTrace } from './types.js';

export const crystallizeExperience = (trace: ExperienceTrace): CrystallizedSkill => {
  if (!trace.validated) throw new Error('Only a validated trace can become a reusable skill');
  const successful = trace.steps.filter((step) => step.success);
  if (successful.length === 0) throw new Error('A skill needs at least one successful step');
  const deterministicRatio =
    successful.filter((step) => step.tool !== null).length / successful.length;
  const confidence = Math.min(0.98, 0.55 + deterministicRatio * 0.3 + 0.1);
  return {
    name: trace.taskName,
    definition: {
      trigger: trace.trigger,
      steps: successful.map((step, index) => ({
        id: `step-${String(index + 1)}`,
        title: step.title,
        instruction: step.instruction,
        tool: step.tool,
        requiresApproval: step.requiredApproval,
        successCheck: `Confirm the expected outcome for: ${step.title}`,
      })),
      rules: [
        'Stop before any externally visible write unless approval is recorded.',
        'Do not reuse private content outside the task scope.',
        'Fall back to general reasoning when an input violates a validated assumption.',
      ],
      checks: [`The final outcome matches: ${trace.outcome}`],
      permissions: [...trace.permissions],
      fallback: 'Pause and use frontier reasoning for the unfamiliar branch.',
    },
    confidence,
    evidence: {
      traceId: trace.id,
      successfulSteps: successful.length,
      totalSteps: trace.steps.length,
      modelCalls: trace.steps.reduce((total, step) => total + step.modelCalls, 0),
      durationMs: trace.steps.reduce((total, step) => total + step.durationMs, 0),
    },
  };
};

export const chooseExecutionStrategy = (input: {
  confidence: number;
  validationPassRate: number;
  knownInputCoverage: number;
  recentConsecutiveFailures: number;
  unfamiliarStepIds: readonly string[];
}): ExecutionDecision => {
  if (input.recentConsecutiveFailures >= 2 || input.validationPassRate < 0.8) {
    return {
      strategy: 'frontier_reasoning',
      reason: 'Recent evidence no longer supports autonomous replay.',
      frontierOnlySteps: [...input.unfamiliarStepIds],
    };
  }
  if (
    input.confidence >= 0.9 &&
    input.validationPassRate >= 0.95 &&
    input.knownInputCoverage >= 0.95 &&
    input.unfamiliarStepIds.length === 0
  ) {
    return {
      strategy: 'compiled_skill',
      reason: 'The input is inside the validated skill envelope.',
      frontierOnlySteps: [],
    };
  }
  return {
    strategy: 'hybrid',
    reason: 'Reuse the validated path and rent reasoning only for unfamiliar branches.',
    frontierOnlySteps: [...input.unfamiliarStepIds],
  };
};

export const learningReceipt = (input: {
  skillId: string;
  reusableSteps: number;
  firstRunActions: number;
  currentRunActions: number;
  firstRunModelCalls: number;
  currentRunModelCalls: number;
  confidence: number;
  fallbackUsed: boolean;
}): Readonly<Record<string, string | number | boolean>> => ({
  skillId: input.skillId,
  headline: `Learned ${String(input.reusableSteps)} reusable steps`,
  reusableSteps: input.reusableSteps,
  firstRunActions: input.firstRunActions,
  currentRunActions: input.currentRunActions,
  actionsSaved: Math.max(0, input.firstRunActions - input.currentRunActions),
  firstRunModelCalls: input.firstRunModelCalls,
  currentRunModelCalls: input.currentRunModelCalls,
  modelCallsSaved: Math.max(0, input.firstRunModelCalls - input.currentRunModelCalls),
  confidence: input.confidence,
  fallbackUsed: input.fallbackUsed,
});
