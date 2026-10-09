import type {
  CompleteRequest,
  CompleteResponse,
  ApiKeyResolver,
  CostLedger,
  LlmProvider,
  LlmTask,
  ModelPrice,
  ModelPriceResolver,
  ModelRouterConfig,
  ProviderRequest,
  RouterModelConfig,
} from './types.js';

export class CostCapError extends Error {
  public constructor(
    message: string,
    public readonly scope: 'user' | 'global',
  ) {
    super(message);
    this.name = 'CostCapError';
  }
}

interface CircuitState {
  failures: number;
  openedAt: number | null;
}

const sleep = async (delayMs: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, delayMs));

const configuredPrice = (config: RouterModelConfig, fallback: boolean): ModelPrice => ({
  inputCostPerMillionTokens: fallback
    ? (config.fallbackInputCostPerMillionTokens ?? config.inputCostPerMillionTokens)
    : config.inputCostPerMillionTokens,
  outputCostPerMillionTokens: fallback
    ? (config.fallbackOutputCostPerMillionTokens ?? config.outputCostPerMillionTokens)
    : config.outputCostPerMillionTokens,
});

const computeCostCents = (tokensIn: number, tokensOut: number, price: ModelPrice): number =>
  (tokensIn * price.inputCostPerMillionTokens + tokensOut * price.outputCostPerMillionTokens) /
  1_000_000;

const estimateInputTokens = (request: CompleteRequest): number =>
  Math.max(
    1,
    request.messages.reduce(
      (total, message) => total + new TextEncoder().encode(message.content).length + 128,
      0,
    ) +
      (request.tools === undefined
        ? 0
        : new TextEncoder().encode(JSON.stringify(request.tools)).length),
  );

export class ModelRouter {
  private readonly circuits = new Map<string, CircuitState>();

  public constructor(
    private readonly config: ModelRouterConfig,
    private readonly providers: ReadonlyMap<string, LlmProvider>,
    private readonly ledger: CostLedger,
    private readonly apiKeyResolver?: ApiKeyResolver,
    private readonly priceResolver?: ModelPriceResolver,
  ) {}

  public async complete(request: CompleteRequest): Promise<CompleteResponse> {
    const taskConfig = this.config.tasks[request.task];
    const primaryCircuitKey = `${taskConfig.provider}:${taskConfig.primary}`;
    const useFallbackFirst = this.isCircuitOpen(primaryCircuitKey);

    const attempts: readonly {
      provider: string;
      model: string;
      fallback: boolean;
    }[] = useFallbackFirst
      ? [{ provider: taskConfig.fallbackProvider, model: taskConfig.fallback, fallback: true }]
      : [
          { provider: taskConfig.provider, model: taskConfig.primary, fallback: false },
          { provider: taskConfig.fallbackProvider, model: taskConfig.fallback, fallback: true },
        ];

    let finalError: Error | null = null;
    for (const attempt of attempts) {
      const provider = this.providers.get(attempt.provider);
      if (!provider) {
        finalError = new Error(`Unknown LLM provider: ${attempt.provider}`);
        continue;
      }

      for (let retry = 0; retry <= this.config.maxRetries; retry += 1) {
        const startedAt = Date.now();
        try {
          const price =
            (await this.priceResolver?.priceFor(provider.name, attempt.model)) ??
            configuredPrice(taskConfig, attempt.fallback);
          const projectedCostCents = computeCostCents(
            estimateInputTokens(request),
            request.constraints.maxOutputTokens,
            price,
          );
          // Recheck immediately before every paid attempt. This includes retries and
          // fallback providers; a cap reached by another call stops the next attempt.
          const reservationId =
            this.ledger.reserve === undefined
              ? (await this.enforceCaps(request.userId, projectedCostCents), undefined)
              : await this.ledger.reserve(
                  request.userId,
                  projectedCostCents,
                  this.config.userDailyCapCents,
                  this.config.globalDailyCapCents,
                );
          const apiKeyOverride =
            request.apiKeyOverride ??
            (await this.apiKeyResolver?.(request.userId, attempt.provider));
          const providerRequest: ProviderRequest = {
            model: attempt.model,
            messages: request.messages,
            constraints: request.constraints,
            ...(request.tools === undefined ? {} : { tools: request.tools }),
            ...(apiKeyOverride === undefined ? {} : { apiKeyOverride }),
          };
          const result = await provider.complete(providerRequest);
          const latencyMs = Date.now() - startedAt;
          const costCents = computeCostCents(result.tokensIn, result.tokensOut, price);
          this.recordSuccess(`${attempt.provider}:${attempt.model}`);
          await this.ledger.record(
            {
              userId: request.userId,
              ...(request.runId === undefined ? {} : { runId: request.runId }),
              ...(request.conversationId === undefined
                ? {}
                : { conversationId: request.conversationId }),
              task: request.task,
              provider: provider.name,
              model: attempt.model,
              tokensIn: result.tokensIn,
              tokensOut: result.tokensOut,
              costCents,
              latencyMs,
              ...(request.requestId === undefined ? {} : { requestId: request.requestId }),
            },
            reservationId,
          );
          return {
            ...result,
            provider: provider.name,
            model: attempt.model,
            latencyMs,
            costCents,
            usedFallback: attempt.fallback,
          };
        } catch (error: unknown) {
          finalError = error instanceof Error ? error : new Error(String(error));
          if (finalError instanceof CostCapError) throw finalError;
          this.recordFailure(`${attempt.provider}:${attempt.model}`);
          if (retry < this.config.maxRetries) await sleep(50 * 2 ** retry);
        }
      }
    }

    throw finalError ?? new Error('No LLM provider could complete the request');
  }

  private async enforceCaps(userId: string, projectedCostCents: number): Promise<void> {
    const [userSpend, globalSpend] = await Promise.all([
      this.ledger.userSpendToday(userId),
      this.ledger.globalSpendToday(),
    ]);
    if (
      userSpend >= this.config.userDailyCapCents ||
      userSpend + projectedCostCents > this.config.userDailyCapCents
    ) {
      throw new CostCapError('The daily model budget for this user has been reached.', 'user');
    }
    if (
      globalSpend >= this.config.globalDailyCapCents ||
      globalSpend + projectedCostCents > this.config.globalDailyCapCents
    ) {
      throw new CostCapError('The platform daily model budget has been reached.', 'global');
    }
  }

  private isCircuitOpen(key: string): boolean {
    const state = this.circuits.get(key);
    if (state?.openedAt === null || state?.openedAt === undefined) return false;
    if (Date.now() - state.openedAt >= this.config.circuitBreakerCooldownMs) {
      this.circuits.set(key, { failures: 0, openedAt: null });
      return false;
    }
    return true;
  }

  private recordSuccess(key: string): void {
    this.circuits.set(key, { failures: 0, openedAt: null });
  }

  private recordFailure(key: string): void {
    const current = this.circuits.get(key) ?? { failures: 0, openedAt: null };
    const failures = current.failures + 1;
    this.circuits.set(key, {
      failures,
      openedAt: failures >= this.config.circuitBreakerFailures ? Date.now() : current.openedAt,
    });
  }
}

const configuredCost = (
  environment: NodeJS.ProcessEnv,
  keys: readonly string[],
  provider: string,
): number => {
  if (provider === 'stub') return 0;
  const configured = keys
    .map((key) => ({ key, value: environment[key]?.trim() }))
    .find((candidate) => candidate.value !== undefined && candidate.value.length > 0);
  const raw = configured?.value;
  if (raw === undefined) {
    throw new Error(`${keys.join(' or ')} is required when the selected provider is not stub`);
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(
      `${configured?.key ?? keys[0] ?? 'Model cost metadata'} must be a non-negative number`,
    );
  }
  return value;
};

type ModelTier = 'CHEAP' | 'MID' | 'STRONG';

const defaultTierForTask: Readonly<Record<LlmTask, ModelTier>> = {
  interview: 'MID',
  conversation: 'MID',
  rerank: 'MID',
  judge: 'STRONG',
  draft: 'STRONG',
  redaction: 'CHEAP',
  embedding: 'CHEAP',
  skill_crystallization: 'MID',
  skill_validation: 'MID',
  ask_routing: 'CHEAP',
};

const parseTier = (environment: NodeJS.ProcessEnv, task: LlmTask): ModelTier => {
  const value = environment[`LLM_TASK_${task.toUpperCase()}_TIER`]?.trim().toUpperCase();
  if (value === undefined || value.length === 0) return defaultTierForTask[task];
  if (value === 'CHEAP' || value === 'MID' || value === 'STRONG') return value;
  throw new Error(`LLM_TASK_${task.toUpperCase()}_TIER must be CHEAP, MID, or STRONG`);
};

const modelKey = (task: LlmTask): string => `LLM_MODEL_${task.toUpperCase()}`;

const tierKey = (tier: ModelTier, suffix: string): string => `LLM_TIER_${tier}_${suffix}`;

const costKeys = (
  task: LlmTask,
  tier: ModelTier,
  route: 'PRIMARY' | 'FALLBACK',
  direction: 'INPUT' | 'OUTPUT',
): readonly string[] => [
  tierKey(tier, `${route}_${direction}_COST_CENTS_PER_MILLION_TOKENS`),
  ...(route === 'PRIMARY' ? [tierKey(tier, `${direction}_COST_CENTS_PER_MILLION_TOKENS`)] : []),
  `LLM_COST_${task.toUpperCase()}_${direction}_CENTS_PER_MILLION_TOKENS`,
  `LLM_${direction}_COST_CENTS_PER_MILLION_TOKENS`,
];

export const configFromEnvironment = (environment: NodeJS.ProcessEnv): ModelRouterConfig => {
  const defaultProvider = environment.LLM_DEFAULT_PROVIDER ?? 'stub';
  const tasks = [
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
  return {
    tasks: Object.fromEntries(
      tasks.map((task) => {
        const tier = parseTier(environment, task);
        const provider = environment[tierKey(tier, 'PROVIDER')] ?? defaultProvider;
        const fallbackProvider =
          environment[tierKey(tier, 'FALLBACK_PROVIDER')] ??
          environment.LLM_FALLBACK_PROVIDER ??
          'stub';
        const primary =
          environment[tierKey(tier, 'PRIMARY_MODEL')] ??
          environment[modelKey(task)] ??
          `stub-${task}-v1`;
        const fallback =
          environment[tierKey(tier, 'FALLBACK_MODEL')] ??
          environment.LLM_CHEAP_FALLBACK_MODEL ??
          'stub-fallback-v1';
        if (environment.NODE_ENV === 'production') {
          if (
            provider === 'stub' ||
            fallbackProvider === 'stub' ||
            primary.startsWith('stub-') ||
            fallback.startsWith('stub-')
          ) {
            throw new Error(
              `Production configuration error: ${modelKey(task)} and its fallback must select real models and providers`,
            );
          }
        }
        return [
          task,
          {
            primary,
            fallback,
            provider,
            fallbackProvider,
            inputCostPerMillionTokens: configuredCost(
              environment,
              costKeys(task, tier, 'PRIMARY', 'INPUT'),
              provider,
            ),
            outputCostPerMillionTokens: configuredCost(
              environment,
              costKeys(task, tier, 'PRIMARY', 'OUTPUT'),
              provider,
            ),
            fallbackInputCostPerMillionTokens: configuredCost(
              environment,
              costKeys(task, tier, 'FALLBACK', 'INPUT'),
              fallbackProvider,
            ),
            fallbackOutputCostPerMillionTokens: configuredCost(
              environment,
              costKeys(task, tier, 'FALLBACK', 'OUTPUT'),
              fallbackProvider,
            ),
          },
        ];
      }),
    ) as Record<LlmTask, RouterModelConfig>,
    userDailyCapCents: Number(environment.USER_DAILY_COST_CAP_CENTS ?? 35),
    globalDailyCapCents: Number(environment.GLOBAL_DAILY_COST_CAP_CENTS ?? 2_500),
    maxRetries: 2,
    circuitBreakerFailures: 3,
    circuitBreakerCooldownMs: 60_000,
  };
};
