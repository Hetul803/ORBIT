import { describe, expect, it } from 'vitest';

import { CostCapError, ModelRouter } from '../src/router.js';
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
  it('falls back and records an auditable call', async () => {
    const ledger = new Ledger();
    const router = new ModelRouter(config, new Map([['stub', new StubProvider()]]), ledger);
    const result = await router.complete(request);
    expect(result.usedFallback).toBe(true);
    expect(result.provider).toBe('stub');
    expect(ledger.calls).toHaveLength(1);
  });

  it('enforces the user cap before making a provider call', async () => {
    const ledger = new Ledger();
    ledger.user = 10;
    const router = new ModelRouter(config, new Map([['stub', new StubProvider()]]), ledger);
    await expect(router.complete(request)).rejects.toBeInstanceOf(CostCapError);
    expect(ledger.calls).toHaveLength(0);
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
