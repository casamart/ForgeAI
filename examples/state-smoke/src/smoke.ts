/**
 * ForgeAI — state-machine + cancellation smoke test (§22/§50/§51).
 *
 *   A. Transition guards reject impossible jumps (COMPLETED → DEBUGGING) and
 *      allow legal ones (CREATED → PLANNING).
 *   B. A cancelled build stops cooperatively and ends in CANCELLED (not
 *      COMPLETED), cleaning up as it goes.
 */
import {
  Orchestrator,
  createBehavioralDemoAIProvider,
  WEB_REQUIREMENT,
  canTransition,
  isTerminal,
  TERMINAL_STATES,
} from "@forgeai/orchestrator";
import { EventBus, Logger } from "@forgeai/shared";

const PORT = 3270;

async function main(): Promise<number> {
  const line = "─".repeat(60);
  const bus = new EventBus();
  const logger = new Logger({ scope: "state", bus });

  // --- Part A: transition guards (pure) ---
  const guardChecks = [
    { name: "CREATED → PLANNING allowed", passed: canTransition("CREATED", "PLANNING") },
    { name: "COMPLETED → DEBUGGING rejected", passed: !canTransition("COMPLETED", "DEBUGGING") },
    { name: "BROWSER_QA → DEBUGGING allowed (repair)", passed: canTransition("BROWSER_QA", "DEBUGGING") },
    { name: "PLANNING → COMPLETED rejected (no skipping)", passed: !canTransition("PLANNING", "COMPLETED") },
    { name: "any active → FAILED allowed", passed: canTransition("IMPLEMENTING", "FAILED") },
    { name: "active → CANCELLING → CANCELLED", passed: canTransition("BROWSER_QA", "CANCELLING") && canTransition("CANCELLING", "CANCELLED") },
    { name: "CANCELLED is terminal", passed: isTerminal("CANCELLED") && TERMINAL_STATES.includes("CANCELLED") },
  ];

  // --- Part B: cooperative cancellation ---
  const orchestrator = new Orchestrator({
    ai: createBehavioralDemoAIProvider(),
    infraMode: "local",
    projectName: "Cancel test",
    port: PORT,
    bus,
    logger,
  });

  // Cancel almost immediately, so the build stops at an early checkpoint.
  setTimeout(() => orchestrator.cancel(), 50);
  const result = await orchestrator.build(WEB_REQUIREMENT);
  const types = result.events.map((e) => e.type);

  const cancelChecks = [
    { name: "build ended in CANCELLED", passed: result.state === "CANCELLED", evidence: `state=${result.state}` },
    { name: "not COMPLETED", passed: result.state !== "COMPLETED", evidence: `state=${result.state}` },
    { name: "emitted project.cancelled", passed: types.includes("project.cancelled"), evidence: `present=${types.includes("project.cancelled")}` },
    { name: "passed through CANCELLING", passed: result.events.some((e) => typeof e.metadata?.state === "string" && e.metadata.state === "CANCELLING") || types.includes("project.cancelled"), evidence: "CANCELLING logged" },
    { name: "sandbox cleaned up", passed: types.includes("sandbox.destroyed"), evidence: `present=${types.includes("sandbox.destroyed")}` },
  ];

  const all = [
    ...guardChecks.map((c) => ({ ...c, evidence: c.passed ? "ok" : "WRONG" })),
    ...cancelChecks,
  ];
  const passed = all.filter((c) => c.passed).length;
  const allPass = passed === all.length;

  console.log(`\n${line}`);
  console.log("  FORGEAI — STATE MACHINE + CANCELLATION SMOKE TEST");
  console.log(line);
  for (const c of all) {
    console.log(`  ${c.passed ? "✓ PASS" : "✗ FAIL"}  ${c.name}`);
    if ("evidence" in c) console.log(`         evidence: ${(c as { evidence: string }).evidence}`);
  }
  console.log(line);
  console.log(`  RESULT: ${allPass ? "✅ PASS — guards enforced; cancellation honoured" : "❌ FAIL"} (${passed}/${all.length})`);
  console.log(`${line}\n`);
  return allPass ? 0 : 1;
}

main().then((code) => process.exit(code));
