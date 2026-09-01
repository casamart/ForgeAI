/**
 * Shared types for all ForgeAI agents.
 *
 * An agent never creates its own sandbox, AI client, or event bus — it receives
 * them in an `AgentContext`. This keeps agents easy to test (pass in a mock AI
 * and a local sandbox) and matches the "agents use tools, they don't own
 * infrastructure" rule (ARCHITECTURE §7).
 */
import type { AIProvider } from "@forgeai/ai";
import type { ISandbox } from "@forgeai/solari";
import type { EventBus, Logger } from "@forgeai/shared";

export interface AgentContext {
  /** The AI provider the agent reasons with (Claude / OpenAI / Gemini / mock). */
  ai: AIProvider;
  /** The isolated environment the agent works inside. */
  sandbox: ISandbox;
  /** Where events are published (drives the dashboard + final report). */
  bus: EventBus;
  /** Logger for human-readable progress. */
  logger: Logger;
  /** Absolute project root inside the sandbox, e.g. "/workspace/project". */
  workspace: string;
}
