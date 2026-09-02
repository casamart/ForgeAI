/**
 * ForgeAI — full end-to-end pipeline demo (the whole product in one run).
 *
 * One requirement in → Architect plans → sandbox → Developer builds → unit
 * tests run → app starts → browser QA → Reviewer → engineering report out.
 * Runs entirely offline via the shared demo provider (a "router mock" that
 * answers each agent from its system prompt), so no API key is needed. With a
 * real provider you pass createAIProvider(...) instead and the agents reason
 * for themselves.
 */
import {
  Orchestrator,
  createDemoAIProvider,
  DEMO_REQUIREMENT,
} from "@forgeai/orchestrator";
import { EventBus, Logger } from "@forgeai/shared";

const PORT = 3200;

async function main(): Promise<number> {
  const bus = new EventBus();
  const logger = new Logger({ scope: "forge", bus });

  const orchestrator = new Orchestrator({
    ai: createDemoAIProvider(),
    infraMode: "local",
    projectName: "Nigerian Worker Marketplace API",
    port: PORT,
    bus,
    logger,
  });

  const result = await orchestrator.build(DEMO_REQUIREMENT);

  // The engineering report ForgeAI produces.
  console.log("\n" + result.report + "\n");

  const line = "─".repeat(60);
  const checks = [
    { name: "workflow COMPLETED", passed: result.state === "COMPLETED", evidence: `state=${result.state}` },
    { name: "review verdict PASS", passed: result.review?.status === "passed", evidence: `verdict=${result.review?.status}` },
    { name: "unit tests passed", passed: result.unitTests.failed === 0 && result.unitTests.passed >= 1, evidence: `${result.unitTests.passed} passed / ${result.unitTests.failed} failed` },
    { name: "browser QA all passed", passed: result.qa?.allPassed === true, evidence: `QA ${result.qa?.passed}/${result.qa?.total}` },
    { name: "preview URL produced", passed: !!result.previewUrl, evidence: `${result.previewUrl}` },
  ];
  const passed = checks.filter((c) => c.passed).length;
  const allPass = passed === checks.length;

  console.log(line);
  console.log("  FORGEAI — END-TO-END PIPELINE CHECK");
  console.log(line);
  for (const c of checks) {
    console.log(`  ${c.passed ? "✓ PASS" : "✗ FAIL"}  ${c.name}`);
    console.log(`         evidence: ${c.evidence}`);
  }
  console.log(line);
  console.log(`  RESULT: ${allPass ? "✅ PASS — full autonomous pipeline verified" : "❌ FAIL"} (${passed}/${checks.length})`);
  console.log(`${line}\n`);
  return allPass ? 0 : 1;
}

main().then((code) => process.exit(code));
