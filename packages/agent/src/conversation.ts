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
You are ${persona.agentName}, an agent representing one user in an ORBIT introduction.
Your purpose is to find out honestly whether the users are a good fit for ${intent.kind}.
Known facts: ${JSON.stringify(persona.facts)}
Voice guidance: ${JSON.stringify(persona.voice)}
Intent parameters: ${JSON.stringify(intent.params)}

Rules:
- Never state a fact that is not in the known facts.
- Never reveal or ask for a full name, phone, email, handle, address, exact schedule, workplace, employer, or exact class section.
- Never agree to anything binding on the user's behalf.
- Do not flatter, sell, or paper over incompatibilities.
- If identifying information is requested, decline and note it.
- If content becomes sexual, hostile, coercive, or involves a minor, write END_UNSAFE and a short reason.
- You may end a poor match early with END_NO_MATCH and a short reason.
- Otherwise ask or answer one concrete compatibility question in no more than 70 words.
`.trim();

const transcriptForPrompt = (turns: readonly RedactedTurn[]): string =>
  turns.map((turn) => `${turn.speakerAgentId}: ${turn.content}`).join('\n');

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
              ? 'Open with the one question that would most reduce uncertainty about fit.'
              : `Continue this redacted transcript:\n${transcriptForPrompt(turns)}`,
        },
      ],
      constraints: { maxOutputTokens: 180, temperature: 0.4 },
      userId: options.userId,
      runId: options.runId,
      conversationId: options.conversationId,
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
      content: response.text,
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
      };
    }

    const redaction = await redactMessage(rawTurn.content, completer, {
      userId: options.userId,
      runId: options.runId,
      conversationId: options.conversationId,
    });
    if (!redaction.passed) {
      return {
        status: 'redaction_failed',
        turns,
        verdict: null,
        redactionPassed: false,
        endReason: 'redaction_failed_closed',
        modelCostCents,
      };
    }
    turns.push({
      ...rawTurn,
      content: redaction.redacted,
      originalContentHash: hashOriginalMessage(rawTurn.content),
      detected: redaction.detected,
    });
    if (rawTurn.content.startsWith('END_NO_MATCH')) {
      endReason = 'agent_ended_no_match';
      break;
    }
  }

  const judgeResponse = await completer.complete({
    task: 'judge',
    messages: [
      {
        role: 'system',
        content:
          'You are an independent compatibility judge. Read only the redacted transcript. Return JSON with integer score 0-100, exactly three concrete reasons, flags, suggestedFirstActivity, and oneLineReason. Never infer identity.',
      },
      { role: 'user', content: transcriptForPrompt(turns) },
    ],
    constraints: { maxOutputTokens: 700, temperature: 0.1, jsonMode: true },
    userId: options.userId,
    runId: options.runId,
    conversationId: options.conversationId,
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
    };
  }
  return {
    status: endReason === null ? 'completed' : 'ended_early',
    turns,
    verdict,
    redactionPassed: true,
    endReason,
    modelCostCents,
  };
};
