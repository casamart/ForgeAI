/**
 * ForgeAI — failure classification + stalled-repair smoke test (§53/§55/§56).
 *
 * Two things proven, offline:
 *   A. classifyFailure() tags failures correctly, and failureSignature() gives
 *      the SAME fingerprint to failures that differ only in numbers/paths.
 *   B. When a "fix" never actually changes the failure, the repair loop detects
 *      the identical signature repeating and stops early with REPAIR_STALLED —
 *      it does NOT burn every attempt re-applying a fix that isn't working.
 */
import {
  DebuggerAgent,
  DeveloperAgent,
  runRepairLoop,
  classifyFailure,
  failureSignature,
  type FailureContext,
  type VerifyOutcome,
} from "@forgeai/agents";
import { MockProvider } from "@forgeai/ai";
import { createSolariProvider, type ISandbox } from "@forgeai/solari";
import { EventBus, Logger } from "@forgeai/shared";

const WORKSPACE = "/workspace/project";

// A rating module that is buggy — and STAYS buggy no matter how often we "fix"
// it, so every verification fails the same way.
const RATING_BUGGY =
  "export function average(nums){ return nums.reduce((a,b)=>a+b,0); }\n";
const RATING_TEST =
  "import test from 'node:test';\n" +
  "import assert from 'node:assert';\n" +
  "import { average } from './rating.mjs';\n" +
  "test('avg [5,4,5,3] = 4.25', () => assert.strictEqual(average([5,4,5,3]), 4.25));\n";

const DIAGNOSIS = JSON.stringify({
  rootCause: "average() returns the sum instead of the mean.",
  confidence: "high",
  filesToInspect: ["rating.mjs"],
  fixInstruction: "Divide the sum by nums.length.",
  verification: "node --test",
});

async function runTest(sandbox: ISandbox): Promise<VerifyOutcome> {
  const res = await sandbox.runShell("node --test", { cwd: WORKSPACE });
  const failed = /# fail [1-9]/.test(res.stdout) || res.exitCode !== 0;
  return {
    passed: !failed,
    evidence: `exit=${res.exitCode}`,
    failure: failed
      ? {
          kind: "unit_test",
          summary: "rating test failed",
          details: `${res.stdout}\n${res.stderr}`.trim(),
          expected: "4.25",
          relevantFiles: ["rating.mjs"],
        }
      : undefined,
  };
}

function partA(): { name: string; passed: boolean; evidence: string }[] {
  const f = (kind: FailureContext["kind"], details: string, files?: string[]): FailureContext =>
    ({ kind, summary: "", details, relevantFiles: files });

  const sigSameA = failureSignature(f("unit_test", "AssertionError expected 4.25 actual 17 at server.js:12", ["/ws/a/rating.mjs"]));
  const sigSameB = failureSignature(f("unit_test", "AssertionError expected 4.25 actual 99 at server.js:44", ["/other/rating.mjs"]));
  const sigDiff = failureSignature(f("runtime", "TypeError: x is not a function", ["rating.mjs"]));

  return [
    { name: "assertion → ASSERTION_FAILURE", passed: classifyFailure(f("unit_test", "AssertionError: strictEqual\nexpected 4.25")) === "ASSERTION_FAILURE", evidence: classifyFailure(f("unit_test", "AssertionError expected 4.25")) },
    { name: "unreachable → NETWORK_FAILURE", passed: classifyFailure(f("browser_qa", "Could not reach http://127.0.0.1:3000: fetch failed ECONNREFUSED")) === "NETWORK_FAILURE", evidence: classifyFailure(f("browser_qa", "ECONNREFUSED")) },
    { name: "syntax → BUILD_FAILURE", passed: classifyFailure(f("runtime", "SyntaxError: Unexpected token )")) === "BUILD_FAILURE", evidence: classifyFailure(f("runtime", "SyntaxError")) },
    { name: "unhealthy server → STARTUP_FAILURE", passed: classifyFailure(f("browser_qa", "Server never became healthy")) === "STARTUP_FAILURE", evidence: classifyFailure(f("browser_qa", "never became healthy")) },
    { name: "same-shape failures share a signature", passed: sigSameA === sigSameB, evidence: `${sigSameA} == ${sigSameB}` },
    { name: "different failures differ in signature", passed: sigDiff !== sigSameA, evidence: `${sigDiff} != ${sigSameA}` },
  ];
}

async function main(): Promise<number> {
  const line = "─".repeat(60);
  const bus = new EventBus();
  const logger = new Logger({ scope: "fail-smoke", bus });

  const { provider } = createSolariProvider("local");
  const sandbox = await provider.createSandbox();

  let repair;
  try {
    await sandbox.writeFile(`${WORKSPACE}/rating.mjs`, RATING_BUGGY);
    await sandbox.writeFile(`${WORKSPACE}/rating.test.mjs`, RATING_TEST);
    const initial = await runTest(sandbox);

    // Developer's "fix" writes the SAME buggy code every time → never helps.
    let n = 0;
    const devAI = new MockProvider({
      responder: () =>
        n++ % 2 === 0
          ? JSON.stringify({ tool: "writeFile", path: "rating.mjs", content: RATING_BUGGY })
          : JSON.stringify({ tool: "done", summary: "applied (still buggy)" }),
    });

    repair = await runRepairLoop({
      debuggerAgent: new DebuggerAgent({ ai: MockProvider.fromReplies([DIAGNOSIS]), bus, logger }),
      developer: new DeveloperAgent({ ai: devAI, sandbox, bus, logger, workspace: WORKSPACE }),
      failure: initial.failure as FailureContext,
      verify: () => runTest(sandbox),
      maxAttempts: 3,
      stallLimit: 2,
      bus,
      logger,
    });
  } finally {
    await sandbox.destroy().catch(() => {});
    await provider.close().catch(() => {});
  }

  const allSameSig = repair.signatures.every((s) => s === repair.signatures[0]);
  const checks = [
    ...partA(),
    { name: "stalled repair: repaired=false", passed: repair.repaired === false, evidence: `repaired=${repair.repaired}` },
    { name: "stalled repair: stopReason=stalled", passed: repair.stopReason === "stalled", evidence: `stopReason=${repair.stopReason}` },
    { name: "stopped EARLY (before maxAttempts=3)", passed: repair.attempts < 3, evidence: `attempts=${repair.attempts}` },
    { name: "identical signature each attempt", passed: allSameSig && repair.signatures.length >= 2, evidence: `${repair.signatures.join(" ")}` },
    { name: "failure classified", passed: ["ASSERTION_FAILURE", "UNIT_TEST_FAILURE"].includes(repair.category), evidence: `category=${repair.category}` },
  ];
  const passed = checks.filter((c) => c.passed).length;
  const allPass = passed === checks.length;

  console.log(`\n${line}`);
  console.log("  FORGEAI — FAILURE CLASSIFICATION & STALLED-REPAIR");
  console.log(line);
  for (const c of checks) {
    console.log(`  ${c.passed ? "✓ PASS" : "✗ FAIL"}  ${c.name}`);
    console.log(`         evidence: ${c.evidence}`);
  }
  console.log(line);
  console.log(`  RESULT: ${allPass ? "✅ PASS — failures classified; stalled repair stopped early" : "❌ FAIL"} (${passed}/${checks.length})`);
  console.log(`${line}\n`);
  return allPass ? 0 : 1;
}

main().then((code) => process.exit(code));
