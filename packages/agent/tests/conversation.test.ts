import { describe, expect, it } from 'vitest';

import { runBoundedConversation, type Completer } from '../src/index.js';

const completer: Completer = {
  complete: async (request) => {
    const text =
      request.task === 'redaction'
        ? JSON.stringify({
            safe: true,
            redacted: request.messages.at(-1)?.content ?? '',
            uncertain: false,
            flags: [],
          })
        : request.task === 'judge'
          ? JSON.stringify({
              score: 84,
              reasons: ['Compatible pace.', 'Shared reliability.', 'Concrete first step.'],
              flags: [],
              suggestedFirstActivity: 'Coffee in a public campus cafe.',
              oneLineReason: 'A credible, low-pressure fit.',
            })
          : 'I value reliable follow-through. What does a good first meeting look like?';
    return Promise.resolve({
      text,
      provider: 'stub',
      model: `stub-${request.task}`,
      tokensIn: 20,
      tokensOut: 20,
      latencyMs: 1,
      costCents: 0,
      usedFallback: false,
    });
  },
};

describe('bounded agent conversation', () => {
  it('stores only redacted turns and an independent verdict', async () => {
    const result = await runBoundedConversation(
      {
        agentId: 'agent-a',
        agentName: 'A',
        facts: [{ kind: 'preference', content: 'direct plans', confidence: 0.9 }],
        voice: { tone: ['direct'], sentenceStyle: 'short', avoids: [] },
      },
      {
        agentId: 'agent-b',
        agentName: 'B',
        facts: [{ kind: 'trait', content: 'reliable', confidence: 0.9 }],
        voice: { tone: ['warm'], sentenceStyle: 'short', avoids: [] },
      },
      { kind: 'friendship', params: {} },
      completer,
      {
        maxTurns: 4,
        maxTokenBudget: 1000,
        userId: 'user-12345',
        runId: 'run-12345',
        conversationId: 'conversation-12345',
      },
    );
    expect(result.status).toBe('completed');
    expect(result.turns).toHaveLength(4);
    expect(result.turns.every((turn) => turn.originalContentHash.length === 64)).toBe(true);
    expect(result.verdict?.score).toBe(84);
  });

  it('stops immediately when a response trips the safety boundary', async () => {
    const unsafeCompleter: Completer = {
      complete: async () =>
        Promise.resolve({
          text: 'END_UNSAFE because this mentions a minor.',
          provider: 'stub',
          model: 'stub',
          tokensIn: 2,
          tokensOut: 2,
          latencyMs: 1,
          costCents: 0.2,
          usedFallback: false,
        }),
    };
    const result = await runBoundedConversation(
      {
        agentId: 'agent-a',
        agentName: 'A',
        facts: [],
        voice: { tone: [], sentenceStyle: 'short', avoids: [] },
      },
      {
        agentId: 'agent-b',
        agentName: 'B',
        facts: [],
        voice: { tone: [], sentenceStyle: 'short', avoids: [] },
      },
      { kind: 'friendship', params: {} },
      unsafeCompleter,
      {
        maxTurns: 3,
        maxTokenBudget: 100,
        userId: 'user-12345',
        runId: 'run-12345',
        conversationId: 'conversation-12345',
      },
    );
    expect(result).toMatchObject({
      status: 'moderation_flagged',
      redactionPassed: false,
      endReason: 'unsafe_conversation_content',
      modelCostCents: 0.2,
    });
    expect(result.turns).toHaveLength(0);
  });

  it('ends a poor match early and still records an independent verdict', async () => {
    const earlyCompleter: Completer = {
      complete: async (request) =>
        Promise.resolve({
          text:
            request.task === 'redaction'
              ? JSON.stringify({
                  safe: true,
                  redacted: request.messages.at(-1)?.content ?? '',
                  uncertain: false,
                  flags: [],
                })
              : request.task === 'judge'
                ? JSON.stringify({
                    score: 12,
                    reasons: ['Different pace.', 'Different goals.', 'No safe next step.'],
                    flags: [],
                    suggestedFirstActivity: 'None',
                    oneLineReason: 'Not a fit.',
                  })
                : 'END_NO_MATCH Our goals do not align.',
          provider: 'stub',
          model: 'stub',
          tokensIn: 2,
          tokensOut: 2,
          latencyMs: 1,
          costCents: 0,
          usedFallback: false,
        }),
    };
    const result = await runBoundedConversation(
      {
        agentId: 'agent-a',
        agentName: 'A',
        facts: [],
        voice: { tone: [], sentenceStyle: 'short', avoids: [] },
      },
      {
        agentId: 'agent-b',
        agentName: 'B',
        facts: [],
        voice: { tone: [], sentenceStyle: 'short', avoids: [] },
      },
      { kind: 'friendship', params: {} },
      earlyCompleter,
      {
        maxTurns: 4,
        maxTokenBudget: 100,
        userId: 'user-12345',
        runId: 'run-12345',
        conversationId: 'conversation-12345',
      },
    );
    expect(result).toMatchObject({
      status: 'ended_early',
      endReason: 'agent_ended_no_match',
      redactionPassed: true,
    });
    expect(result.turns).toHaveLength(1);
  });

  it('fails closed when the judge response is malformed', async () => {
    const invalidJudge: Completer = {
      complete: async (request) =>
        Promise.resolve({
          text:
            request.task === 'redaction'
              ? JSON.stringify({
                  safe: true,
                  redacted: request.messages.at(-1)?.content ?? '',
                  uncertain: false,
                  flags: [],
                })
              : request.task === 'judge'
                ? 'not-json'
                : 'A safe compatibility answer.',
          provider: 'stub',
          model: 'stub',
          tokensIn: 2,
          tokensOut: 2,
          latencyMs: 1,
          costCents: 0,
          usedFallback: false,
        }),
    };
    const result = await runBoundedConversation(
      {
        agentId: 'agent-a',
        agentName: 'A',
        facts: [],
        voice: { tone: [], sentenceStyle: 'short', avoids: [] },
      },
      {
        agentId: 'agent-b',
        agentName: 'B',
        facts: [],
        voice: { tone: [], sentenceStyle: 'short', avoids: [] },
      },
      { kind: 'friendship', params: {} },
      invalidJudge,
      {
        maxTurns: 1,
        maxTokenBudget: 100,
        userId: 'user-12345',
        runId: 'run-12345',
        conversationId: 'conversation-12345',
      },
    );
    expect(result).toMatchObject({
      status: 'redaction_failed',
      redactionPassed: false,
      endReason: 'invalid_judge_output',
    });
  });
});
