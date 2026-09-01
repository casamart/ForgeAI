/**
 * The Debugger looks at a FAILURE (a failing test, a QA bug, a crash) and
 * produces a DIAGNOSIS: what it thinks went wrong and a concrete instruction
 * the Developer agent can act on. It does not edit code itself — it delegates
 * the fix (AGENTS §6).
 */
import { z } from "zod";

// Everything the Debugger is told about a failure.
export interface FailureContext {
  /** Where the failure came from. */
  kind: "unit_test" | "browser_qa" | "runtime";
  /** Short one-line description of the failure. */
  summary: string;
  /** Raw evidence: test output, stack trace, logs, QA reason, etc. */
  details: string;
  /** Optional expected vs actual, when known. */
  expected?: string;
  actual?: string;
  /** Files that are probably relevant, so the Developer knows where to look. */
  relevantFiles?: string[];
}

// What the Debugger returns.
export const DiagnosisSchema = z.object({
  rootCause: z.string().describe("The most likely cause of the failure."),
  confidence: z.enum(["low", "medium", "high"]),
  filesToInspect: z
    .array(z.string())
    .describe("Files the Developer should read/change."),
  fixInstruction: z
    .string()
    .describe(
      "A concrete, focused instruction for the Developer agent to apply.",
    ),
  verification: z
    .string()
    .describe('How to confirm the fix, e.g. "run node test.mjs".'),
});

export type Diagnosis = z.infer<typeof DiagnosisSchema>;

export const DIAGNOSIS_HINT =
  '{"rootCause","confidence":"low|medium|high",' +
  '"filesToInspect":[..],"fixInstruction","verification"}';
