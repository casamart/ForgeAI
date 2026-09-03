/**
 * ForgeAI — BEHAVIORAL bug demo (the plan's "main demo", §44/§106).
 *
 * ForgeAI builds a real, served Worker Marketplace web app whose profile page
 * shows a worker's average rating. The view rounds it, so [5,4,5] renders as
 * "5" when it should be "4.67". Unit tests (which check the average MATH) pass —
 * this defect is only visible in the running page. Browser QA opens the profile
 * over HTTP, catches the wrong value, the Debugger diagnoses formatRating(), the
 * Developer fixes it, the server restarts, and QA re-verifies 4.67.
 *
 * Runs offline via the scripted demo provider (no API key). Success = the bug
 * was caught AND autonomously repaired, with the final verdict backed by QA.
 */
import {
  Orchestrator,
  createBehavioralDemoAIProvider,
  WEB_REQUIREMENT,
} from "@forgeai/orchestrator";
import { EventBus, Logger } from "@forgeai/shared";

const PORT = 3250;

async function main(): Promise<number> {
  const bus = new EventBus();
  const logger = new Logger({ scope: "forge-web", bus });

  const orchestrator = new Orchestrator({
    ai: createBehavioralDemoAIProvider(),
    infraMode: "local",
    projectName: "ForgeWork — Worker Marketplace",
    port: PORT,
    bus,
    logger,
  });

  const result = await orchestrator.build(WEB_REQUIREMENT);
  const types = result.events.map((e) => e.type);

  console.log("\n" + result.report + "\n");

  // Traceability: AC-003 must have been failed by a bug, repaired, now passing.
  const trace = result.traceability ?? [];
  const ac3 = trace.find((r) => r.criterion.id === "AC-003");

  // Evidence pulled from the real run + its event stream.
  const bugDetected = types.includes("bug.detected");
  const repaired = types.includes("fix.completed");
  const line = "─".repeat(60);
  const checks = [
    { name: "unit tests passed (bug is behavioral, not math)", passed: result.unitTests.failed === 0 && result.unitTests.passed >= 1, evidence: `${result.unitTests.passed} passed / ${result.unitTests.failed} failed` },
    { name: "browser QA CAUGHT the rating bug", passed: bugDetected, evidence: `bug.detected event present=${bugDetected}` },
    { name: "repair loop fixed it autonomously", passed: repaired, evidence: `fix.completed event present=${repaired}` },
    { name: "QA re-verified after the fix (0 failing)", passed: result.qa?.failed === 0 && (result.qa?.passed ?? 0) >= 1, evidence: `QA ${result.qa?.passed}/${result.qa?.total} passed, ${result.qa?.failed} failing` },
    { name: "workflow COMPLETED with review PASS", passed: result.state === "COMPLETED" && result.review?.status === "passed", evidence: `state=${result.state}, verdict=${result.review?.status}` },
    { name: "preview URL produced", passed: !!result.previewUrl, evidence: `${result.previewUrl}` },
    { name: "traceability: all 3 criteria verified", passed: trace.length === 3 && trace.every((r) => r.status === "passed"), evidence: `${trace.map((r) => `${r.criterion.id}=${r.status}`).join(" ")}` },
    { name: "AC-003 traced: bug → repair → pass", passed: !!ac3 && ac3.status === "passed" && ac3.repaired && ac3.resolvedBugIds.length >= 1 && ac3.checkIds.includes("TC-PROFILE"), evidence: `AC-003 checks=[${ac3?.checkIds.join(",")}] resolved=[${ac3?.resolvedBugIds.join(",")}] repaired=${ac3?.repaired}` },
  ];
  const passed = checks.filter((c) => c.passed).length;
  const allPass = passed === checks.length;

  console.log(line);
  console.log("  FORGEAI — BEHAVIORAL BUG DEMO (catch → repair → verify)");
  console.log(line);
  for (const c of checks) {
    console.log(`  ${c.passed ? "✓ PASS" : "✗ FAIL"}  ${c.name}`);
    console.log(`         evidence: ${c.evidence}`);
  }
  console.log(line);
  console.log(`  RESULT: ${allPass ? "✅ PASS — behavioral bug caught & autonomously repaired" : "❌ FAIL"} (${passed}/${checks.length})`);
  console.log(`${line}\n`);
  return allPass ? 0 : 1;
}

main().then((code) => process.exit(code));
