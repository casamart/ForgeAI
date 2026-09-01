/**
 * ForgeAI — Developer Agent smoke test.
 *
 * Proves the Developer Agent's observe→act→observe loop end-to-end against a
 * REAL (local) sandbox, with NO API key. We use MockProvider.fromReplies to
 * script the AI's actions so the run is fully deterministic. With a real
 * provider (Claude/OpenAI/Gemini) the exact same agent code reasons on its own.
 *
 * The scripted plan: write a module, write a test, run the test, finish.
 * Success = the agent completed AND the test actually passed (exit code 0).
 */
import { DeveloperAgent } from "@forgeai/agents";
import { MockProvider } from "@forgeai/ai";
import { createSolariProvider } from "@forgeai/solari";
import { EventBus, Logger } from "@forgeai/shared";

const WORKSPACE = "/workspace/project";

// The exact actions the "AI" will take, one JSON action per step.
const SCRIPTED_ACTIONS = [
  // Step 1: write the business-logic module (worker rating average, spec §36).
  JSON.stringify({
    tool: "writeFile",
    path: "average.mjs",
    reason: "Core rating-average logic",
    content:
      "export function average(nums) {\n" +
      "  if (nums.length === 0) return 0;\n" +
      "  return nums.reduce((a, b) => a + b, 0) / nums.length;\n" +
      "}\n",
  }),
  // Step 2: write a test that checks average([5,4,5,3]) === 4.25.
  JSON.stringify({
    tool: "writeFile",
    path: "test.mjs",
    reason: "Verify the rating average",
    content:
      "import assert from 'node:assert';\n" +
      "import { average } from './average.mjs';\n" +
      "assert.strictEqual(average([5, 4, 5, 3]), 4.25);\n" +
      "console.log('TESTS PASSED');\n",
  }),
  // Step 3: run the test.
  JSON.stringify({ tool: "run", command: "node test.mjs", reason: "Run tests" }),
  // Step 4: finish.
  JSON.stringify({
    tool: "done",
    summary: "Implemented rating average with a passing test.",
  }),
];

async function main(): Promise<number> {
  const line = "─".repeat(60);
  const bus = new EventBus();
  const logger = new Logger({ scope: "dev-smoke", bus });

  // Real (local) sandbox + a scripted mock AI.
  const { provider } = createSolariProvider("local");
  const sandbox = await provider.createSandbox();
  const ai = MockProvider.fromReplies(SCRIPTED_ACTIONS);

  const agent = new DeveloperAgent({ ai, sandbox, bus, logger, workspace: WORKSPACE });

  let result;
  try {
    result = await agent.implement({
      requirement:
        "Create a Node module that computes a worker's average rating, with a test proving average([5,4,5,3]) === 4.25.",
    });
  } finally {
    await sandbox.destroy().catch(() => {});
    await provider.close().catch(() => {});
  }

  // Evidence-based checks.
  const checks = [
    {
      name: "agent completed",
      passed: result.status === "completed",
      evidence: `status=${result.status}`,
    },
    {
      name: "wrote module + test",
      passed:
        result.filesWritten.includes("average.mjs") &&
        result.filesWritten.includes("test.mjs"),
      evidence: `files=[${result.filesWritten.join(", ")}]`,
    },
    {
      name: "tests actually ran and passed",
      passed:
        result.lastCommand?.exitCode === 0 &&
        (result.lastCommand?.stdout ?? "").includes("TESTS PASSED"),
      evidence: `exit=${result.lastCommand?.exitCode} stdout="${(result.lastCommand?.stdout ?? "").trim()}"`,
    },
  ];

  const passed = checks.filter((c) => c.passed).length;
  const allPass = passed === checks.length;

  console.log(`\n${line}`);
  console.log("  FORGEAI — DEVELOPER AGENT SMOKE TEST");
  console.log(line);
  console.log(`  Steps taken : ${result.steps.length}`);
  console.log(`  Summary     : ${result.summary}`);
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
