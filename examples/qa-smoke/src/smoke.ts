/**
 * ForgeAI — QA Agent smoke test.
 *
 * Starts a REAL server in a local sandbox, then runs the QA agent against it
 * with a mix of checks designed to prove verdict discipline (AGENTS §5):
 *   - two checks that should PASS,
 *   - one check that should FAIL and produce a bug report,
 *   - one check that should be INCONCLUSIVE (needs a real DOM browser).
 *
 * The important guarantee: the failing/unknown checks are NEVER reported as
 * PASS. It also shows the AI deriving checks from a prose test plan (scripted
 * mock), so no API key is needed.
 */
import { QAAgent, type QACheck } from "@forgeai/agents";
import { MockProvider } from "@forgeai/ai";
import { createSolariProvider } from "@forgeai/solari";
import { EventBus, Logger } from "@forgeai/shared";

const PORT = 3100;
const WORKSPACE = "/workspace/project";

// A tiny app to test: /health and /workers exist; anything else is 404.
const SERVER = `const http = require("http");
const PORT = process.env.PORT || ${PORT};
function average(n){ return n.length ? n.reduce((a,b)=>a+b,0)/n.length : 0; }
const workers = [{ id:1, name:"Amaka O.", ratings:[5,4,5,3] }];
http.createServer((req,res)=>{
  const url = (req.url||"/").split("?")[0];
  if (url === "/health"){ res.writeHead(200,{"Content-Type":"application/json"}); return res.end(JSON.stringify({status:"ok"})); }
  if (url === "/workers"){ res.writeHead(200,{"Content-Type":"application/json"}); return res.end(JSON.stringify(workers.map(w=>({...w,averageRating:average(w.ratings)})))); }
  res.writeHead(404,{"Content-Type":"application/json"}); res.end(JSON.stringify({error:"not found"}));
}).listen(PORT, ()=>console.log("listening on "+PORT));
`;

async function waitForHttp(url: string, tries = 20): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    try {
      if ((await fetch(url)).ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

async function main(): Promise<number> {
  const line = "─".repeat(60);
  const bus = new EventBus();
  const logger = new Logger({ scope: "qa-smoke", bus });

  const { provider } = createSolariProvider("local");
  const sandbox = await provider.createSandbox();
  const browser = await provider.launchBrowser();

  let report;
  let derivedCount = 0;
  try {
    // 1. Build + start the app.
    await sandbox.writeFile(`${WORKSPACE}/server.js`, SERVER);
    await sandbox.startBackground("node server.js", {
      cwd: WORKSPACE,
      env: { PORT: String(PORT) },
    });
    const preview = await sandbox.previewUrl(PORT);
    const healthy = await waitForHttp(`${preview}/health`);
    if (!healthy) throw new Error("server did not start");
    logger.success(`App running at ${preview}`);

    // 2. (Bonus) AI derives a check from a prose test plan — scripted mock.
    const deriverAI = MockProvider.fromReplies([
      JSON.stringify([
        {
          id: "TC-AI",
          description: "health endpoint returns ok",
          path: "/health",
          method: "GET",
          expectStatus: 200,
          expectBodyIncludes: ["ok"],
        },
      ]),
    ]);
    const qaWithAI = new QAAgent({ ai: deriverAI, bus, logger });
    const derived = await qaWithAI.deriveChecks({
      requirement: "Worker marketplace API",
      testPlan: "The /health endpoint should return 200 and status ok.",
    });
    derivedCount = derived.length;

    // 3. The real QA run: a deliberate mix of outcomes.
    const checks: QACheck[] = [
      {
        id: "TC-001",
        description: "GET /health returns 200 and status ok",
        path: "/health",
        method: "GET",
        expectStatus: 200,
        expectBodyIncludes: ["ok"],
      },
      {
        id: "TC-002",
        description: "GET /workers computes averageRating 4.25",
        path: "/workers",
        method: "GET",
        expectStatus: 200,
        expectBodyIncludes: ["4.25"],
      },
      {
        id: "TC-003",
        description: "GET /missing should exist (intentionally wrong)",
        path: "/missing",
        method: "GET",
        expectStatus: 200, // the server returns 404 -> this must FAIL, not PASS
      },
      {
        id: "TC-004",
        description: "Dashboard button click (needs a real browser)",
        path: "/",
        method: "GET",
        requiresRealBrowser: true, // local HTTP-probe -> INCONCLUSIVE
      },
    ];

    const qa = new QAAgent({ ai: deriverAI, bus, logger });
    report = await qa.run({ previewUrl: preview, checks, browser });
  } finally {
    await browser.close().catch(() => {});
    await sandbox.destroy().catch(() => {});
    await provider.close().catch(() => {});
  }

  // 4. Evidence-based checks about QA's own behavior.
  const checks = [
    { name: "AI derived checks from prose", passed: derivedCount === 1, evidence: `${derivedCount} check(s)` },
    { name: "2 checks PASS", passed: report.passed === 2, evidence: `passed=${report.passed}` },
    { name: "1 check FAIL with a bug", passed: report.failed === 1 && report.bugs.length === 1, evidence: `failed=${report.failed}, bugs=${report.bugs.length}` },
    { name: "1 check INCONCLUSIVE (not faked as pass)", passed: report.inconclusive === 1, evidence: `inconclusive=${report.inconclusive}` },
    { name: "report is not allPassed", passed: report.allPassed === false, evidence: `allPassed=${report.allPassed}` },
  ];
  const passed = checks.filter((c) => c.passed).length;
  const allPass = passed === checks.length;

  console.log(`\n${line}`);
  console.log("  FORGEAI — QA AGENT SMOKE TEST");
  console.log(line);
  console.log(`  QA verdicts : PASS=${report.passed} FAIL=${report.failed} BLOCKED=${report.blocked} INCONCLUSIVE=${report.inconclusive}`);
  if (report.bugs.length) {
    console.log(`  Bugs        : ${report.bugs.map((b) => `${b.id} ${b.title}`).join("; ")}`);
  }
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
