/**
 * ForgeAI — autonomous REPAIR demo.
 *
 * Same pipeline as `npm run demo`, but the Developer's first attempt ships a
 * real bug: average() returns the sum instead of the mean. The unit test fails,
 * the Debugger diagnoses it, the Developer fixes it, and the test passes — all
 * autonomously. This is the closed engineering loop, shown with real evidence.
 */
import {
  Orchestrator,
  createRepairDemoAIProvider,
  DEMO_REQUIREMENT,
} from "@forgeai/orchestrator";
import { EventBus, Logger } from "@forgeai/shared";

async function main(): Promise<number> {
  const bus = new EventBus();
  const logger = new Logger({ scope: "repair", bus });

  // Watch the tell-tale repair events as they happen.
  let sawTestFail = false;
  let sawFixStarted = false;
  let sawDiagnosis = false;
  bus.on((e) => {
    if (e.type === "test.failed") sawTestFail = true;
    if (e.type === "fix.started") sawFixStarted = true;
    if (e.type === "agent.finished" && e.metadata?.agent === "debugger") sawDiagnosis = true;
  });

  const orchestrator = new Orchestrator({
    ai: createRepairDemoAIProvider(),
    infraMode: "local",
    projectName: "Worker Marketplace API (repair demo)",
    port: 3210,
    bus,
    logger,
  });

  const result = await orchestrator.build(DEMO_REQUIREMENT);
  console.log("\n" + result.report + "\n");

  const line = "─".repeat(60);
  const checks = [
    { name: "unit test FAILED first (bug is real)", passed: sawTestFail, evidence: `test.failed emitted=${sawTestFail}` },
    { name: "Debugger produced a diagnosis", passed: sawDiagnosis, evidence: `debugger finished=${sawDiagnosis}` },
    { name: "repair loop ran (fix.started)", passed: sawFixStarted, evidence: `fix.started emitted=${sawFixStarted}` },
    { name: "final unit tests pass", passed: result.unitTests.failed === 0 && result.unitTests.passed >= 1, evidence: `${result.unitTests.passed} passed / ${result.unitTests.failed} failed` },
    { name: "build COMPLETED with PASS verdict", passed: result.state === "COMPLETED" && result.review?.status === "passed", evidence: `state=${result.state} verdict=${result.review?.status}` },
  ];
  const passed = checks.filter((c) => c.passed).length;
  const allPass = passed === checks.length;

  console.log(line);
  console.log("  FORGEAI — AUTONOMOUS REPAIR DEMO CHECK");
  console.log(line);
  for (const c of checks) {
    console.log(`  ${c.passed ? "✓ PASS" : "✗ FAIL"}  ${c.name}`);
    console.log(`         evidence: ${c.evidence}`);
  }
  console.log(line);
  console.log(`  RESULT: ${allPass ? "✅ PASS — bug injected, diagnosed, and repaired autonomously" : "❌ FAIL"} (${passed}/${checks.length})`);
  console.log(`${line}\n`);
  return allPass ? 0 : 1;
}

main().then((code) => process.exit(code));
