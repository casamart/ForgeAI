/**
 * ForgeAI — browser JOURNEY smoke test (plan §8/§9/§84).
 *
 * Proves the browser action model + JourneyRunner behave HONESTLY on the local
 * http-only browser:
 *   1. a navigation + assertion journey PASSES (real HTTP/text verification),
 *   2. a journey with an interactive click is INCONCLUSIVE — never faked as a
 *      pass (that step needs a real Solari browser),
 *   3. an AI-planned journey (scripted mock) is executed deterministically.
 *
 * Runs offline, no API key.
 */
import { QAAgent, type BrowserJourney } from "@forgeai/agents";
import { MockProvider } from "@forgeai/ai";
import { createSolariProvider } from "@forgeai/solari";
import { EventBus, Logger } from "@forgeai/shared";

const PORT = 3260;
const WORKSPACE = "/workspace/project";

const SERVER = `const http=require('http');
const PORT=process.env.PORT||3000;
function page(title,body){return '<!doctype html><html><head><title>'+title+'</title></head><body>'+body+'</body></html>';}
http.createServer(function(req,res){
  const url=(req.url||'/').split('?')[0];
  if(url==='/health'){res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify({status:'ok'}));}
  if(url==='/'){res.writeHead(200,{'Content-Type':'text/html'});return res.end(page('Home','<h1 data-testid="page-title">Find a worker</h1><a data-testid="worker-card-1" href="/workers/1">Chinedu E.</a>'));}
  if(url==='/workers/1'){res.writeHead(200,{'Content-Type':'text/html'});return res.end(page('Chinedu','<h1 data-testid="worker-name">Chinedu E.</h1><strong data-testid="worker-rating">4.67</strong><button data-testid="book-worker">Book</button>'));}
  res.writeHead(404,{'Content-Type':'text/html'});res.end(page('404','<p>not found</p>'));
}).listen(PORT,function(){console.log('up on '+PORT);});
`;

async function waitForHttp(url: string, tries = 20): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    try {
      if ((await fetch(url)).ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function main(): Promise<number> {
  const line = "─".repeat(60);
  const bus = new EventBus();
  const logger = new Logger({ scope: "journey", bus });

  const { provider } = createSolariProvider("local");
  const sandbox = await provider.createSandbox();
  const browser = await provider.launchBrowser();

  // The AI (scripted) turns a prose journey into concrete browser actions.
  const ai = MockProvider.fromReplies([
    JSON.stringify([
      { action: "goto", path: "/workers/1" },
      { action: "assertText", value: "4.67" },
    ]),
  ]);
  const qa = new QAAgent({ ai, bus, logger });

  let navResult, interactiveResult, derivedActions, derivedResult;
  try {
    await sandbox.writeFile(`${WORKSPACE}/server.js`, SERVER);
    await sandbox.startBackground("node server.js", { cwd: WORKSPACE, env: { PORT: String(PORT) } });
    const preview = await sandbox.previewUrl(PORT);
    if (!(await waitForHttp(`${preview}/health`))) throw new Error("server did not start");

    // 1. Navigation + assertions — all supported on http-only → PASS.
    const navJourney: BrowserJourney = {
      name: "Browse to a worker profile",
      steps: [
        { action: "goto", path: "/" },
        { action: "assertText", value: "Find a worker" },
        { action: "goto", path: "/workers/1" },
        { action: "assertUrl", contains: "/workers/1" },
        { action: "assertText", value: "4.67" },
        { action: "screenshot", name: "profile" },
      ],
    };
    navResult = await qa.runJourney({ previewUrl: preview, journey: navJourney, browser });

    // 2. Interactive click — INCONCLUSIVE on http-only (needs a real browser).
    const interactiveJourney: BrowserJourney = {
      name: "Book a worker",
      steps: [
        { action: "goto", path: "/workers/1" },
        { action: "assertText", value: "4.67" },
        { action: "click", target: { by: "testId", value: "book-worker" } },
      ],
    };
    interactiveResult = await qa.runJourney({ previewUrl: preview, journey: interactiveJourney, browser });

    // 3. AI-planned journey (scripted) executed deterministically → PASS.
    derivedActions = await qa.deriveJourney({
      name: "Check rating",
      proseSteps: ["Open worker 1's profile", "Confirm the rating shows 4.67"],
    });
    derivedResult = await qa.runJourney({
      previewUrl: preview,
      journey: { name: "Check rating (AI-planned)", steps: derivedActions },
      browser,
    });
  } finally {
    await browser.close().catch(() => {});
    await sandbox.destroy().catch(() => {});
    await provider.close().catch(() => {});
  }

  const clickStep = interactiveResult.steps.find((s) => s.action.action === "click");
  const checks = [
    { name: "navigation journey PASSES", passed: navResult.verdict === "PASS", evidence: `verdict=${navResult.verdict} (${navResult.steps.length} steps)` },
    { name: "interactive journey is INCONCLUSIVE (not faked)", passed: interactiveResult.verdict === "INCONCLUSIVE", evidence: `verdict=${interactiveResult.verdict}` },
    { name: "the click step itself is inconclusive", passed: clickStep?.status === "inconclusive", evidence: `click status=${clickStep?.status}` },
    { name: "AI planned a 2-step journey", passed: derivedActions.length === 2, evidence: `${derivedActions.length} actions` },
    { name: "AI-planned journey executed → PASS", passed: derivedResult.verdict === "PASS", evidence: `verdict=${derivedResult.verdict}` },
  ];
  const passed = checks.filter((c) => c.passed).length;
  const allPass = passed === checks.length;

  console.log(`\n${line}`);
  console.log("  FORGEAI — BROWSER JOURNEY SMOKE TEST");
  console.log(line);
  for (const c of checks) {
    console.log(`  ${c.passed ? "✓ PASS" : "✗ FAIL"}  ${c.name}`);
    console.log(`         evidence: ${c.evidence}`);
  }
  console.log(line);
  console.log(`  RESULT: ${allPass ? "✅ PASS — browser journeys run honestly" : "❌ FAIL"} (${passed}/${checks.length})`);
  console.log(`${line}\n`);
  return allPass ? 0 : 1;
}

main().then((code) => process.exit(code));
