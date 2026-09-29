import type {
  CompleteRequest,
  CompleteResponse,
  ApiKeyResolver,
  CostLedger,
  LlmProvider,
  LlmTask,
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

const computeCostCents = (tokensIn: number, tokensOut: number, config: RouterModelConfig): number =>
  (tokensIn * config.inputCostPerMillionTokens + tokensOut * config.outputCostPerMillionTokens) /
  1_000_000;

export class ModelRouter {
  private readonly circuits = new Map<string, CircuitState>();

  public constructor(
    private readonly config: ModelRouterConfig,
    private readonly providers: ReadonlyMap<string, LlmProvider>,
    private readonly ledger: CostLedger,
    private readonly apiKeyResolver?: ApiKeyResolver,
  ) {}

  public async complete(request: CompleteRequest): Promise<CompleteResponse> {
    await this.enforceCaps(request.userId);
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
          const costCents = computeCostCents(result.tokensIn, result.tokensOut, taskConfig);
          this.recordSuccess(`${attempt.provider}:${attempt.model}`);
          await this.ledger.record({
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
          });
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
          this.recordFailure(`${attempt.provider}:${attempt.model}`);
          if (retry < this.config.maxRetries) await sleep(50 * 2 ** retry);
        }
      }
    }

    throw finalError ?? new Error('No LLM provider could complete the request');
  }

  private async enforceCaps(userId: string): Promise<void> {
    const [userSpend, globalSpend] = await Promise.all([
      this.ledger.userSpendToday(userId),
      this.ledger.globalSpendToday(),
    ]);
    if (userSpend >= this.config.userDailyCapCents) {
      throw new CostCapError('The daily model budget for this user has been reached.', 'user');
    }
    if (globalSpend >= this.config.globalDailyCapCents) {
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

const modelFor = (environment: NodeJS.ProcessEnv, task: LlmTask): string => {
  const key = `LLM_MODEL_${task.toUpperCase()}`;
  return environment[key] ?? `stub-${task}-v1`;
};

export const configFromEnvironment = (environment: NodeJS.ProcessEnv): ModelRouterConfig => {
  const provider = environment.LLM_DEFAULT_PROVIDER ?? 'stub';
  const fallback = environment.LLM_CHEAP_FALLBACK_MODEL ?? 'stub-fallback-v1';
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
      tasks.map((task) => [
        task,
        {
          primary: modelFor(environment, task),
          fallback,
          provider,
          fallbackProvider: 'stub',
          inputCostPerMillionTokens: provider === 'stub' ? 0 : 50,
          outputCostPerMillionTokens: provider === 'stub' ? 0 : 200,
        },
      ]),
    ) as Record<LlmTask, RouterModelConfig>,
    userDailyCapCents: Number(environment.USER_DAILY_COST_CAP_CENTS ?? 35),
    globalDailyCapCents: Number(environment.GLOBAL_DAILY_COST_CAP_CENTS ?? 2_500),
    maxRetries: 2,
    circuitBreakerFailures: 3,
    circuitBreakerCooldownMs: 60_000,
  };
};
