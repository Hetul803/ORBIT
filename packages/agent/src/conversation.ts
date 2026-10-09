import { verdictSchema, type VerdictDto } from '@orbit/shared';

import { hashOriginalMessage, redactMessage } from './redaction.js';
import type {
  AgentPersona,
  Completer,
  ConversationResult,
  ConversationTurn,
  IntentContext,
  PipelineOptions,
  RedactedTurn,
} from './types.js';

const stopPatterns = [
  /\b(?:sexual|nude|explicit)\b/iu,
  /\b(?:kill|threat|hurt you)\b/iu,
  /\b(?:under\s*18|minor|seventeen|sixteen)\b/iu,
  /\b(?:coerce|forced|blackmail)\b/iu,
] as const;

const moderationFlag = (text: string): string | null => {
  const found = stopPatterns.find((pattern) => pattern.test(text));
  return found === undefined ? null : 'unsafe_conversation_content';
};

const personaPrompt = (persona: AgentPersona, intent: IntentContext): string =>
  `
You are a private representative agent for one user in an ORBIT introduction.
Your purpose is to find out honestly whether the users are a good fit for ${intent.kind}.
Known facts: ${JSON.stringify(persona.facts)}
Voice guidance: ${JSON.stringify(persona.voice)}
Intent parameters: ${JSON.stringify(intent.params)}

Rules:
- Never state a fact that is not in the known facts.
- Use only facts stated in the known-facts list. If a detail is absent, ask about it; never invent a pet, a past activity, a place, a possession, an opinion, a routine, or a goal.
- Never reveal or ask for a full name, phone, email, handle, address, exact schedule, workplace, employer, or exact class section.
- Never reveal your user's name, your agent name, an account ID, or any internal identifier.
- Reply with the turn text only. Do not prefix it with "Agent A", "Agent B", a name, or an identifier.
- Never agree to anything binding on the user's behalf.
- Do not flatter, sell, or paper over incompatibilities.
- Do not open by restating, praising, or validating the other person's words.
- Before the conversation ends, raise at least one concrete concern, constraint, tradeoff, or difference grounded in your user's facts. Name it plainly even when the overall fit looks good.
- If identifying information is requested, decline and note it.
- If content becomes sexual, hostile, coercive, or involves a minor, write END_UNSAFE and a short reason.
- You may end a poor match early with END_NO_MATCH and a short reason.
- Otherwise ask or answer one concrete compatibility question in no more than 70 words.
`.trim();

const tensionPattern =
  /\b(?:but|however|concern|constraint|tradeoff|different|difference|mismatch|conflict|rather than|cannot|can't|won't|do not|don't|need to protect|may not align|might not align)\b/iu;

const hasTension = (content: string): boolean => tensionPattern.test(content);

const penalizeMissingTension = (verdict: VerdictDto, tensionSatisfied: boolean): VerdictDto => {
  if (tensionSatisfied) return verdict;
  return {
    ...verdict,
    score: Math.min(verdict.score, 49),
    reasons: [
      'The transcript did not test a concrete concern from both people.',
      verdict.reasons[1] ?? 'The available evidence is too one-sided.',
      verdict.reasons[2] ?? 'A safe first activity cannot be justified yet.',
    ],
    flags: [...new Set([...verdict.flags, 'insufficient_tension'])],
    oneLineReason: 'Not enough disagreement or constraint-testing to support an introduction.',
  };
};

const transcriptForPrompt = (turns: readonly RedactedTurn[], personaA: AgentPersona): string =>
  turns
    .map(
      (turn) =>
        `${turn.speakerAgentId === personaA.agentId ? 'Agent A' : 'Agent B'}: ${turn.content}`,
    )
    .join('\n');

const parseVerdict = (text: string): VerdictDto | null => {
  try {
    return verdictSchema.parse(JSON.parse(text));
  } catch {
    return null;
  }
};

export const runBoundedConversation = async (
  personaA: AgentPersona,
  personaB: AgentPersona,
  intent: IntentContext,
  completer: Completer,
  options: PipelineOptions,
): Promise<ConversationResult> => {
  const turns: RedactedTurn[] = [];
  let tokenCount = 0;
  let modelCostCents = 0;
  let endReason: string | null = null;
  const tensionByAgent = new Set<string>();

  for (let turnIndex = 0; turnIndex < options.maxTurns; turnIndex += 1) {
    const speaker = turnIndex % 2 === 0 ? personaA : personaB;
    const response = await completer.complete({
      task: 'conversation',
      messages: [
        { role: 'system', content: personaPrompt(speaker, intent) },
        {
          role: 'user',
          content:
            turns.length === 0
              ? 'Open with the one question that would most reduce uncertainty about fit. Do not praise or restate.'
              : `Continue this redacted transcript:\n${transcriptForPrompt(turns, personaA)}\n\n${
                  tensionByAgent.has(speaker.agentId)
                    ? 'You have already named a constraint; keep testing fit directly.'
                    : 'You have not yet named your user’s concrete concern or difference. Do that plainly in this turn before asking the next question.'
                }`,
        },
      ],
      constraints: { maxOutputTokens: 180, temperature: 0.4 },
      userId: options.userId,
      runId: options.runId,
      conversationId: options.conversationId,
      ...(options.requestId === undefined ? {} : { requestId: options.requestId }),
    });
    modelCostCents += response.costCents;
    tokenCount += response.tokensIn + response.tokensOut;
    if (tokenCount > options.maxTokenBudget) {
      endReason = 'token_budget_reached';
      break;
    }

    const rawTurn: ConversationTurn = {
      speakerAgentId: speaker.agentId,
      turnIndex,
      content: response.text.replace(/^\s*agent\s+[ab]\s*:\s*/iu, ''),
    };
    const unsafe = moderationFlag(rawTurn.content);
    if (unsafe !== null || rawTurn.content.startsWith('END_UNSAFE')) {
      return {
        status: 'moderation_flagged',
        turns,
        verdict: null,
        redactionPassed: false,
        endReason: unsafe ?? 'agent_ended_unsafe',
        modelCostCents,
        redactionFailure: null,
      };
    }

    const redaction = await redactMessage(rawTurn.content, completer, {
      userId: options.userId,
      runId: options.runId,
      conversationId: options.conversationId,
      ...(options.requestId === undefined ? {} : { requestId: options.requestId }),
    });
    if (!redaction.passed) {
      return {
        status: 'redaction_failed',
        turns,
        verdict: null,
        redactionPassed: false,
        endReason: 'redaction_failed_closed',
        modelCostCents,
        redactionFailure: redaction.failure === null ? null : { ...redaction.failure, turnIndex },
      };
    }
    turns.push({
      ...rawTurn,
      content: redaction.redacted,
      originalContentHash: hashOriginalMessage(rawTurn.content),
      detected: redaction.detected,
    });
    if (hasTension(rawTurn.content)) tensionByAgent.add(speaker.agentId);
    if (rawTurn.content.startsWith('END_NO_MATCH')) {
      if (tensionByAgent.has(personaA.agentId) && tensionByAgent.has(personaB.agentId)) {
        endReason = 'agent_ended_no_match';
        break;
      }
    }
  }

  const tensionSatisfied =
    tensionByAgent.has(personaA.agentId) && tensionByAgent.has(personaB.agentId);

  const judgeResponse = await completer.complete({
    task: 'judge',
    messages: [
      {
        role: 'system',
        content:
          'You are an independent compatibility judge. Read only the redacted transcript. Return JSON with integer score 0-100, exactly three concrete reasons, flags, suggestedFirstActivity, and oneLineReason. Never infer identity. Explicitly penalize a transcript that contains no real disagreement, concern, tradeoff, or constraint from both people; politeness and mirrored language are not compatibility evidence.',
      },
      {
        role: 'user',
        content: `${transcriptForPrompt(turns, personaA)}\n\nConstraint raised by both sides: ${String(tensionSatisfied)}`,
      },
    ],
    constraints: { maxOutputTokens: 700, temperature: 0.1, jsonMode: true },
    userId: options.userId,
    runId: options.runId,
    conversationId: options.conversationId,
    ...(options.requestId === undefined ? {} : { requestId: options.requestId }),
  });
  modelCostCents += judgeResponse.costCents;
  const verdict = parseVerdict(judgeResponse.text);
  if (verdict === null) {
    return {
      status: 'redaction_failed',
      turns,
      verdict: null,
      redactionPassed: false,
      endReason: 'invalid_judge_output',
      modelCostCents,
      redactionFailure: {
        category: 'judge_output_invalid',
        pattern: 'invalid_verdict_json',
        source: 'model',
        turnIndex: turns.length,
      },
    };
  }
  const tensionAwareVerdict = penalizeMissingTension(verdict, tensionSatisfied);
  return {
    status: endReason === null ? 'completed' : 'ended_early',
    turns,
    verdict: tensionAwareVerdict,
    redactionPassed: true,
    endReason,
    modelCostCents,
    redactionFailure: null,
  };
};
