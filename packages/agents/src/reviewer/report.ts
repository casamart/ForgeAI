/**
 * Renders the final "FORGEAI ENGINEERING REPORT" (spec §24) as plain text.
 *
 * It combines the Reviewer's verdict with run metadata the Orchestrator knows
 * (files created, bugs found/fixed, preview URL, duration). Kept as a pure
 * function so it is easy to test and to reuse in the API/dashboard.
 */
import type { ReviewResult } from "./schema.js";

export interface ReportMeta {
  projectName: string;
  filesCreated?: number;
  bugsDiscovered?: number;
  bugsFixed?: number;
  previewUrl?: string;
  durationMs?: number;
  infraMode?: "solari" | "local";
  /** Number of evidence artifacts collected this run (§42). */
  evidenceCount?: number;
}

function verdictBadge(status: ReviewResult["status"]): string {
  if (status === "passed") return "✅ PASS";
  if (status === "partial") return "⚠️  PARTIAL";
  if (status === "blocked") return "⛔ BLOCKED";
  return "❌ FAIL";
}

export function renderFinalReport(
  review: ReviewResult,
  meta: ReportMeta,
): string {
  const line = "═".repeat(62);
  const b = review.browserTests;
  const rows: string[] = [
    line,
    "  FORGEAI ENGINEERING REPORT",
    line,
    `  Project            : ${meta.projectName}`,
    meta.infraMode ? `  Infrastructure     : ${meta.infraMode}` : "",
    `  Verdict            : ${verdictBadge(review.status)}`,
    `  Requirements met   : ${Math.round(review.requirementsSatisfied * 100)}%`,
    `  Build              : ${review.buildOk ? "PASS" : "FAIL"}`,
    `  Unit tests         : ${review.unitTests.passed}/${review.unitTests.passed + review.unitTests.failed} passed`,
    `  Browser QA         : ${b.passed} passed, ${b.failed} failed, ${b.blocked} blocked, ${b.inconclusive} inconclusive`,
    meta.filesCreated !== undefined ? `  Files created      : ${meta.filesCreated}` : "",
    meta.bugsDiscovered !== undefined ? `  Bugs discovered    : ${meta.bugsDiscovered}` : "",
    meta.bugsFixed !== undefined ? `  Bugs fixed         : ${meta.bugsFixed}` : "",
    `  Open bugs          : ${review.openBugs.length}`,
    meta.evidenceCount !== undefined ? `  Evidence           : ${meta.evidenceCount} artifacts` : "",
    meta.previewUrl ? `  Preview            : ${meta.previewUrl}` : "",
    meta.durationMs !== undefined ? `  Duration           : ${(meta.durationMs / 1000).toFixed(1)}s` : "",
    line,
    "  Acceptance criteria:",
    ...review.criteria.map(
      (c) => `    ${c.met ? "✓" : "✗"} ${c.criterion}`,
    ),
  ];

  if (review.knownIssues.length) {
    rows.push(line, "  Known issues:");
    for (const issue of review.knownIssues) rows.push(`    • ${issue}`);
  }

  rows.push(line, `  Summary: ${review.summary}`, line);
  return rows.filter((r) => r !== "").join("\n");
}
