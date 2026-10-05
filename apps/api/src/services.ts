import type { PrismaClient } from '@orbit/db';
import {
  AnthropicProvider,
  configFromEnvironment,
  GoogleProvider,
  ModelRouter,
  OpenAiProvider,
  OpenRouterCatalogPriceResolver,
  OpenRouterProvider,
  StubProvider,
  type LlmProvider,
} from '@orbit/llm';

import type { ApiConfig } from './config.js';
import { decryptField } from './crypto.js';
import { PrismaCostLedger } from './ledger.js';
import { RealtimeHub } from './realtime.js';

export interface Services {
  readonly db: PrismaClient;
  readonly config: ApiConfig;
  readonly llm: ModelRouter;
  readonly realtime: RealtimeHub;
}

export const createServices = (db: PrismaClient, config: ApiConfig): Services => {
  const providers = new Map<string, LlmProvider>([
    ['stub', new StubProvider()],
    ['openai', new OpenAiProvider(config.OPENAI_API_KEY)],
    [
      'openrouter',
      new OpenRouterProvider(config.OPENROUTER_API_KEY, {
        baseUrl: config.OPENROUTER_BASE_URL,
        appTitle: config.OPENROUTER_APP_TITLE,
        ...(config.OPENROUTER_HTTP_REFERER === undefined
          ? {}
          : { httpReferer: config.OPENROUTER_HTTP_REFERER }),
      }),
    ],
    ['anthropic', new AnthropicProvider(config.ANTHROPIC_API_KEY)],
    ['google', new GoogleProvider(config.GOOGLE_GENERATIVE_AI_API_KEY)],
  ]);
  return {
    db,
    config,
    llm: new ModelRouter(
      configFromEnvironment(process.env),
      providers,
      new PrismaCostLedger(db),
      async (userId: string, provider: string) => {
        if (provider === 'stub') return undefined;
        const key = await db.encryptedApiKey.findUnique({
          where: { userId_provider: { userId, provider } },
          select: { encryptedValue: true },
        });
        return key === null
          ? undefined
          : decryptField(key.encryptedValue, config.FIELD_ENCRYPTION_KEY);
      },
      new OpenRouterCatalogPriceResolver({
        baseUrl: config.OPENROUTER_BASE_URL,
        ...(config.OPENROUTER_API_KEY === undefined ? {} : { apiKey: config.OPENROUTER_API_KEY }),
      }),
    ),
    realtime: new RealtimeHub(),
  };
};
