/**
 * Google Gemini provider, using the @google/genai SDK.
 *
 * Gemini uses slightly different words than the others:
 *   - our "assistant" role is called "model"
 *   - the system prompt is passed as "systemInstruction"
 *   - a message's text lives inside a "parts" array
 * The two small helpers below translate our simple messages into that shape.
 */
import { BaseProvider } from "../base.js";
import {
  AIProviderError,
  ChatMessage,
  GenerateOptions,
  GenerateResult,
} from "../types.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";

// Turn our system/user/assistant messages into Gemini's "contents" + system.
function toGemini(messages: ChatMessage[], system?: string) {
  const systemParts: string[] = [];
  if (system) systemParts.push(system);

  const contents: { role: "user" | "model"; parts: { text: string }[] }[] = [];
  for (const m of messages) {
    if (m.role === "system") {
      systemParts.push(m.content);
      continue;
    }
    contents.push({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    });
  }
  return {
    contents,
    systemInstruction: systemParts.join("\n\n") || undefined,
  };
}

export class GeminiProvider extends BaseProvider {
  readonly name = "gemini" as const;
  readonly defaultModel = DEFAULT_MODEL;

  private client: any;
  private apiKey: string | undefined;

  constructor(apiKey = process.env.GEMINI_API_KEY) {
    super();
    this.apiKey = apiKey;
  }

  // Load the Gemini SDK on first use.
  private async getClient(): Promise<any> {
    if (this.client) return this.client;
    if (!this.apiKey) {
      throw new AIProviderError("GEMINI_API_KEY is not set.", this.name);
    }
    const mod: any = await import("@google/genai");
    const GoogleGenAI = mod.GoogleGenAI ?? mod.default ?? mod;
    this.client = new GoogleGenAI({ apiKey: this.apiKey });
    return this.client;
  }

  async generate(
    messages: ChatMessage[],
    opts: GenerateOptions = {},
  ): Promise<GenerateResult> {
    const client = await this.getClient();
    const { contents, systemInstruction } = toGemini(messages, opts.system);
    try {
      const resp = await client.models.generateContent({
        model: opts.model ?? this.defaultModel,
        contents,
        config: {
          systemInstruction,
          maxOutputTokens: opts.maxTokens ?? 4096,
          temperature: opts.temperature,
        },
      });
      // Newer SDKs expose `resp.text`; fall back to digging it out if needed.
      const text =
        resp.text ??
        resp.candidates?.[0]?.content?.parts
          ?.map((p: any) => p.text ?? "")
          .join("") ??
        "";
      return {
        text,
        model: opts.model ?? this.defaultModel,
        provider: this.name,
        usage: {
          inputTokens: resp.usageMetadata?.promptTokenCount,
          outputTokens: resp.usageMetadata?.candidatesTokenCount,
        },
        finishReason: resp.candidates?.[0]?.finishReason,
      };
    } catch (err) {
      throw new AIProviderError("Gemini request failed.", this.name, err);
    }
  }

  async *stream(
    messages: ChatMessage[],
    opts: GenerateOptions = {},
  ): AsyncIterable<string> {
    const client = await this.getClient();
    const { contents, systemInstruction } = toGemini(messages, opts.system);
    const stream = await client.models.generateContentStream({
      model: opts.model ?? this.defaultModel,
      contents,
      config: {
        systemInstruction,
        maxOutputTokens: opts.maxTokens ?? 4096,
        temperature: opts.temperature,
      },
    });
    for await (const chunk of stream) {
      if (chunk.text) yield chunk.text as string;
    }
  }
}
