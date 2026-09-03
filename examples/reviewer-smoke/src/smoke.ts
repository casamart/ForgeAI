/**
 * ForgeAI — Reviewer Agent smoke test.
 *
 * Proves two things (no API key; scripted mock):
 *   1. On clean evidence the Reviewer returns PASS and renders the final
 *      engineering report.
 *   2. The deterministic verdict OVERRIDES an over-optimistic AI: even when the
 *      AI marks every criterion "met", a failing unit test forces status=failed.
 *      (Evidence over claims.)
 */
import {
  ReviewerAgent,
  renderFinalReport,
  type ReviewInput,
} from "@forgeai/agents";
import { MockProvider } from "@forgeai/ai";
import { EventBus, Logger } from "@forgeai/shared";

// The AI assessment marks BOTH acceptance criteria as met. We reuse it for both
// scenarios to show the derived verdict — not the AI — decides pass/fail.
const ASSESSMENT_ALL_MET = JSON.stringify({
  criteria: [
    {
      criterion: "A worker's rating equals the average of its ratings.",
      met: true,
      justification: "/workers returns averageRating 4.25",
    },
    {
      criterion: "The rating logic is covered by a passing test.",
      met: true,
      justification: "unit tests all passed",
    },
  ],
  knownIssues: [],
  summary: "All acceptance criteria appear satisfied by the evidence.",
});

const CRITERIA = [
  "A worker's rating equals the average of its ratings.",
  "The rating logic is covered by a passing test.",
];

async function main(): Promise<number> {
  const line = "─".repeat(60);
  const bus = new EventBus();
  const logger = new Logger({ scope: "rev-smoke", bus });

  // The mock returns the same "all met" assessment for all review() calls.
  const ai = MockProvider.fromReplies([ASSESSMENT_ALL_MET, ASSESSMENT_ALL_MET, ASSESSMENT_ALL_MET]);
  const reviewer = new ReviewerAgent({ ai, bus, logger });

  // Scenario 1: clean evidence -> should PASS.
  const cleanInput: ReviewInput = {
    requirement: "Worker marketplace rating API",
    acceptanceCriteria: CRITERIA,
    unitTests: { passed: 3, failed: 0 },
    browserTests: { passed: 2, failed: 0, blocked: 0, inconclusive: 0 },
    openBugs: [],
    buildOk: true,
  };
  const clean = await reviewer.review(cleanInput);

  // Scenario 2: a unit test failed -> must FAIL, even though the AI says met.
  const failingInput: ReviewInput = {
    ...cleanInput,
    unitTests: { passed: 2, failed: 1 },
  };
  const failing = await reviewer.review(failingInput);

  // Scenario 3: the app couldn't be exercised at all → BLOCKED (§13), even
  // though the AI marks the criteria met.
  const blockedInput: ReviewInput = {
    ...cleanInput,
    unitTests: { passed: 0, failed: 0 },
    browserTests: { passed: 0, failed: 0, blocked: 2, inconclusive: 0 },
  };
  const blocked = await reviewer.review(blockedInput);

  // Show the rendered report for the clean run.
  console.log("\n" + renderFinalReport(clean, {
    projectName: "Worker Marketplace API",
    infraMode: "local",
    filesCreated: 5,
    bugsDiscovered: 1,
    bugsFixed: 1,
    previewUrl: "http://127.0.0.1:3000",
    durationMs: 42000,
  }));

  const checks = [
    { name: "clean evidence -> PASS", passed: clean.status === "passed", evidence: `status=${clean.status}` },
    { name: "clean requirements 100%", passed: clean.requirementsSatisfied === 1, evidence: `${Math.round(clean.requirementsSatisfied * 100)}%` },
    { name: "failing test -> FAIL (gate overrides AI)", passed: failing.status === "failed", evidence: `status=${failing.status} (AI marked all met)` },
    { name: "unreachable app -> BLOCKED (not pass/fail)", passed: blocked.status === "blocked", evidence: `status=${blocked.status} (QA all-blocked)` },
  ];
  const passed = checks.filter((c) => c.passed).length;
  const allPass = passed === checks.length;

  console.log(`\n${line}`);
  console.log("  FORGEAI — REVIEWER AGENT SMOKE TEST");
  console.log(line);
  for (const c of checks) {
    console.log(`  ${c.passed ? "✓ PASS" : "✗ FAIL"}  ${c.name}`);
    console.log(`         evidence: ${c.evidence}`);
  }
  console.log(line);
  console.log(`  RESULT: ${allPass ? "✅ PASS" : "❌ FAIL"} (${passed}/${checks.length})`);
  console.log(`${line}\n`);
  return allPass ? 0 : 1;
}

main().then((code) => process.exit(code));
