/**
 * ForgeAI — Architect → Developer handoff smoke test.
 *
 * Shows two agents working together with NO API key (scripted mock AIs):
 *   1. The Architect turns a requirement into a structured, validated PLAN.
 *   2. Its tasks are handed to the Developer, which builds + tests the code
 *      in a real (local) sandbox.
 *
 * This is a preview of what the Orchestrator will wire together. Success =
 * a valid plan AND a completed build whose test actually passed.
 */
import {
  ArchitectAgent,
  DeveloperAgent,
  planToDeveloperTasks,
} from "@forgeai/agents";
import { MockProvider } from "@forgeai/ai";
import { createSolariProvider } from "@forgeai/solari";
import { EventBus, Logger } from "@forgeai/shared";

const WORKSPACE = "/workspace/project";

const REQUIREMENT =
  "Build a REST API for a Nigerian worker marketplace. Workers have a name, " +
  "category, location and rating. Customers can create jobs and rate completed " +
  "jobs. A worker's rating is the average of its ratings.";

// What the Architect "AI" returns: one valid plan (matches ArchitectPlanSchema).
const SCRIPTED_PLAN = JSON.stringify({
  projectType: "node-rest-api",
  summary:
    "A REST API where customers create jobs and rate workers; each worker's " +
    "rating is the average of the ratings it has received.",
  stack: ["node", "http"],
  tasks: [
    {
      id: "T-001",
      title: "Rating average module",
      description: "Create average.mjs exporting average(nums).",
    },
    {
      id: "T-002",
      title: "Unit test for rating average",
      description: "Add test.mjs asserting average([5,4,5,3]) === 4.25.",
    },
  ],
  acceptanceCriteria: [
    "A worker's rating equals the average of its ratings.",
    "The rating logic is covered by a passing test.",
  ],
  testPlan: [
    {
      id: "TC-001",
      description: "average([5,4,5,3]) is computed",
      expected: "4.25",
    },
  ],
});

// What the Developer "AI" does: build the module + test, run it, finish.
const SCRIPTED_DEV_ACTIONS = [
  JSON.stringify({
    tool: "writeFile",
    path: "average.mjs",
    content:
      "export function average(nums) {\n" +
      "  if (nums.length === 0) return 0;\n" +
      "  return nums.reduce((a, b) => a + b, 0) / nums.length;\n" +
      "}\n",
  }),
  JSON.stringify({
    tool: "writeFile",
    path: "test.mjs",
    content:
      "import assert from 'node:assert';\n" +
      "import { average } from './average.mjs';\n" +
      "assert.strictEqual(average([5, 4, 5, 3]), 4.25);\n" +
      "console.log('TESTS PASSED');\n",
  }),
  JSON.stringify({ tool: "run", command: "node test.mjs" }),
  JSON.stringify({ tool: "done", summary: "Built and tested rating average." }),
];

async function main(): Promise<number> {
  const line = "─".repeat(60);
  const bus = new EventBus();
  const logger = new Logger({ scope: "arch-smoke", bus });

  // 1. ARCHITECT ------------------------------------------------------------
  const architectAI = MockProvider.fromReplies([SCRIPTED_PLAN]);
  const architect = new ArchitectAgent({ ai: architectAI, bus, logger });
  const { plan } = await architect.plan(REQUIREMENT);
  const devTasks = planToDeveloperTasks(plan);

  console.log(`\n  Plan tasks handed to Developer:`);
  for (const t of devTasks) console.log(`   • ${t}`);
  console.log("");

  // 2. DEVELOPER ------------------------------------------------------------
  const { provider } = createSolariProvider("local");
  const sandbox = await provider.createSandbox();
  const developerAI = MockProvider.fromReplies(SCRIPTED_DEV_ACTIONS);
  const developer = new DeveloperAgent({
    ai: developerAI,
    sandbox,
    bus,
    logger,
    workspace: WORKSPACE,
  });

  let dev;
  try {
    dev = await developer.implement({
      requirement: REQUIREMENT,
      tasks: devTasks,
    });
  } finally {
    await sandbox.destroy().catch(() => {});
    await provider.close().catch(() => {});
  }

  // 3. CHECKS ---------------------------------------------------------------
  const checks = [
    {
      name: "architect produced a valid plan",
      passed: plan.tasks.length >= 1 && plan.testPlan.length >= 1,
      evidence: `${plan.tasks.length} tasks, ${plan.testPlan.length} tests, type=${plan.projectType}`,
    },
    {
      name: "tasks handed to developer",
      passed: devTasks.length === plan.tasks.length && devTasks.length > 0,
      evidence: `${devTasks.length} task strings`,
    },
    {
      name: "developer completed the build",
      passed: dev.status === "completed",
      evidence: `status=${dev.status}, files=[${dev.filesWritten.join(", ")}]`,
    },
    {
      name: "tests actually passed",
      passed:
        dev.lastCommand?.exitCode === 0 &&
        (dev.lastCommand?.stdout ?? "").includes("TESTS PASSED"),
      evidence: `exit=${dev.lastCommand?.exitCode}`,
    },
  ];

  const passed = checks.filter((c) => c.passed).length;
  const allPass = passed === checks.length;

  console.log(line);
  console.log("  FORGEAI — ARCHITECT → DEVELOPER SMOKE TEST");
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
