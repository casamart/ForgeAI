/**
 * ForgeAI — Debugger + repair-loop smoke test.
 *
 * The star of the show: an autonomous fix. We plant a REAL bug, watch the test
 * fail, then let the repair loop (Debugger → Developer → re-verify) fix it and
 * prove the fix with a real passing test. No API key needed (scripted mocks).
 *
 * Success = the test failed at first, then the loop repaired it, and the FINAL
 * verification (run independently by us) passed.
 */
import {
  DebuggerAgent,
  DeveloperAgent,
  runRepairLoop,
  type FailureContext,
  type VerifyOutcome,
} from "@forgeai/agents";
import { MockProvider } from "@forgeai/ai";
import { createSolariProvider, type ISandbox } from "@forgeai/solari";
import { EventBus, Logger } from "@forgeai/shared";

const WORKSPACE = "/workspace/project";

// A BUGGY module: it returns the SUM, forgetting to divide by the count.
const BUGGY_AVERAGE =
  "export function average(nums) {\n" +
  "  // BUG: returns the sum, not the mean.\n" +
  "  return nums.reduce((a, b) => a + b, 0);\n" +
  "}\n";

// The CORRECT module the Developer will write during the fix.
const FIXED_AVERAGE =
  "export function average(nums) {\n" +
  "  if (nums.length === 0) return 0;\n" +
  "  return nums.reduce((a, b) => a + b, 0) / nums.length;\n" +
  "}\n";

const TEST =
  "import assert from 'node:assert';\n" +
  "import { average } from './average.mjs';\n" +
  "assert.strictEqual(average([5, 4, 5, 3]), 4.25);\n" +
  "console.log('TESTS PASSED');\n";

// The Debugger "AI" returns one diagnosis.
const SCRIPTED_DIAGNOSIS = JSON.stringify({
  rootCause:
    "average() returns the sum of the ratings and never divides by nums.length.",
  confidence: "high",
  filesToInspect: ["average.mjs"],
  fixInstruction:
    "In average.mjs, divide the sum by nums.length so average([5,4,5,3]) returns 4.25.",
  verification: "node test.mjs",
});

// The Developer "AI" applies the fix: rewrite the module, run the test, done.
const SCRIPTED_FIX_ACTIONS = [
  JSON.stringify({ tool: "writeFile", path: "average.mjs", content: FIXED_AVERAGE }),
  JSON.stringify({ tool: "run", command: "node test.mjs" }),
  JSON.stringify({ tool: "done", summary: "Divided the sum by the count." }),
];

// Run the test in the sandbox and report whether it passes right now.
async function runTest(sandbox: ISandbox): Promise<VerifyOutcome> {
  const res = await sandbox.runShell("node test.mjs", { cwd: WORKSPACE });
  const passed = res.exitCode === 0 && res.stdout.includes("TESTS PASSED");
  return {
    passed,
    evidence: `exit=${res.exitCode} ${passed ? "TESTS PASSED" : (res.stderr || res.stdout).trim().split("\n").slice(-2).join(" ")}`,
    failure: passed
      ? undefined
      : {
          kind: "unit_test",
          summary: "average() test failed",
          details: `${res.stdout}\n${res.stderr}`.trim(),
          expected: "4.25",
          relevantFiles: ["average.mjs", "test.mjs"],
        },
  };
}

async function main(): Promise<number> {
  const line = "─".repeat(60);
  const bus = new EventBus();
  const logger = new Logger({ scope: "dbg-smoke", bus });

  const { provider } = createSolariProvider("local");
  const sandbox = await provider.createSandbox();

  let initial: VerifyOutcome;
  let repair;
  let finalCheck: VerifyOutcome;
  try {
    // 1. Plant the bug + the test.
    await sandbox.writeFile(`${WORKSPACE}/average.mjs`, BUGGY_AVERAGE);
    await sandbox.writeFile(`${WORKSPACE}/test.mjs`, TEST);

    // 2. First run — should FAIL (proves the bug is real).
    initial = await runTest(sandbox);
    logger.error(`Initial test: ${initial.evidence}`);

    // 3. Repair loop: Debugger → Developer → re-verify.
    const debuggerAgent = new DebuggerAgent({
      ai: MockProvider.fromReplies([SCRIPTED_DIAGNOSIS]),
      bus,
      logger,
    });
    const developer = new DeveloperAgent({
      ai: MockProvider.fromReplies(SCRIPTED_FIX_ACTIONS),
      sandbox,
      bus,
      logger,
      workspace: WORKSPACE,
    });

    repair = await runRepairLoop({
      debuggerAgent,
      developer,
      failure: initial.failure as FailureContext,
      verify: () => runTest(sandbox),
      maxAttempts: 3,
      bus,
      logger,
    });

    // 4. Independent final check.
    finalCheck = await runTest(sandbox);
  } finally {
    await sandbox.destroy().catch(() => {});
    await provider.close().catch(() => {});
  }

  const checks = [
    { name: "bug is real (initial test failed)", passed: initial.passed === false, evidence: initial.evidence },
    { name: "repair loop reports repaired", passed: repair.repaired === true, evidence: `repaired=${repair.repaired} attempts=${repair.attempts}` },
    { name: "final test passes (verified)", passed: finalCheck.passed === true, evidence: finalCheck.evidence },
  ];
  const passed = checks.filter((c) => c.passed).length;
  const allPass = passed === checks.length;

  console.log(`\n${line}`);
  console.log("  FORGEAI — DEBUGGER / REPAIR-LOOP SMOKE TEST");
  console.log(line);
  console.log(`  Attempts    : ${repair.attempts}`);
  console.log(`  Diagnosis   : ${repair.diagnoses[0]?.rootCause ?? "—"}`);
  console.log(line);
  for (const c of checks) {
    console.log(`  ${c.passed ? "✓ PASS" : "✗ FAIL"}  ${c.name}`);
    console.log(`         evidence: ${c.evidence}`);
  }
  console.log(line);
  console.log(`  RESULT: ${allPass ? "✅ PASS — autonomous fix verified" : "❌ FAIL"} (${passed}/${checks.length})`);
  console.log(`${line}\n`);
  return allPass ? 0 : 1;
}

main().then((code) => process.exit(code));
