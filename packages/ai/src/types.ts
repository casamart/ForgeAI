/**
 * Provider-agnostic AI interface (ARCHITECTURE §17).
 *
 * Agents depend ONLY on `AIProvider`; the concrete provider (Anthropic /
 * OpenAI / Gemini / mock) is chosen once by the factory. This keeps ForgeAI
 * from being welded to a single model vendor.
 */
import type { ZodType } from "zod";
import type { AiProvider } from "@forgeai/shared";

export type Role = "system" | "user" | "assistant";

export interface ChatMessage {
  role: Role;
  content: string;
}

export interface GenerateOptions {
  /** System prompt. Providers that separate it will; others prepend it. */
  system?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  /** Abort the request after this many ms. */
  timeoutMs?: number;
  /** Optional cooperative cancellation. */
  signal?: AbortSignal;
}

export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
}

export interface GenerateResult {
  text: string;
  model: string;
  provider: AiProvider;
  usage?: TokenUsage;
  finishReason?: string;
}

export interface StructuredResult<T> {
  data: T;
  raw: string;
  model: string;
  provider: AiProvider;
  usage?: TokenUsage;
  /** How many generate calls it took (1 = valid first try). */
  attempts: number;
}

export interface StructuredOptions extends GenerateOptions {
  /** Max attempts to get schema-valid JSON before throwing (AGENTS §17). */
  maxRepairs?: number;
  /** Human-readable description of the schema, injected into the prompt. */
  schemaHint?: string;
}

export interface AIProvider {
  readonly name: AiProvider;
  /** The model this instance will use unless overridden per call. */
  readonly defaultModel: string;

  /** One-shot completion. */
  generate(
    messages: ChatMessage[],
    opts?: GenerateOptions,
  ): Promise<GenerateResult>;

  /** Streaming completion: yields text deltas as they arrive. */
  stream(
    messages: ChatMessage[],
    opts?: GenerateOptions,
  ): AsyncIterable<string>;

  /**
   * Generate output validated against a Zod schema, with automatic
   * repair-retries when the model returns invalid JSON.
   */
  structuredOutput<T>(
    messages: ChatMessage[],
    schema: ZodType<T>,
    opts?: StructuredOptions,
  ): Promise<StructuredResult<T>>;
}

export class AIProviderError extends Error {
  // The original error thrown by the underlying SDK, if any.
  readonly original?: unknown;

  constructor(
    message: string,
    readonly provider: AiProvider,
    original?: unknown,
  ) {
    super(message);
    this.name = "AIProviderError";
    this.original = original;
  }
}

export class StructuredOutputError extends Error {
  constructor(
    message: string,
    readonly provider: AiProvider,
    readonly lastRaw: string,
    readonly attempts: number,
  ) {
    super(message);
    this.name = "StructuredOutputError";
  }
}
