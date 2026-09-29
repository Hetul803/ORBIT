import { describe, expect, it } from 'vitest';

import { crystallizeExperience, learningReceipt } from '../src/index.js';
import type { ExperienceTrace } from '../src/index.js';

const trace: ExperienceTrace = {
  id: 'trace-validated',
  taskName: 'Prepare a focused introduction',
  trigger: 'A user asks for a collaborator introduction',
  steps: [
    {
      title: 'Gather constraints',
      instruction: 'Read approved memory.',
      tool: 'memory.read',
      requiredApproval: false,
      success: true,
      durationMs: 80,
      modelCalls: 0,
    },
    {
      title: 'Draft introduction',
      instruction: 'Draft from approved facts.',
      tool: null,
      requiredApproval: false,
      success: true,
      durationMs: 200,
      modelCalls: 1,
    },
    {
      title: 'Send without consent',
      instruction: 'Skip consent.',
      tool: 'message.send',
      requiredApproval: true,
      success: false,
      durationMs: 20,
      modelCalls: 0,
    },
  ],
  outcome: 'A private, consent-gated draft exists',
  validated: true,
  permissions: ['memory:read'],
};

describe('ORVIN skill crystallization', () => {
  it('turns only validated successful steps into a versionable definition', () => {
    const skill = crystallizeExperience(trace);
    expect(skill.name).toBe(trace.taskName);
    expect(skill.definition.steps).toHaveLength(2);
    expect(skill.definition.steps.some((step) => step.title === 'Send without consent')).toBe(
      false,
    );
    expect(skill.definition.fallback).toContain('frontier reasoning');
    expect(skill.evidence).toEqual({
      traceId: trace.id,
      successfulSteps: 2,
      totalSteps: 3,
      modelCalls: 1,
      durationMs: 300,
    });
    expect(skill.confidence).toBeCloseTo(0.8);
  });

  it('rejects unvalidated traces and traces without successful evidence', () => {
    expect(() => crystallizeExperience({ ...trace, validated: false })).toThrow('validated trace');
    expect(() =>
      crystallizeExperience({
        ...trace,
        steps: trace.steps.map((step) => ({ ...step, success: false })),
      }),
    ).toThrow('at least one successful step');
  });

  it('emits a legible learning receipt without negative savings', () => {
    expect(
      learningReceipt({
        skillId: 'skill-1',
        reusableSteps: 2,
        firstRunActions: 3,
        currentRunActions: 5,
        firstRunModelCalls: 4,
        currentRunModelCalls: 1,
        confidence: 0.91,
        fallbackUsed: true,
      }),
    ).toEqual(
      expect.objectContaining({
        headline: 'Learned 2 reusable steps',
        actionsSaved: 0,
        modelCallsSaved: 3,
        fallbackUsed: true,
      }),
    );
  });
});
