/**
 * The Reviewer compares what was built against what was asked, using the
 * collected EVIDENCE (test counts, QA report, open bugs, build status).
 *
 * Split of responsibility:
 *   - The AI produces the qualitative assessment: which acceptance criteria are
 *     met, a summary, and known issues.
 *   - ForgeAI derives the final PASS/FAIL verdict deterministically from the
 *     numbers (see reviewer-agent.ts) so a model can never claim success that
 *     the evidence does not support.
 */
import { z } from "zod";

// The evidence handed to the Reviewer.
export interface ReviewInput {
  requirement: string;
  acceptanceCriteria: string[];
  unitTests: { passed: number; failed: number };
  browserTests: {
    passed: number;
    failed: number;
    blocked: number;
    inconclusive: number;
  };
  openBugs: { id: string; title: string; severity: string }[];
  buildOk: boolean;
}

// The AI's qualitative assessment (NOT the final verdict).
export const ReviewAssessmentSchema = z.object({
  criteria: z
    .array(
      z.object({
        criterion: z.string(),
        met: z.boolean(),
        justification: z.string(),
      }),
    )
    .describe("One entry per acceptance criterion."),
  knownIssues: z.array(z.string()),
  summary: z.string().describe("Short overall assessment."),
});

export type ReviewAssessment = z.infer<typeof ReviewAssessmentSchema>;

export const REVIEW_ASSESSMENT_HINT =
  '{"criteria":[{"criterion","met":bool,"justification"}],' +
  '"knownIssues":[..],"summary"}';

export type ReviewStatus = "passed" | "partial" | "failed" | "blocked";

// The Reviewer's full result: AI assessment + our derived verdict + the numbers.
export interface ReviewResult {
  status: ReviewStatus;
  /** Fraction of acceptance criteria the AI marked as met (0..1). */
  requirementsSatisfied: number;
  unitTests: ReviewInput["unitTests"];
  browserTests: ReviewInput["browserTests"];
  openBugs: ReviewInput["openBugs"];
  buildOk: boolean;
  criteria: ReviewAssessment["criteria"];
  knownIssues: string[];
  summary: string;
}
