import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';

import type { LlmMessage, LlmProvider, ProviderRequest, ProviderResponse } from './types.js';

const estimateTokens = (text: string): number => Math.max(1, Math.ceil(text.length / 4));

const flattenMessages = (messages: readonly LlmMessage[]): string =>
  messages.map((message) => `${message.role.toUpperCase()}: ${message.content}`).join('\n\n');

export class StubProvider implements LlmProvider {
  public readonly name = 'stub';

  public constructor(
    private readonly responder: (request: ProviderRequest) => string = defaultStubResponse,
  ) {}

  public async complete(request: ProviderRequest): Promise<ProviderResponse> {
    const text = this.responder(request);
    const prompt = flattenMessages(request.messages);
    return Promise.resolve({
      text,
      tokensIn: estimateTokens(prompt),
      tokensOut: estimateTokens(text),
    });
  }
}

const defaultStubResponse = (request: ProviderRequest): string => {
  const lastMessage = request.messages.at(-1)?.content ?? '';
  if (request.model.includes('judge')) {
    return JSON.stringify({
      score: 86,
      reasons: [
        'They value direct communication and reliable follow-through.',
        'Their preferred pace and availability are compatible.',
        'They have a concrete low-pressure first activity in common.',
      ],
      flags: [],
      suggestedFirstActivity: 'Meet at the campus library cafe for thirty minutes.',
      oneLineReason: 'Compatible pace, candor, and a practical reason to meet.',
    });
  }
  if (request.model.includes('rerank')) {
    return JSON.stringify({ score: 0.82, rationale: 'Strong goal and communication fit.' });
  }
  if (request.model.includes('redaction')) {
    return JSON.stringify({ safe: true, redacted: lastMessage, uncertain: false, flags: [] });
  }
  if (request.model.includes('interview')) {
    return JSON.stringify({
      question: 'When a week goes well for you, what usually made the difference?',
      facts: [],
      complete: false,
    });
  }
  if (request.model.includes('draft')) {
    return 'Thanks for reaching out. I am interested; let me check the details before we set anything.';
  }
  return 'I care most about whether our users would genuinely work well together. What would a good first meeting look like for yours?';
};

export class OpenAiProvider implements LlmProvider {
  public readonly name = 'openai';

  public constructor(private readonly platformApiKey: string | undefined) {}

  public async complete(request: ProviderRequest): Promise<ProviderResponse> {
    const apiKey = request.apiKeyOverride ?? this.platformApiKey;
    if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');
    const client = new OpenAI({ apiKey });
    const result = await client.responses.create({
      model: request.model,
      input: request.messages.map((message) => ({
        role: message.role === 'system' ? 'developer' : message.role,
        content: message.content,
      })),
      max_output_tokens: request.constraints.maxOutputTokens,
      temperature: request.constraints.temperature,
    });
    return {
      text: result.output_text,
      tokensIn: result.usage?.input_tokens ?? estimateTokens(flattenMessages(request.messages)),
      tokensOut: result.usage?.output_tokens ?? estimateTokens(result.output_text),
    };
  }
}

/**
 * OpenRouter exposes an OpenAI-compatible chat-completions endpoint. Keeping it
 * as a separate provider makes model receipts and per-provider user keys
 * truthful instead of labelling OpenRouter traffic as OpenAI traffic.
 */
export class OpenRouterProvider implements LlmProvider {
  public readonly name = 'openrouter';

  public constructor(
    private readonly platformApiKey: string | undefined,
    private readonly options: {
      readonly baseUrl?: string;
      readonly httpReferer?: string;
      readonly appTitle?: string;
    } = {},
  ) {}

  public async complete(request: ProviderRequest): Promise<ProviderResponse> {
    const apiKey = request.apiKeyOverride ?? this.platformApiKey;
    if (!apiKey) throw new Error('OPENROUTER_API_KEY is not configured');
    const client = new OpenAI({
      apiKey,
      baseURL: this.options.baseUrl ?? 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        ...(this.options.httpReferer === undefined || this.options.httpReferer.length === 0
          ? {}
          : { 'HTTP-Referer': this.options.httpReferer }),
        ...(this.options.appTitle === undefined || this.options.appTitle.length === 0
          ? {}
          : { 'X-OpenRouter-Title': this.options.appTitle }),
      },
    });
    const result = await client.chat.completions.create({
      model: request.model,
      messages: request.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      max_tokens: request.constraints.maxOutputTokens,
      temperature: request.constraints.temperature,
      ...(request.constraints.jsonMode === true
        ? { response_format: { type: 'json_object' as const } }
        : {}),
    });
    const text = result.choices[0]?.message.content ?? '';
    return {
      text,
      tokensIn: result.usage?.prompt_tokens ?? estimateTokens(flattenMessages(request.messages)),
      tokensOut: result.usage?.completion_tokens ?? estimateTokens(text),
    };
  }
}

export class AnthropicProvider implements LlmProvider {
  public readonly name = 'anthropic';

  public constructor(private readonly platformApiKey: string | undefined) {}

  public async complete(request: ProviderRequest): Promise<ProviderResponse> {
    const apiKey = request.apiKeyOverride ?? this.platformApiKey;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured');
    const client = new Anthropic({ apiKey });
    const system = request.messages
      .filter((message) => message.role === 'system')
      .map((message) => message.content)
      .join('\n\n');
    const messages = request.messages
      .filter((message) => message.role !== 'system')
      .map((message) => ({ role: message.role, content: message.content }))
      .filter(
        (message): message is { role: 'user' | 'assistant'; content: string } =>
          message.role === 'user' || message.role === 'assistant',
      );
    const result = await client.messages.create({
      model: request.model,
      max_tokens: request.constraints.maxOutputTokens,
      temperature: request.constraints.temperature,
      system,
      messages,
    });
    const text = result.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n');
    return {
      text,
      tokensIn: result.usage.input_tokens,
      tokensOut: result.usage.output_tokens,
    };
  }
}

export class GoogleProvider implements LlmProvider {
  public readonly name = 'google';

  public constructor(private readonly platformApiKey: string | undefined) {}

  public async complete(request: ProviderRequest): Promise<ProviderResponse> {
    const apiKey = request.apiKeyOverride ?? this.platformApiKey;
    if (!apiKey) throw new Error('GOOGLE_GENERATIVE_AI_API_KEY is not configured');
    const client = new GoogleGenAI({ apiKey });
    const result = await client.models.generateContent({
      model: request.model,
      contents: flattenMessages(request.messages),
      config: {
        maxOutputTokens: request.constraints.maxOutputTokens,
        temperature: request.constraints.temperature,
        responseMimeType: request.constraints.jsonMode === true ? 'application/json' : 'text/plain',
      },
    });
    const text = result.text ?? '';
    return {
      text,
      tokensIn:
        result.usageMetadata?.promptTokenCount ?? estimateTokens(flattenMessages(request.messages)),
      tokensOut: result.usageMetadata?.candidatesTokenCount ?? estimateTokens(text),
    };
  }
}
