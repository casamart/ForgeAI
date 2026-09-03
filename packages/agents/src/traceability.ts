/**
 * Requirement traceability (plan §14, §57).
 *
 * ForgeAI's strongest story is being able to draw a line from a requirement all
 * the way to the evidence that proves it:
 *
 *     Acceptance criterion → QA check → verdict → bug → repair → evidence
 *
 * This module builds that mapping DETERMINISTICALLY from the QA report (not from
 * an AI opinion). Acceptance criteria arrive as plain strings from the Architect;
 * we assign them stable ids (AC-001, …) so everything else can reference them.
 */
import type { Bug, QAReport, QAVerdict } from "./qa/schema.js";

export interface AcceptanceCriterion {
  id: string;
  text: string;
}

export type ACStatus = "passed" | "failed" | "unverified";

/** A bug that was open before a repair and is gone after it. */
export type ResolvedBug = Pick<Bug, "id" | "acceptanceCriteriaId">;

export interface TraceRow {
  criterion: AcceptanceCriterion;
  status: ACStatus;
  /** QA checks linked to this criterion. */
  checkIds: string[];
  verdicts: QAVerdict[];
  /** Bugs still open against this criterion. */
  openBugIds: string[];
  /** Bugs that were found against this criterion and fixed by the repair loop. */
  resolvedBugIds: string[];
  /** True when a bug was found for this criterion and the criterion now passes. */
  repaired: boolean;
  /** Short human-readable proof references. */
  evidence: string[];
}

/** Give each acceptance-criterion string a stable id: AC-001, AC-002, … */
export function assignCriteriaIds(texts: string[]): AcceptanceCriterion[] {
  return texts.map((text, i) => ({
    id: `AC-${String(i + 1).padStart(3, "0")}`,
    text,
  }));
}

export interface TraceabilityInput {
  criteria: AcceptanceCriterion[];
  qaReport?: QAReport;
  /** Bugs resolved by the repair loop during this run. */
  resolvedBugs?: ResolvedBug[];
}

/** Build one trace row per acceptance criterion from real QA evidence. */
export function buildTraceability(input: TraceabilityInput): TraceRow[] {
  const results = input.qaReport?.results ?? [];
  const openBugs = input.qaReport?.bugs ?? [];
  const resolved = input.resolvedBugs ?? [];

  return input.criteria.map((criterion) => {
    const linked = results.filter(
      (r) => r.check.acceptanceCriteriaId === criterion.id,
    );
    const verdicts = linked.map((r) => r.verdict);
    const openBugIds = openBugs
      .filter((b) => b.acceptanceCriteriaId === criterion.id)
      .map((b) => b.id);
    const resolvedBugIds = resolved
      .filter((b) => b.acceptanceCriteriaId === criterion.id)
      .map((b) => b.id);

    let status: ACStatus;
    if (linked.length === 0) {
      status = "unverified"; // no QA check exercises this criterion
    } else if (verdicts.some((v) => v === "FAIL" || v === "BLOCKED")) {
      status = "failed";
    } else if (verdicts.some((v) => v === "PASS") && !verdicts.includes("INCONCLUSIVE")) {
      status = "passed";
    } else {
      status = "unverified"; // only inconclusive results — honestly not a pass
    }

    const evidence: string[] = [
      ...linked.map((r) => `${r.check.id} ${r.verdict}`),
      ...resolvedBugIds.map((id) => `${id} resolved by repair`),
      ...openBugIds.map((id) => `${id} OPEN`),
    ];

    return {
      criterion,
      status,
      checkIds: linked.map((r) => r.check.id),
      verdicts,
      openBugIds,
      resolvedBugIds,
      repaired: resolvedBugIds.length > 0 && status === "passed",
      evidence,
    };
  });
}

function badge(status: ACStatus, repaired: boolean): string {
  if (status === "passed") return repaired ? "✓ PASS (repaired)" : "✓ PASS";
  if (status === "failed") return "✗ FAIL";
  return "○ UNVERIFIED";
}

/** Render the traceability matrix as plain text for the engineering report. */
export function renderTraceabilityMatrix(rows: TraceRow[]): string {
  const line = "─".repeat(62);
  const out: string[] = [
    line,
    "  REQUIREMENT TRACEABILITY  (criterion → test → bug → repair)",
    line,
  ];
  for (const row of rows) {
    const text =
      row.criterion.text.length > 52
        ? row.criterion.text.slice(0, 49) + "…"
        : row.criterion.text;
    out.push(`  ${row.criterion.id}  ${badge(row.status, row.repaired)}`);
    out.push(`      ${text}`);
    if (row.evidence.length) {
      out.push(`      evidence: ${row.evidence.join(" · ")}`);
    } else {
      out.push(`      evidence: (no QA check linked to this criterion)`);
    }
  }
  out.push(line);
  return out.join("\n");
}

/** Convenience counts for the summary line / dashboard. */
export function traceabilitySummary(rows: TraceRow[]): {
  passed: number;
  failed: number;
  unverified: number;
  repaired: number;
  total: number;
} {
  return {
    passed: rows.filter((r) => r.status === "passed").length,
    failed: rows.filter((r) => r.status === "failed").length,
    unverified: rows.filter((r) => r.status === "unverified").length,
    repaired: rows.filter((r) => r.repaired).length,
    total: rows.length,
  };
}
