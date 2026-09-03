/**
 * Failure classification + signatures (plan §53, §55, §56).
 *
 * Two deterministic helpers built from failure EVIDENCE (not an AI guess):
 *
 *   classifyFailure()  → a standard category (BUILD_FAILURE, NETWORK_FAILURE, …)
 *                        so reports and the dashboard can speak clearly.
 *   failureSignature() → a normalized, stable fingerprint of a failure, so the
 *                        repair loop can tell "this is the SAME failure as
 *                        before" and stop re-applying a fix that isn't working.
 */
import type { FailureContext } from "./debugger/schema.js";

export type FailureCategory =
  | "BUILD_FAILURE"
  | "UNIT_TEST_FAILURE"
  | "STARTUP_FAILURE"
  | "BROWSER_FAILURE"
  | "NETWORK_FAILURE"
  | "DATABASE_FAILURE"
  | "ASSERTION_FAILURE"
  | "LOGIC_BUG"
  | "TIMEOUT"
  | "AI_FAILURE"
  | "SOLARI_FAILURE"
  | "UNKNOWN";

// Ordered rules: the FIRST pattern that matches the evidence wins.
const RULES: Array<{ re: RegExp; category: FailureCategory }> = [
  { re: /\b(sql|relation .* does not exist|ECONNREFUSED[^\n]*5432|pg_|postgres)\b/i, category: "DATABASE_FAILURE" },
  { re: /\b(EADDRINUSE|address already in use)\b/i, category: "STARTUP_FAILURE" },
  { re: /\b(never became healthy|did not start|failed to start|EACCES)\b/i, category: "STARTUP_FAILURE" },
  { re: /\b(ECONNREFUSED|ENOTFOUND|ECONNRESET|fetch failed|could not reach|network error)\b/i, category: "NETWORK_FAILURE" },
  { re: /\b(timed out|timeout|ETIMEDOUT)\b/i, category: "TIMEOUT" },
  { re: /\b(SyntaxError|Unexpected token|Unexpected end of|Cannot find module|MODULE_NOT_FOUND|Cannot use import statement|error TS\d+|Parsing error)\b/i, category: "BUILD_FAILURE" },
  { re: /\b(ReferenceError|is not defined|TypeError|is not a function|Cannot read propert|undefined is not|null is not an object)\b/i, category: "LOGIC_BUG" },
  { re: /\b(AssertionError|strictEqual|deepEqual|expected status|body missing|to equal|to be|expected .* (to|but))\b/i, category: "ASSERTION_FAILURE" },
];

/** Classify a failure into a standard category from its evidence (§53). */
export function classifyFailure(f: FailureContext): FailureCategory {
  const text = [f.summary, f.details, f.expected, f.actual]
    .filter(Boolean)
    .join("\n");

  for (const rule of RULES) {
    if (rule.re.test(text)) return rule.category;
  }
  // Fall back to the failure's source when no pattern matched.
  switch (f.kind) {
    case "browser_qa":
      return "BROWSER_FAILURE";
    case "unit_test":
      return "UNIT_TEST_FAILURE";
    case "runtime":
      return "LOGIC_BUG";
    default:
      return "UNKNOWN";
  }
}

// FNV-1a: a tiny, dependency-free, stable string hash → 8 hex chars.
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

// Replace a path with just its basename (drop volatile directories/drives).
function baseName(p: string): string {
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1] || p;
}

/** Strip the volatile bits (numbers, hex, paths, quotes) so equal failures match. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/(?:[a-z]:)?[\\/][^\s'"()]+/g, baseName) // paths → basename
    .replace(/0x[0-9a-f]+/g, "#") // hex
    .replace(/\b\d+\b/g, "#") // numbers
    .replace(/['"`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// The most informative line of the evidence (an error/assert line if present).
function keyLine(details: string): string {
  const lines = details.split("\n").map((l) => l.trim()).filter(Boolean);
  const errish = lines.find((l) =>
    /(error|assert|expected|fail|exception|not found|missing|refused|timeout|cannot)/i.test(l),
  );
  return errish ?? lines[0] ?? "";
}

/**
 * A stable fingerprint of a failure: category + normalized key line + file.
 * Two failures that are "the same problem" (differing only in numbers/paths)
 * produce the SAME signature.
 */
export function failureSignature(f: FailureContext): string {
  const category = classifyFailure(f);
  const file = f.relevantFiles?.[0] ? baseName(f.relevantFiles[0]) : "";
  const basis = normalize(`${keyLine(f.details)} ${file}`);
  return `${category}:${fnv1a(basis)}`;
}
