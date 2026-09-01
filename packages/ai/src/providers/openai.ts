/**
 * OpenAI provider. SDK loaded dynamically. System prompt is passed as a
 * leading system-role message (OpenAI's native shape).
 */
import { BaseProvider } from "../base.js";
import {
  AIProviderError,
  ChatMessage,
  GenerateOptions,
  GenerateResult,
} from "../types.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4o";

function toOpenAI(messages: ChatMessage[], system?: string) {
  const msgs: { role: string; content: string }[] = [];
  if (system) msgs.push({ role: "system", content: system });
  for (const m of messages) msgs.push({ role: m.role, content: m.content });
  return msgs;
}

export class OpenAIProvider extends BaseProvider {
  readonly name = "openai" as const;
  readonly defaultModel = DEFAULT_MODEL;

  // The real SDK client, created lazily on first use.
  private client: any;
  private apiKey: string | undefined;

  constructor(apiKey = process.env.OPENAI_API_KEY) {
    super();
    this.apiKey = apiKey;
  }

  // Load the OpenAI SDK on first use (kept out of the top-level imports so it
  // is only needed when OpenAI is the chosen provider).
  private async getClient(): Promise<any> {
    if (this.client) return this.client;
    if (!this.apiKey) {
      throw new AIProviderError("OPENAI_API_KEY is not set.", this.name);
    }
    const mod: any = await import("openai");
    const OpenAI = mod.default ?? mod.OpenAI ?? mod;
    this.client = new OpenAI({ apiKey: this.apiKey });
    return this.client;
  }

  async generate(
    messages: ChatMessage[],
    opts: GenerateOptions = {},
  ): Promise<GenerateResult> {
    const client = await this.getClient();
    try {
      const resp = await client.chat.completions.create(
        {
          model: opts.model ?? this.defaultModel,
          max_tokens: opts.maxTokens ?? 4096,
          temperature: opts.temperature,
          messages: toOpenAI(messages, opts.system),
        },
        { signal: opts.signal },
      );
      const choice = resp.choices?.[0];
      return {
        text: choice?.message?.content ?? "",
        model: resp.model ?? (opts.model ?? this.defaultModel),
        provider: this.name,
        usage: {
          inputTokens: resp.usage?.prompt_tokens,
          outputTokens: resp.usage?.completion_tokens,
        },
        finishReason: choice?.finish_reason,
      };
    } catch (err) {
      throw new AIProviderError("OpenAI request failed.", this.name, err);
    }
  }

  async *stream(
    messages: ChatMessage[],
    opts: GenerateOptions = {},
  ): AsyncIterable<string> {
    const client = await this.getClient();
    const stream = await client.chat.completions.create({
      model: opts.model ?? this.defaultModel,
      max_tokens: opts.maxTokens ?? 4096,
      temperature: opts.temperature,
      messages: toOpenAI(messages, opts.system),
      stream: true,
    });
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) yield delta as string;
    }
  }
}
