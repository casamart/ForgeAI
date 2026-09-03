/**
 * The Evidence model (plan §15, §16).
 *
 * ForgeAI's core principle is "evidence over claims". This makes evidence a
 * first-class, immutable artifact: every piece carries a type, a source, a
 * timestamp, and a content HASH so a report can say "this PASS is backed by
 * these concrete artifacts" and nobody can quietly change them afterwards.
 */
import type { QAReport } from "./qa/schema.js";

export type EvidenceType =
  | "SCREENSHOT"
  | "VIDEO"
  | "LOG"
  | "TEST_OUTPUT"
  | "HTTP_RESPONSE"
  | "BROWSER_EVENT"
  | "CONSOLE_ERROR"
  | "NETWORK_ERROR"
  | "FILE"
  | "DIFF"
  | "COMMAND_OUTPUT"
  | "DATABASE_RESULT";

export interface EvidenceItem {
  id: string;
  runId?: string;
  type: EvidenceType;
  title: string;
  description?: string;
  /** Which component produced it: "qa", "developer", "orchestrator", … */
  source: string;
  /** ISO timestamp of creation. */
  timestamp: string;
  /** The evidence content (text). Truncated for large payloads. */
  content: string;
  /** A file path, when the evidence is a saved artifact (e.g. a screenshot). */
  path?: string;
  /** Content hash for integrity (§16). */
  hash: string;
  relatedCheckId?: string;
  relatedCriteriaId?: string;
  metadata?: Record<string, unknown>;
}

export type EvidenceInput = Omit<EvidenceItem, "id" | "timestamp" | "hash"> & {
  id?: string;
  timestamp?: string;
};

// FNV-1a → 8 hex chars. No dependencies; stable across runs for equal content.
function hashStr(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

const MAX_CONTENT = 4000;

/**
 * Create one immutable evidence item. The hash covers type + content, so any
 * later change to the content would change the hash (tamper-evident, §16).
 */
export function createEvidence(input: EvidenceInput): EvidenceItem {
  const content = (input.content ?? "").slice(0, MAX_CONTENT);
  const hash = hashStr(`${input.type}\n${content}`);
  return Object.freeze({
    id: input.id ?? `EV-${hash}`,
    runId: input.runId,
    type: input.type,
    title: input.title,
    description: input.description,
    source: input.source,
    timestamp: input.timestamp ?? new Date().toISOString(),
    content,
    path: input.path,
    hash,
    relatedCheckId: input.relatedCheckId,
    relatedCriteriaId: input.relatedCriteriaId,
    metadata: input.metadata,
  });
}

/**
 * An append-only collection of evidence for one run. De-duplicates by hash, so
 * the same artifact recorded twice is stored once.
 */
export class EvidenceLog {
  private items: EvidenceItem[] = [];

  constructor(private runId?: string) {}

  add(input: EvidenceInput): EvidenceItem {
    const content = (input.content ?? "").slice(0, MAX_CONTENT);
    const hash = hashStr(`${input.type}\n${content}`);
    const existing = this.items.find((i) => i.hash === hash);
    if (existing) return existing;

    const item = createEvidence({
      ...input,
      id: `EV-${String(this.items.length + 1).padStart(3, "0")}`,
      runId: input.runId ?? this.runId,
    });
    this.items.push(item);
    return item;
  }

  all(): EvidenceItem[] {
    return [...this.items];
  }

  count(): number {
    return this.items.length;
  }

  countByType(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const i of this.items) out[i.type] = (out[i.type] ?? 0) + 1;
    return out;
  }
}

// Map the QA report's lightweight evidence onto rich, hashed EvidenceItems.
export function collectQAEvidence(qa: QAReport, runId?: string): EvidenceItem[] {
  const out: EvidenceItem[] = [];

  for (const r of qa.results) {
    // One HTTP_RESPONSE item summarising the check + its captured evidence.
    out.push(
      createEvidence({
        runId,
        type: "HTTP_RESPONSE",
        title: `${r.check.id} ${r.verdict}`,
        description: r.reason,
        source: "qa",
        content: r.evidence.map((e) => `${e.type}: ${e.value}`).join("\n"),
        relatedCheckId: r.check.id,
        relatedCriteriaId: r.check.acceptanceCriteriaId,
        metadata: { verdict: r.verdict },
      }),
    );
    // Any screenshots become their own SCREENSHOT items.
    for (const e of r.evidence) {
      if (e.type === "screenshot") {
        out.push(
          createEvidence({
            runId,
            type: "SCREENSHOT",
            title: `${r.check.id} screenshot`,
            source: "qa",
            content: e.value,
            path: e.value,
            relatedCheckId: r.check.id,
          }),
        );
      }
    }
  }

  for (const bug of qa.bugs) {
    out.push(
      createEvidence({
        runId,
        type: "CONSOLE_ERROR",
        title: bug.id,
        description: bug.title,
        source: "qa",
        content: bug.description,
        relatedCheckId: bug.checkId,
        relatedCriteriaId: bug.acceptanceCriteriaId,
        metadata: { severity: bug.severity },
      }),
    );
  }

  return out;
}
