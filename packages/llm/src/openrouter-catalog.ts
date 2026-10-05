import type { ModelPrice, ModelPriceResolver } from './types.js';

interface OpenRouterModel {
  readonly id?: unknown;
  readonly pricing?: {
    readonly prompt?: unknown;
    readonly completion?: unknown;
  };
}

interface OpenRouterCatalogResponse {
  readonly data?: readonly OpenRouterModel[];
}

const toCentsPerMillion = (value: unknown): number | undefined => {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const dollarsPerToken = Number(value);
  if (!Number.isFinite(dollarsPerToken) || dollarsPerToken < 0) return undefined;
  return dollarsPerToken * 100 * 1_000_000;
};

/**
 * Uses OpenRouter's live models catalog instead of a price remembered in
 * source. It caches a successful lookup briefly so a busy worker does not
 * make one catalog request per completion. Environment prices remain the
 * router's explicitly configured fallback when the catalog is unavailable.
 */
export class OpenRouterCatalogPriceResolver implements ModelPriceResolver {
  private prices = new Map<string, ModelPrice>();
  private refreshedAt = 0;
  private refreshInFlight: Promise<void> | null = null;

  public constructor(
    private readonly options: {
      readonly apiKey?: string;
      readonly baseUrl?: string;
      readonly ttlMs?: number;
      readonly fetcher?: typeof fetch;
    } = {},
  ) {}

  public async priceFor(provider: string, model: string): Promise<ModelPrice | undefined> {
    if (provider !== 'openrouter') return undefined;
    await this.refreshIfStale();
    return this.prices.get(model);
  }

  private async refreshIfStale(): Promise<void> {
    const ttlMs = this.options.ttlMs ?? 60 * 60 * 1_000;
    if (Date.now() - this.refreshedAt < ttlMs && this.prices.size > 0) return;
    this.refreshInFlight ??= this.refresh().finally(() => {
      this.refreshInFlight = null;
    });
    await this.refreshInFlight;
  }

  private async refresh(): Promise<void> {
    const fetcher = this.options.fetcher ?? fetch;
    const baseUrl = (this.options.baseUrl ?? 'https://openrouter.ai/api/v1').replace(/\/$/u, '');
    try {
      const response = await fetcher(`${baseUrl}/models`, {
        ...(this.options.apiKey === undefined || this.options.apiKey.length === 0
          ? {}
          : { headers: { authorization: `Bearer ${this.options.apiKey}` } }),
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) return;
      const body = (await response.json()) as OpenRouterCatalogResponse;
      const next = new Map<string, ModelPrice>();
      for (const entry of body.data ?? []) {
        if (typeof entry.id !== 'string') continue;
        const inputCostPerMillionTokens = toCentsPerMillion(entry.pricing?.prompt);
        const outputCostPerMillionTokens = toCentsPerMillion(entry.pricing?.completion);
        if (inputCostPerMillionTokens === undefined || outputCostPerMillionTokens === undefined)
          continue;
        next.set(entry.id, { inputCostPerMillionTokens, outputCostPerMillionTokens });
      }
      if (next.size > 0) {
        this.prices = next;
        this.refreshedAt = Date.now();
      }
    } catch {
      // Calls remain available at their explicitly configured environment rate.
    }
  }
}
