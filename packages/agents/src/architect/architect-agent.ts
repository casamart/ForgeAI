/**
 * The Architect Agent.
 *
 * Simplest agent in ForgeAI: it makes ONE AI call that returns a structured
 * plan, validated against ArchitectPlanSchema (with automatic repair if the
 * first JSON is invalid). No sandbox, no browser — planning only (AGENTS §3).
 */
import type { AIProvider, ChatMessage } from "@forgeai/ai";
import type { EventBus, Logger } from "@forgeai/shared";
import {
  ArchitectPlanSchema,
  ARCHITECT_PLAN_HINT,
  type ArchitectPlan,
} from "./schema.js";
import { ARCHITECT_SYSTEM_PROMPT } from "./prompt.js";

// The Architect only needs to talk and report — not a full sandbox context.
export interface ArchitectContext {
  ai: AIProvider;
  bus: EventBus;
  logger: Logger;
}

export interface ArchitectResult {
  plan: ArchitectPlan;
  /** How many AI calls it took to get a valid plan (1 = valid first try). */
  attempts: number;
}

export class ArchitectAgent {
  constructor(private ctx: ArchitectContext) {}

  async plan(requirement: string): Promise<ArchitectResult> {
    const { ai, bus, logger } = this.ctx;

    bus.emit("agent.started", "Architect agent started", { agent: "architect" });
    logger.step("Architect agent planning…");

    const messages: ChatMessage[] = [
      { role: "system", content: ARCHITECT_SYSTEM_PROMPT },
      { role: "user", content: `Requirement:\n${requirement}` },
    ];

    const { data: plan, attempts } = await ai.structuredOutput(
      messages,
      ArchitectPlanSchema,
      { schemaHint: ARCHITECT_PLAN_HINT, maxTokens: 4096 },
    );

    bus.emit("agent.finished", "Architect agent produced a plan", {
      agent: "architect",
      tasks: plan.tasks.length,
      tests: plan.testPlan.length,
    });
    logger.success(
      `Plan ready: ${plan.tasks.length} tasks, ${plan.testPlan.length} test cases.`,
    );

    return { plan, attempts };
  }
}
