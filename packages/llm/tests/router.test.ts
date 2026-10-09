import { describe, expect, it } from 'vitest';

import { configFromEnvironment, CostCapError, ModelRouter } from '../src/router.js';
import { OpenRouterCatalogPriceResolver } from '../src/openrouter-catalog.js';
import { StubProvider } from '../src/providers.js';
import type { CostLedger, LlmProvider, ModelCallRecord, ModelRouterConfig } from '../src/types.js';

class Ledger implements CostLedger {
  public user = 0;
  public global = 0;
  public calls: ModelCallRecord[] = [];
  public async userSpendToday(): Promise<number> {
    return Promise.resolve(this.user);
  }
  public async globalSpendToday(): Promise<number> {
    return Promise.resolve(this.global);
  }
  public record(call: ModelCallRecord): Promise<void> {
    this.calls.push(call);
    return Promise.resolve();
  }
}

const config: ModelRouterConfig = {
  tasks: {
    interview: {
      primary: 'primary',
      fallback: 'fallback',
      provider: 'broken',
      fallbackProvider: 'stub',
      inputCostPerMillionTokens: 0,
      outputCostPerMillionTokens: 0,
    },
    conversation: {
      primary: 'primary',
      fallback: 'fallback',
      provider: 'stub',
      fallbackProvider: 'stub',
      inputCostPerMillionTokens: 0,
      outputCostPerMillionTokens: 0,
    },
    rerank: {
      primary: 'primary',
      fallback: 'fallback',
      provider: 'stub',
      fallbackProvider: 'stub',
      inputCostPerMillionTokens: 0,
      outputCostPerMillionTokens: 0,
    },
    judge: {
      primary: 'primary',
      fallback: 'fallback',
      provider: 'stub',
      fallbackProvider: 'stub',
      inputCostPerMillionTokens: 0,
      outputCostPerMillionTokens: 0,
    },
    draft: {
      primary: 'primary',
      fallback: 'fallback',
      provider: 'stub',
      fallbackProvider: 'stub',
      inputCostPerMillionTokens: 0,
      outputCostPerMillionTokens: 0,
    },
    redaction: {
      primary: 'primary',
      fallback: 'fallback',
      provider: 'stub',
      fallbackProvider: 'stub',
      inputCostPerMillionTokens: 0,
      outputCostPerMillionTokens: 0,
    },
    embedding: {
      primary: 'primary',
      fallback: 'fallback',
      provider: 'stub',
      fallbackProvider: 'stub',
      inputCostPerMillionTokens: 0,
      outputCostPerMillionTokens: 0,
    },
    skill_crystallization: {
      primary: 'primary',
      fallback: 'fallback',
      provider: 'stub',
      fallbackProvider: 'stub',
      inputCostPerMillionTokens: 0,
      outputCostPerMillionTokens: 0,
    },
    skill_validation: {
      primary: 'primary',
      fallback: 'fallback',
      provider: 'stub',
      fallbackProvider: 'stub',
      inputCostPerMillionTokens: 0,
      outputCostPerMillionTokens: 0,
    },
    ask_routing: {
      primary: 'primary',
      fallback: 'fallback',
      provider: 'stub',
      fallbackProvider: 'stub',
      inputCostPerMillionTokens: 0,
      outputCostPerMillionTokens: 0,
    },
  },
  userDailyCapCents: 10,
  globalDailyCapCents: 100,
  maxRetries: 0,
  circuitBreakerFailures: 1,
  circuitBreakerCooldownMs: 60_000,
};

const request = {
  task: 'interview' as const,
  messages: [{ role: 'user' as const, content: 'hello' }],
  constraints: { maxOutputTokens: 50, temperature: 0 },
  userId: 'user-12345',
};

describe('provider router', () => {
  it('loads auditable generic and per-task model prices from the environment', () => {
    const loaded = configFromEnvironment({
      LLM_DEFAULT_PROVIDER: 'openai',
      LLM_INPUT_COST_CENTS_PER_MILLION_TOKENS: '20',
      LLM_OUTPUT_COST_CENTS_PER_MILLION_TOKENS: '120',
      LLM_COST_INTERVIEW_INPUT_CENTS_PER_MILLION_TOKENS: '',
      LLM_COST_JUDGE_INPUT_CENTS_PER_MILLION_TOKENS: '200',
      LLM_COST_JUDGE_OUTPUT_CENTS_PER_MILLION_TOKENS: '1200',
    });

    expect(loaded.tasks.interview.inputCostPerMillionTokens).toBe(20);
    expect(loaded.tasks.interview.outputCostPerMillionTokens).toBe(120);
    expect(loaded.tasks.judge.inputCostPerMillionTokens).toBe(200);
    expect(loaded.tasks.judge.outputCostPerMillionTokens).toBe(1200);
  });

  it('rejects a paid provider without explicit pricing metadata', () => {
    expect(() => configFromEnvironment({ LLM_DEFAULT_PROVIDER: 'openai' })).toThrow(
      'LLM_INPUT_COST_CENTS_PER_MILLION_TOKENS',
    );
  });

  it('refuses stub primary models or fallback providers in production', () => {
    expect(() =>
      configFromEnvironment({
        NODE_ENV: 'production',
        LLM_DEFAULT_PROVIDER: 'openrouter',
        LLM_INPUT_COST_CENTS_PER_MILLION_TOKENS: '20',
        LLM_OUTPUT_COST_CENTS_PER_MILLION_TOKENS: '100',
      }),
    ).toThrow('real models and providers');
  });

  it('maps explicit cheap, mid, and strong tiers without changing task call sites', () => {
    const loaded = configFromEnvironment({
      LLM_DEFAULT_PROVIDER: 'openrouter',
      LLM_TIER_CHEAP_PROVIDER: 'openrouter',
      LLM_TIER_CHEAP_PRIMARY_MODEL: 'cheap-primary',
      LLM_TIER_CHEAP_FALLBACK_MODEL: 'cheap-fallback',
      LLM_TIER_CHEAP_INPUT_COST_CENTS_PER_MILLION_TOKENS: '10',
      LLM_TIER_CHEAP_OUTPUT_COST_CENTS_PER_MILLION_TOKENS: '40',
      LLM_TIER_CHEAP_FALLBACK_INPUT_COST_CENTS_PER_MILLION_TOKENS: '11',
      LLM_TIER_CHEAP_FALLBACK_OUTPUT_COST_CENTS_PER_MILLION_TOKENS: '41',
      LLM_TIER_MID_PROVIDER: 'openrouter',
      LLM_TIER_MID_PRIMARY_MODEL: 'mid-primary',
      LLM_TIER_MID_FALLBACK_MODEL: 'mid-fallback',
      LLM_TIER_MID_INPUT_COST_CENTS_PER_MILLION_TOKENS: '30',
      LLM_TIER_MID_OUTPUT_COST_CENTS_PER_MILLION_TOKENS: '250',
      LLM_TIER_MID_FALLBACK_INPUT_COST_CENTS_PER_MILLION_TOKENS: '40',
      LLM_TIER_MID_FALLBACK_OUTPUT_COST_CENTS_PER_MILLION_TOKENS: '260',
      LLM_TIER_STRONG_PROVIDER: 'openrouter',
      LLM_TIER_STRONG_PRIMARY_MODEL: 'strong-primary',
      LLM_TIER_STRONG_FALLBACK_MODEL: 'strong-fallback',
      LLM_TIER_STRONG_INPUT_COST_CENTS_PER_MILLION_TOKENS: '200',
      LLM_TIER_STRONG_OUTPUT_COST_CENTS_PER_MILLION_TOKENS: '1000',
      LLM_TIER_STRONG_FALLBACK_INPUT_COST_CENTS_PER_MILLION_TOKENS: '210',
      LLM_TIER_STRONG_FALLBACK_OUTPUT_COST_CENTS_PER_MILLION_TOKENS: '1100',
    });
    expect(loaded.tasks.redaction.primary).toBe('cheap-primary');
    expect(loaded.tasks.conversation.primary).toBe('mid-primary');
    expect(loaded.tasks.judge.primary).toBe('strong-primary');
  });

  it('falls back and records an auditable call', async () => {
    const ledger = new Ledger();
    const router = new ModelRouter(config, new Map([['stub', new StubProvider()]]), ledger);
    const result = await router.complete(request);
    expect(result.usedFallback).toBe(true);
    expect(result.provider).toBe('stub');
    expect(ledger.calls).toHaveLength(1);
  });

  it('uses live catalog pricing when it is available and retained configuration when it is not', async () => {
    const resolver = new OpenRouterCatalogPriceResolver({
      ttlMs: 60_000,
      fetcher: () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              data: [
                { id: 'catalog-model', pricing: { prompt: '0.0000001', completion: '0.0000004' } },
              ],
            }),
            { status: 200 },
          ),
        ),
    });
    await expect(resolver.priceFor('openrouter', 'catalog-model')).resolves.toEqual({
      inputCostPerMillionTokens: 10,
      outputCostPerMillionTokens: 40,
    });
    const unavailable = new OpenRouterCatalogPriceResolver({
      fetcher: async () => Promise.reject(new Error('offline')),
    });
    await expect(unavailable.priceFor('openrouter', 'catalog-model')).resolves.toBeUndefined();
  });

  it('enforces the user cap before making a provider call', async () => {
    const ledger = new Ledger();
    ledger.user = 10;
    const router = new ModelRouter(config, new Map([['stub', new StubProvider()]]), ledger);
    await expect(router.complete(request)).rejects.toBeInstanceOf(CostCapError);
    expect(ledger.calls).toHaveLength(0);
  });

  it('rechecks the cap before a retry instead of spending through the limit', async () => {
    const ledger = new Ledger();
    let providerCalls = 0;
    const provider: LlmProvider = {
      name: 'stub',
      complete: async () => {
        providerCalls += 1;
        ledger.user = 10;
        return Promise.reject(new Error('provider timeout after accepting the request'));
      },
    };
    const retryingConfig = { ...config, maxRetries: 1 };
    const router = new ModelRouter(retryingConfig, new Map([['stub', provider]]), ledger);
    await expect(router.complete({ ...request, task: 'conversation' })).rejects.toBeInstanceOf(
      CostCapError,
    );
    expect(providerCalls).toBe(1);
  });

  it('resolves a user BYOK key for the selected provider without logging it', async () => {
    const ledger = new Ledger();
    let receivedKey: string | undefined;
    const provider: LlmProvider = {
      name: 'stub',
      complete: async (providerRequest) => {
        receivedKey = providerRequest.apiKeyOverride;
        return Promise.resolve({ text: 'ok', tokensIn: 1, tokensOut: 1 });
      },
    };
    const router = new ModelRouter(
      config,
      new Map([['stub', provider]]),
      ledger,
      async (userId, providerName) =>
        Promise.resolve(
          userId === 'user-12345' && providerName === 'stub' ? 'private-user-key' : undefined,
        ),
    );
    await router.complete({ ...request, task: 'conversation' });
    expect(receivedKey).toBe('private-user-key');
    expect(JSON.stringify(ledger.calls)).not.toContain('private-user-key');
  });
});
