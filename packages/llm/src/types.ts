export const llmTasks = [
  'interview',
  'conversation',
  'rerank',
  'judge',
  'draft',
  'redaction',
  'embedding',
  'skill_crystallization',
  'skill_validation',
  'ask_routing',
] as const;

export type LlmTask = (typeof llmTasks)[number];
export type LlmRole = 'system' | 'user' | 'assistant';

export interface LlmMessage {
  readonly role: LlmRole;
  readonly content: string;
}

export interface LlmTool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Readonly<Record<string, unknown>>;
}

export interface LlmConstraints {
  readonly maxOutputTokens: number;
  readonly temperature: number;
  readonly jsonMode?: boolean;
  readonly stop?: readonly string[];
}

export interface CompleteRequest {
  readonly task: LlmTask;
  readonly messages: readonly LlmMessage[];
  readonly tools?: readonly LlmTool[];
  readonly constraints: LlmConstraints;
  readonly userId: string;
  readonly runId?: string;
  readonly conversationId?: string;
  readonly apiKeyOverride?: string;
  readonly requestId?: string;
}

export interface CompleteResponse {
  readonly text: string;
  readonly provider: string;
  readonly model: string;
  readonly tokensIn: number;
  readonly tokensOut: number;
  readonly latencyMs: number;
  readonly costCents: number;
  readonly usedFallback: boolean;
}

export interface ProviderRequest {
  readonly model: string;
  readonly messages: readonly LlmMessage[];
  readonly tools?: readonly LlmTool[];
  readonly constraints: LlmConstraints;
  readonly apiKeyOverride?: string;
}

export interface ProviderResponse {
  readonly text: string;
  readonly tokensIn: number;
  readonly tokensOut: number;
}

export interface LlmProvider {
  readonly name: string;
  complete(request: ProviderRequest): Promise<ProviderResponse>;
}

export interface ModelCallRecord {
  readonly userId: string;
  readonly runId?: string;
  readonly conversationId?: string;
  readonly task: LlmTask;
  readonly provider: string;
  readonly model: string;
  readonly tokensIn: number;
  readonly tokensOut: number;
  readonly costCents: number;
  readonly latencyMs: number;
  readonly requestId?: string;
}

export interface CostLedger {
  userSpendToday(userId: string): Promise<number>;
  globalSpendToday(): Promise<number>;
  record(call: ModelCallRecord): Promise<void>;
}

export type ApiKeyResolver = (userId: string, provider: string) => Promise<string | undefined>;

export interface RouterModelConfig {
  readonly primary: string;
  readonly fallback: string;
  readonly provider: string;
  readonly fallbackProvider: string;
  readonly inputCostPerMillionTokens: number;
  readonly outputCostPerMillionTokens: number;
  /** Used only when the fallback model handles a request. */
  readonly fallbackInputCostPerMillionTokens?: number;
  /** Used only when the fallback model handles a request. */
  readonly fallbackOutputCostPerMillionTokens?: number;
}

export interface ModelPrice {
  readonly inputCostPerMillionTokens: number;
  readonly outputCostPerMillionTokens: number;
}

/**
 * Optional live price lookup. The router keeps the environment price as a
 * bounded fallback when the catalog cannot be reached.
 */
export interface ModelPriceResolver {
  priceFor(provider: string, model: string): Promise<ModelPrice | undefined>;
}

export interface ModelRouterConfig {
  readonly tasks: Readonly<Record<LlmTask, RouterModelConfig>>;
  readonly userDailyCapCents: number;
  readonly globalDailyCapCents: number;
  readonly maxRetries: number;
  readonly circuitBreakerFailures: number;
  readonly circuitBreakerCooldownMs: number;
}
