/**
 * AI factory — the ONE place that decides which AI provider ForgeAI uses.
 * Everything else depends only on the AIProvider interface, so switching
 * from Claude to OpenAI to Gemini is a one-line config change.
 */
import type { AiProvider } from "@forgeai/shared";
import type { AIProvider } from "./types.js";
import { AnthropicProvider } from "./providers/anthropic.js";
import { OpenAIProvider } from "./providers/openai.js";
import { GeminiProvider } from "./providers/gemini.js";
import { MockProvider } from "./providers/mock.js";

/**
 * Create an AI provider by name.
 *
 * @param provider  "anthropic" | "openai" | "gemini" | "mock".
 *                   Defaults to the FORGEAI_AI_PROVIDER env var, then "mock".
 */
export function createAIProvider(
  provider: AiProvider = (process.env.FORGEAI_AI_PROVIDER as AiProvider) ||
    "mock",
): AIProvider {
  switch (provider) {
    case "anthropic":
      return new AnthropicProvider();
    case "openai":
      return new OpenAIProvider();
    case "gemini":
      return new GeminiProvider();
    case "mock":
      return new MockProvider();
    default:
      // Unknown value in config -> fail safe to the keyless mock.
      return new MockProvider();
  }
}
