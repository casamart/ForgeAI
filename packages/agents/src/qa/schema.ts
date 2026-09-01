/**
 * QA works from a list of concrete CHECKS. Each check says: open this path,
 * and here is what we expect to observe. The QA agent runs them in a real
 * browser and records evidence + a verdict for each.
 *
 * The four verdicts are deliberate (AGENTS §5): an "unknown" result must NEVER
 * be reported as PASS.
 */
import { z } from "zod";

// A single thing to verify on the running app.
export const QACheckSchema = z.object({
  id: z.string().describe('Stable id like "TC-001".'),
  description: z.string(),
  /** Path to open, relative to the preview URL, e.g. "/health". */
  path: z.string(),
  /** HTTP method. Only GET is testable via a browser navigation for now;
   *  anything else is reported INCONCLUSIVE. Defaults to GET when omitted. */
  method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]).optional(),
  /** If set, the HTTP status must equal this. */
  expectStatus: z.number().int().optional(),
  /** If set, the page body must contain every one of these strings. */
  expectBodyIncludes: z.array(z.string()).optional(),
  /** If true, needs a real DOM browser (clicks, JS). Skipped honestly if not. */
  requiresRealBrowser: z.boolean().optional(),
});

export type QACheck = z.infer<typeof QACheckSchema>;

// A list of checks (used when the AI derives checks from a prose test plan).
export const QAChecksSchema = z.array(QACheckSchema).min(1);

export type QAVerdict = "PASS" | "FAIL" | "BLOCKED" | "INCONCLUSIVE";

// A piece of proof attached to a result or bug.
export interface Evidence {
  type: "http" | "body" | "screenshot" | "note";
  value: string;
}

export interface QACheckResult {
  check: QACheck;
  verdict: QAVerdict;
  /** Why this verdict was reached. */
  reason: string;
  evidence: Evidence[];
}

export interface Bug {
  id: string;
  title: string;
  severity: "low" | "medium" | "high";
  description: string;
  evidence: Evidence[];
}

export interface QAReport {
  previewUrl: string;
  total: number;
  passed: number;
  failed: number;
  blocked: number;
  inconclusive: number;
  results: QACheckResult[];
  bugs: Bug[];
  /** True only if every check is PASS. */
  allPassed: boolean;
}

// Prompt hint for the AI when deriving checks from a prose test plan.
export const QA_CHECKS_HINT =
  '[{"id","description","path","method":"GET",' +
  '"expectStatus?","expectBodyIncludes?":[..],"requiresRealBrowser?":bool}]';
