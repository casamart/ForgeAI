/**
 * ForgeAI — full end-to-end pipeline demo (the whole product in one run).
 *
 * One requirement in → Architect plans → sandbox → Developer builds → unit
 * tests run → app starts → browser QA → Reviewer → engineering report out.
 * Runs entirely offline: a "router mock" answers each agent based on its system
 * prompt, so no API key is needed. With a real provider (Claude/OpenAI/Gemini),
 * you pass createAIProvider(...) instead and the agents reason for themselves.
 */
import { Orchestrator } from "@forgeai/orchestrator";
import { MockProvider, type ChatMessage } from "@forgeai/ai";
import { EventBus, Logger } from "@forgeai/shared";

const PORT = 3200;

const REQUIREMENT =
  "Build a REST API for a Nigerian worker marketplace. Workers have a name, " +
  "category, location and rating. Expose GET /workers, where each worker's " +
  "rating is the average of its ratings.";

// ---- What each agent "says" (scripted, so the demo is deterministic) --------

const PLAN = JSON.stringify({
  projectType: "node-rest-api",
  summary: "A worker marketplace API exposing GET /workers with average ratings.",
  stack: ["node", "http"],
  tasks: [
    { id: "T-001", title: "HTTP server", description: "server.js with /health and /workers." },
    { id: "T-002", title: "Rating test", description: "rating.test.mjs asserting the average is 4.25." },
  ],
  acceptanceCriteria: [
    "GET /workers returns each worker with averageRating.",
    "A worker's averageRating equals the mean of its ratings (4.25 for [5,4,5,3]).",
  ],
  testPlan: [
    { id: "TC-001", description: "GET /workers computes the average rating", expected: "4.25" },
  ],
});

const SERVER_JS =
  'const http = require("http");\n' +
  "const PORT = process.env.PORT || " + PORT + ";\n" +
  "function average(n){ return n.length ? n.reduce((a,b)=>a+b,0)/n.length : 0; }\n" +
  'const workers = [{ id:1, name:"Amaka O.", category:"Plumber", location:"Lagos", ratings:[5,4,5,3] }];\n' +
  "http.createServer((req,res)=>{\n" +
  '  const url = (req.url||"/").split("?")[0];\n' +
  '  if (url === "/health"){ res.writeHead(200,{"Content-Type":"application/json"}); return res.end(JSON.stringify({status:"ok"})); }\n' +
  '  if (url === "/workers"){ res.writeHead(200,{"Content-Type":"application/json"}); return res.end(JSON.stringify(workers.map(w=>({...w,averageRating:average(w.ratings)})))); }\n' +
  '  res.writeHead(404,{"Content-Type":"application/json"}); res.end(JSON.stringify({error:"not found"}));\n' +
  '}).listen(PORT, ()=>console.log("listening on "+PORT));\n';

const TEST_MJS =
  'import { test } from "node:test";\n' +
  'import assert from "node:assert";\n' +
  "function average(n){ return n.length ? n.reduce((a,b)=>a+b,0)/n.length : 0; }\n" +
  'test("average of [5,4,5,3] is 4.25", () => {\n' +
  "  assert.strictEqual(average([5,4,5,3]), 4.25);\n" +
  "});\n";

// The Developer's actions, in order.
const DEV_ACTIONS = [
  JSON.stringify({ tool: "writeFile", path: "server.js", content: SERVER_JS }),
  JSON.stringify({ tool: "writeFile", path: "rating.test.mjs", content: TEST_MJS }),
  JSON.stringify({ tool: "run", command: "node --test" }),
  JSON.stringify({ tool: "done", summary: "Built server + passing rating test." }),
];

// QA derives one check for /workers (the orchestrator adds a health check too).
const QA_CHECKS = JSON.stringify([
  {
    id: "TC-001",
    description: "GET /workers computes averageRating 4.25",
    path: "/workers",
    method: "GET",
    expectStatus: 200,
    expectBodyIncludes: ["4.25"],
  },
]);

// The Reviewer marks both acceptance criteria met.
const REVIEW = JSON.stringify({
  criteria: [
    { criterion: "GET /workers returns each worker with averageRating.", met: true, justification: "QA saw averageRating in the response." },
    { criterion: "averageRating equals the mean (4.25).", met: true, justification: "Unit test and QA both confirm 4.25." },
  ],
  knownIssues: [],
  summary: "All acceptance criteria satisfied by unit tests and browser QA.",
});

// A router mock: pick the reply based on which agent is asking (its system prompt).
function routerMock(): MockProvider {
  const devQueue = [...DEV_ACTIONS];
  return new MockProvider({
    responder: (messages: ChatMessage[]) => {
      const sys = messages.find((m) => m.role === "system")?.content ?? "";
      if (sys.includes("Architect Agent")) return PLAN;
      if (sys.includes("QA Agent")) return QA_CHECKS;
      if (sys.includes("Reviewer Agent")) return REVIEW;
      if (sys.includes("Developer Agent"))
        return devQueue.shift() ?? JSON.stringify({ tool: "done", summary: "done" });
      return "{}";
    },
  });
}

async function main(): Promise<number> {
  const bus = new EventBus();
  const logger = new Logger({ scope: "forge", bus });

  const orchestrator = new Orchestrator({
    ai: routerMock(),
    infraMode: "local",
    projectName: "Nigerian Worker Marketplace API",
    port: PORT,
    bus,
    logger,
  });

  const result = await orchestrator.build(REQUIREMENT);

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
