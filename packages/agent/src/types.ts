import type { CompleteRequest, CompleteResponse } from '@orbit/llm';
import type { IntentKind, SkillDefinition, VerdictDto } from '@orbit/shared';

export interface StructuredFact {
  readonly kind: 'trait' | 'preference' | 'goal' | 'constraint' | 'person' | 'event' | 'voice';
  readonly content: string;
  readonly confidence: number;
}

export interface AgentPersona {
  readonly agentId: string;
  readonly agentName: string;
  readonly facts: readonly StructuredFact[];
  readonly voice: Readonly<{
    tone: readonly string[];
    sentenceStyle: string;
    avoids: readonly string[];
  }>;
}

export interface IntentContext {
  readonly kind: IntentKind;
  readonly params: Readonly<Record<string, unknown>>;
}

export interface Candidate {
  readonly agentId: string;
  readonly retrievalScore: number;
  readonly compatible: boolean;
  readonly sameScope: boolean;
  readonly withinAgeBand: boolean;
  readonly blocked: boolean;
  readonly alreadyIntroduced: boolean;
  readonly activeWithin14Days: boolean;
}

export interface RerankedCandidate extends Candidate {
  readonly rerankScore: number;
  readonly rationale: string;
}

export interface ConversationTurn {
  readonly speakerAgentId: string;
  readonly turnIndex: number;
  readonly content: string;
}

export interface RedactedTurn extends ConversationTurn {
  readonly originalContentHash: string;
  readonly detected: readonly PiiKind[];
}

export type PiiKind =
  | 'email'
  | 'phone'
  | 'social_handle'
  | 'street_address'
  | 'full_name'
  | 'employer'
  | 'class_section'
  | 'exact_schedule';

export interface RedactionResult {
  readonly passed: boolean;
  readonly redacted: string;
  readonly detected: readonly PiiKind[];
  readonly uncertain: boolean;
}

export interface ConversationResult {
  readonly status: 'completed' | 'ended_early' | 'redaction_failed' | 'moderation_flagged';
  readonly turns: readonly RedactedTurn[];
  readonly verdict: VerdictDto | null;
  readonly redactionPassed: boolean;
  readonly endReason: string | null;
  readonly modelCostCents: number;
}

export interface Completer {
  complete(request: CompleteRequest): Promise<CompleteResponse>;
}

export interface PipelineOptions {
  readonly maxTurns: number;
  readonly maxTokenBudget: number;
  readonly userId: string;
  readonly runId: string;
  readonly conversationId: string;
}

export interface ExperienceStep {
  readonly title: string;
  readonly instruction: string;
  readonly tool: string | null;
  readonly requiredApproval: boolean;
  readonly success: boolean;
  readonly durationMs: number;
  readonly modelCalls: number;
}

export interface ExperienceTrace {
  readonly id: string;
  readonly taskName: string;
  readonly trigger: string;
  readonly steps: readonly ExperienceStep[];
  readonly outcome: string;
  readonly validated: boolean;
  readonly permissions: readonly string[];
}

export interface CrystallizedSkill {
  readonly name: string;
  readonly definition: SkillDefinition;
  readonly confidence: number;
  readonly evidence: Readonly<{
    traceId: string;
    successfulSteps: number;
    totalSteps: number;
    modelCalls: number;
    durationMs: number;
  }>;
}

export interface ExecutionDecision {
  readonly strategy: 'compiled_skill' | 'hybrid' | 'frontier_reasoning';
  readonly reason: string;
  readonly frontierOnlySteps: readonly string[];
}
