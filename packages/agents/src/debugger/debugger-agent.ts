/**
 * The Debugger Agent.
 *
 * One job: read a failure and return a structured Diagnosis (validated against
 * DiagnosisSchema, auto-repaired if the JSON is bad). It reasons only — the
 * Developer agent carries out the actual fix. The repair LOOP that ties the two
 * together lives in ../repair/repair-loop.ts.
 */
import type { AIProvider, ChatMessage } from "@forgeai/ai";
import type { EventBus, Logger } from "@forgeai/shared";
import {
  DiagnosisSchema,
  DIAGNOSIS_HINT,
  type Diagnosis,
  type FailureContext,
} from "./schema.js";
import { DEBUGGER_SYSTEM_PROMPT } from "./prompt.js";

export interface DebuggerContext {
  ai: AIProvider;
  bus: EventBus;
  logger: Logger;
}

// Turn a failure into a readable block of text for the model.
function describeFailure(f: FailureContext): string {
  const lines = [
    `Failure kind: ${f.kind}`,
    `Summary: ${f.summary}`,
    f.expected ? `Expected: ${f.expected}` : "",
    f.actual ? `Actual: ${f.actual}` : "",
    f.relevantFiles?.length
      ? `Relevant files: ${f.relevantFiles.join(", ")}`
      : "",
    "",
    "Evidence:",
    f.details,
  ];
  return lines.filter((l) => l !== "").join("\n");
}

export class DebuggerAgent {
  constructor(private ctx: DebuggerContext) {}

  async diagnose(failure: FailureContext): Promise<Diagnosis> {
    const { ai, bus, logger } = this.ctx;

    bus.emit("agent.started", "Debugger agent started", { agent: "debugger" });
    logger.step("Debugger analyzing failure…");

    const messages: ChatMessage[] = [
      { role: "system", content: DEBUGGER_SYSTEM_PROMPT },
      { role: "user", content: describeFailure(failure) },
    ];

    const { data: diagnosis } = await ai.structuredOutput(
      messages,
      DiagnosisSchema,
      { schemaHint: DIAGNOSIS_HINT, maxTokens: 2048 },
    );

    bus.emit("agent.finished", "Debugger produced a diagnosis", {
      agent: "debugger",
      confidence: diagnosis.confidence,
    });
    logger.info(
      `Diagnosis (${diagnosis.confidence}): ${diagnosis.rootCause}`,
    );
    return diagnosis;
  }
}
