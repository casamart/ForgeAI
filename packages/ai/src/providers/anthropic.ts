/**
 * Anthropic (Claude) provider. SDK loaded dynamically so it is only required
 * when this provider is actually selected.
 */
import { BaseProvider } from "../base.js";
import {
  AIProviderError,
  ChatMessage,
  GenerateOptions,
  GenerateResult,
} from "../types.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

/** Split our system/user/assistant messages into Anthropic's shape. */
function toAnthropic(messages: ChatMessage[], system?: string) {
  const systemParts: string[] = [];
  if (system) systemParts.push(system);
  const msgs: { role: "user" | "assistant"; content: string }[] = [];
  for (const m of messages) {
    if (m.role === "system") systemParts.push(m.content);
    else msgs.push({ role: m.role, content: m.content });
  }
  return { system: systemParts.join("\n\n") || undefined, messages: msgs };
}

export class AnthropicProvider extends BaseProvider {
  readonly name = "anthropic" as const;
  readonly defaultModel = DEFAULT_MODEL;

  // The real SDK client. Created lazily the first time we need it (see below).
  private client: any;
  private apiKey: string | undefined;

  constructor(apiKey = process.env.ANTHROPIC_API_KEY) {
    super();
    this.apiKey = apiKey;
  }

  // Load the Anthropic SDK on first use. We import it here (not at the top of
  // the file) so ForgeAI can run without this package installed unless Claude
  // is the chosen provider.
  private async getClient(): Promise<any> {
    if (this.client) return this.client;
    if (!this.apiKey) {
      throw new AIProviderError("ANTHROPIC_API_KEY is not set.", this.name);
    }
    const mod: any = await import("@anthropic-ai/sdk");
    const Anthropic = mod.default ?? mod.Anthropic ?? mod;
    this.client = new Anthropic({ apiKey: this.apiKey });
    return this.client;
  }

  async generate(
    messages: ChatMessage[],
    opts: GenerateOptions = {},
  ): Promise<GenerateResult> {
    const client = await this.getClient();
    const { system, messages: msgs } = toAnthropic(messages, opts.system);
    try {
      const resp = await client.messages.create(
        {
          model: opts.model ?? this.defaultModel,
          max_tokens: opts.maxTokens ?? 4096,
          temperature: opts.temperature,
          system,
          messages: msgs,
        },
        { signal: opts.signal },
      );
      const text = (resp.content ?? [])
        .filter((b: any) => b.type === "text")
        .map((b: any) => b.text)
        .join("");
      return {
        text,
        model: resp.model ?? (opts.model ?? this.defaultModel),
        provider: this.name,
        usage: {
          inputTokens: resp.usage?.input_tokens,
          outputTokens: resp.usage?.output_tokens,
        },
        finishReason: resp.stop_reason,
      };
    } catch (err) {
      throw new AIProviderError("Anthropic request failed.", this.name, err);
    }
  }

  async *stream(
    messages: ChatMessage[],
    opts: GenerateOptions = {},
  ): AsyncIterable<string> {
    const client = await this.getClient();
    const { system, messages: msgs } = toAnthropic(messages, opts.system);
    const stream = await client.messages.stream({
      model: opts.model ?? this.defaultModel,
      max_tokens: opts.maxTokens ?? 4096,
      temperature: opts.temperature,
      system,
      messages: msgs,
    });
    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta?.type === "text_delta"
      ) {
        yield event.delta.text as string;
      }
    }
  }
}
