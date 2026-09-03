/**
 * The Reviewer Agent.
 *
 * Produces the final assessment. The AI judges each acceptance criterion, but
 * the overall PASS/PARTIAL/FAIL verdict is DERIVED from the evidence here, so
 * the verdict always matches the numbers (evidence over claims).
 */
import type { AIProvider, ChatMessage } from "@forgeai/ai";
import type { EventBus, Logger } from "@forgeai/shared";
import {
  ReviewAssessmentSchema,
  REVIEW_ASSESSMENT_HINT,
  type ReviewInput,
  type ReviewResult,
  type ReviewStatus,
} from "./schema.js";
import { REVIEWER_SYSTEM_PROMPT } from "./prompt.js";

export interface ReviewerContext {
  ai: AIProvider;
  bus: EventBus;
  logger: Logger;
}

// Turn the evidence into a compact text block for the model.
function describeEvidence(input: ReviewInput): string {
  const bugs = input.openBugs.length
    ? input.openBugs.map((b) => `${b.id} [${b.severity}] ${b.title}`).join("; ")
    : "none";
  return [
    `Requirement:\n${input.requirement}`,
    ``,
    `Acceptance criteria:`,
    ...input.acceptanceCriteria.map((c, i) => `  ${i + 1}. ${c}`),
    ``,
    `Evidence:`,
    `  Build ok: ${input.buildOk}`,
    `  Unit tests: ${input.unitTests.passed} passed, ${input.unitTests.failed} failed`,
    `  Browser QA: ${input.browserTests.passed} passed, ${input.browserTests.failed} failed, ` +
      `${input.browserTests.blocked} blocked, ${input.browserTests.inconclusive} inconclusive`,
    `  Open bugs: ${bugs}`,
  ].join("\n");
}

/**
 * Derive the final verdict from the hard evidence.
 * - FAIL if the build is broken, or a test/QA check actually FAILED.
 * - BLOCKED if we could not exercise the app at all (nothing was verified, or
 *   every QA check was blocked) — honestly "couldn't tell", not a pass or a
 *   plain fail (§13).
 * - PARTIAL if it basically works but has open bugs, inconclusive QA, or an
 *   unmet acceptance criterion.
 * - PASS only when everything checks out.
 */
function deriveStatus(
  input: ReviewInput,
  requirementsSatisfied: number,
): ReviewStatus {
  if (!input.buildOk) return "failed";

  const b = input.browserTests;
  const qaTotal = b.passed + b.failed + b.blocked + b.inconclusive;
  const nothingVerified =
    input.unitTests.passed + input.unitTests.failed === 0 && qaTotal === 0;
  const qaAllBlocked = qaTotal > 0 && b.passed === 0 && b.failed === 0 && b.blocked > 0;
  if (nothingVerified || qaAllBlocked) return "blocked";

  const hardFail =
    input.unitTests.failed > 0 || b.failed > 0 || b.blocked > 0;
  if (hardFail) return "failed";

  const soft =
    input.openBugs.length > 0 || b.inconclusive > 0 || requirementsSatisfied < 1;
  return soft ? "partial" : "passed";
}

export class ReviewerAgent {
  constructor(private ctx: ReviewerContext) {}

  async review(input: ReviewInput): Promise<ReviewResult> {
    const { ai, bus, logger } = this.ctx;

    bus.emit("review.started", "Reviewer started", { agent: "reviewer" });
    logger.step("Reviewer assessing against requirements…");

    const messages: ChatMessage[] = [
      { role: "system", content: REVIEWER_SYSTEM_PROMPT },
      { role: "user", content: describeEvidence(input) },
    ];

    const { data: assessment } = await ai.structuredOutput(
      messages,
      ReviewAssessmentSchema,
      { schemaHint: REVIEW_ASSESSMENT_HINT, maxTokens: 3072 },
    );

    // Fraction of criteria met — computed by us from the AI's per-item judgement.
    const total = assessment.criteria.length || 1;
    const met = assessment.criteria.filter((c) => c.met).length;
    const requirementsSatisfied = met / total;

    const status = deriveStatus(input, requirementsSatisfied);

    const result: ReviewResult = {
      status,
      requirementsSatisfied,
      unitTests: input.unitTests,
      browserTests: input.browserTests,
      openBugs: input.openBugs,
      buildOk: input.buildOk,
      criteria: assessment.criteria,
      knownIssues: assessment.knownIssues,
      summary: assessment.summary,
    };

    bus.emit("review.completed", `Review: ${status}`, {
      status,
      requirementsSatisfied,
    });
    (status === "passed" ? logger.success : logger.warn).call(
      logger,
      `Review verdict: ${status.toUpperCase()} ` +
        `(requirements ${Math.round(requirementsSatisfied * 100)}%)`,
    );
    return result;
  }
}
