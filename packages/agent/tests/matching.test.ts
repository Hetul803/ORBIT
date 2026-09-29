import { describe, expect, it } from 'vitest';

import { chooseExecutionStrategy, rerankCandidates, selectCandidates } from '../src/index.js';
import type { Candidate, Completer } from '../src/index.js';

describe('matching filters', () => {
  it('filters unsafe candidates before ranking and caps retrieval at twenty', () => {
    const candidates = Array.from({ length: 30 }, (_, index) => ({
      agentId: `agent-${String(index)}`,
      retrievalScore: 1 - index / 100,
      compatible: true,
      sameScope: true,
      withinAgeBand: true,
      blocked: index === 0,
      alreadyIntroduced: index === 1,
      activeWithin14Days: index !== 2,
    }));
    const selected = selectCandidates(candidates);
    expect(selected).toHaveLength(20);
    expect(selected.map((candidate) => candidate.agentId)).not.toEqual(
      expect.arrayContaining(['agent-0', 'agent-1', 'agent-2']),
    );
  });

  it('reranks candidates with bounded scores and keeps only the best five', async () => {
    const candidates: Candidate[] = Array.from({ length: 7 }, (_, index) => ({
      agentId: `agent-${String(index)}`,
      retrievalScore: 0.9 - index / 100,
      compatible: true,
      sameScope: true,
      withinAgeBand: true,
      blocked: false,
      alreadyIntroduced: false,
      activeWithin14Days: true,
    }));
    let call = 0;
    const completer: Completer = {
      complete: async () => {
        call += 1;
        return Promise.resolve({
          text: JSON.stringify({
            score: call === 1 ? 7 : call / 10,
            rationale: `fit-${String(call)}`,
          }),
          provider: 'stub',
          model: 'stub-rerank',
          tokensIn: 10,
          tokensOut: 4,
          latencyMs: 1,
          costCents: 0,
          usedFallback: false,
        });
      },
    };
    const result = await rerankCandidates(
      candidates,
      new Map(
        candidates.map((candidate) => [candidate.agentId, `profile for ${candidate.agentId}`]),
      ),
      { kind: 'friendship', params: { pace: 'low-pressure' } },
      completer,
      { userId: 'user-12345', runId: 'run-12345' },
    );
    expect(result).toHaveLength(5);
    expect(result[0]?.rerankScore).toBe(1);
    expect(result.map((candidate) => candidate.rerankScore)).toEqual([1, 0.7, 0.6, 0.5, 0.4]);
  });

  it('fails a malformed rerank response closed', async () => {
    const completer: Completer = {
      complete: async () =>
        Promise.resolve({
          text: '{not-json',
          provider: 'stub',
          model: 'stub-rerank',
          tokensIn: 1,
          tokensOut: 1,
          latencyMs: 1,
          costCents: 0,
          usedFallback: false,
        }),
    };
    const [candidate] = await rerankCandidates(
      [
        {
          agentId: 'agent-a',
          retrievalScore: 1,
          compatible: true,
          sameScope: true,
          withinAgeBand: true,
          blocked: false,
          alreadyIntroduced: false,
          activeWithin14Days: true,
        },
      ],
      new Map(),
      { kind: 'cofounder', params: {} },
      completer,
      { userId: 'user-12345', runId: 'run-12345' },
    );
    expect(candidate).toMatchObject({
      rerankScore: 0,
      rationale: 'Candidate could not be safely scored.',
    });
  });
});

describe('ORVIN execution routing', () => {
  it('replays only when evidence and coverage are high', () => {
    expect(
      chooseExecutionStrategy({
        confidence: 0.95,
        validationPassRate: 0.98,
        knownInputCoverage: 0.99,
        recentConsecutiveFailures: 0,
        unfamiliarStepIds: [],
      }).strategy,
    ).toBe('compiled_skill');
  });

  it('uses frontier reasoning after repeated failures', () => {
    expect(
      chooseExecutionStrategy({
        confidence: 0.96,
        validationPassRate: 0.9,
        knownInputCoverage: 1,
        recentConsecutiveFailures: 2,
        unfamiliarStepIds: ['step-new'],
      }).strategy,
    ).toBe('frontier_reasoning');
  });

  it('uses hybrid execution for partially familiar work', () => {
    expect(
      chooseExecutionStrategy({
        confidence: 0.88,
        validationPassRate: 0.94,
        knownInputCoverage: 0.8,
        recentConsecutiveFailures: 0,
        unfamiliarStepIds: ['step-new'],
      }),
    ).toEqual({
      strategy: 'hybrid',
      reason: 'Reuse the validated path and rent reasoning only for unfamiliar branches.',
      frontierOnlySteps: ['step-new'],
    });
  });
});
