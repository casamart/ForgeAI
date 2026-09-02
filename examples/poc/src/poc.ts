/**
 * ForgeAI — Phase 1 Proof of Concept (roadmap Phase 1, spec §38 / §56).
 *
 * Proves the hardest path end-to-end, BEFORE any dashboard or agents:
 *
 *   provider  ->  sandbox  ->  generate a Node API  ->  run it
 *             ->  preview URL  ->  Solari browser  ->  verify behavior  ->  PASS
 *
 * Runs against real Solari when SOLARI_API_KEY is set, otherwise the local mock.
 * Every claim is backed by observed evidence (HTTP status, response body,
 * exit codes) — never by an assertion that "it worked". (spec §51)
 */
import { createSolariProvider } from "@forgeai/solari";
import { EventBus, Logger } from "@forgeai/shared";
import type { ISandbox } from "@forgeai/solari";

// Port the generated app listens on. Override with FORGEAI_POC_PORT (or PORT)
// if something else already owns 3000 on your machine.
const PORT = Number(process.env.FORGEAI_POC_PORT || process.env.PORT) || 3000;
const WORKSPACE = "/workspace/project";

interface Check {
  name: string;
  passed: boolean;
  evidence: string;
}

/** The Node application ForgeAI "generates" for this PoC (no dependencies). */
const NODE_SERVER = `const http = require("http");
const PORT = process.env.PORT || ${PORT};

// Business logic under test (spec §36): average of [5,4,5,3] must be 4.25.
function average(nums) {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}
const workers = [
  { id: 1, name: "Amaka O.", category: "Plumber", location: "Lagos", ratings: [5, 4, 5, 3] },
];

const server = http.createServer((req, res) => {
  const url = (req.url || "/").split("?")[0];
  if (url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ status: "ok" }));
  }
  if (url === "/workers") {
    const body = workers.map((w) => ({ ...w, averageRating: average(w.ratings) }));
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(body));
  }
  if (url === "/") {
    res.writeHead(200, { "Content-Type": "text/html" });
    return res.end("<!doctype html><html><head><title>ForgeAI PoC API</title></head><body><h1>ForgeAI PoC API</h1></body></html>");
  }
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not found" }));
});
server.listen(PORT, () => console.log("listening on " + PORT));
`;

/** Poll a URL until it responds (health gate before handing to QA, arch §23). */
async function waitForHttp(url: string, log: Logger, tries = 20): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
      log.info(`  waiting for server (HTTP ${res.status})`);
    } catch {
      log.info("  waiting for server (not up yet)");
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

/** Detect an available JS/py runtime in the sandbox with real evidence. */
async function detectRuntime(sbx: ISandbox): Promise<"node" | null> {
  const node = await sbx.run("node", { args: ["--version"] });
  if (node.exitCode === 0) return "node";
  return null;
}

async function main(): Promise<number> {
  const bus = new EventBus();
  const log = new Logger({ scope: "poc", bus });
  const checks: Check[] = [];

  const { provider, mode } = createSolariProvider();
  log.info(`Infrastructure mode: ${mode.toUpperCase()}${mode === "local" ? " (mock — not isolated, dev only)" : ""}`);

  let sandbox: ISandbox | null = null;
  const browserThings: { close: () => Promise<void> }[] = [];

  try {
    // 1. SANDBOX ------------------------------------------------------------
    log.step("Creating sandbox…");
    sandbox = await provider.createSandbox({ template: "base" });
    await sandbox.connect();
    bus.emit("sandbox.created", `Sandbox ready: ${sandbox.id}`, { id: sandbox.id });
    log.success(`Sandbox ready: ${sandbox.id}`);

    // 2. RUNTIME CHECK ------------------------------------------------------
    const runtime = await detectRuntime(sandbox);
    if (!runtime) {
      log.error("No Node.js runtime available in the sandbox. Aborting.");
      checks.push({ name: "runtime available", passed: false, evidence: "node --version failed" });
      throw new Error("no runtime");
    }
    const ver = (await sandbox.run("node", { args: ["--version"] })).stdout.trim();
    log.success(`Runtime: Node ${ver}`);
    checks.push({ name: "runtime available", passed: true, evidence: `node ${ver}` });

    // 3. GENERATE APPLICATION ----------------------------------------------
    log.step("Writing application source…");
    await sandbox.writeFile(`${WORKSPACE}/server.js`, NODE_SERVER);
    bus.emit("file.created", "Created server.js", { path: `${WORKSPACE}/server.js` });
    const readBack = await sandbox.readFile(`${WORKSPACE}/server.js`);
    const wrote = readBack.includes("ForgeAI PoC API");
    checks.push({ name: "source written & read back", passed: wrote, evidence: `${readBack.length} bytes` });
    log.success(`Wrote server.js (${readBack.length} bytes)`);

    const listing = await sandbox.listDir(WORKSPACE);
    log.info(`Workspace contents: ${listing.map((e) => e.name).join(", ")}`);

    // 4. START SERVER -------------------------------------------------------
    log.step(`Starting server on port ${PORT}…`);
    await sandbox.startBackground(`node server.js`, { cwd: WORKSPACE, env: { PORT: String(PORT) } });
    bus.emit("server.started", "Server process launched");

    // 5. PREVIEW URL + HEALTH GATE -----------------------------------------
    const preview = await sandbox.previewUrl(PORT);
    log.success(`Preview URL: ${preview}`);
    bus.emit("preview.ready", `Preview ready: ${preview}`, { url: preview });

    log.step("Health-checking server before QA…");
    const healthy = await waitForHttp(`${preview}/health`, log);
    checks.push({ name: "server health check", passed: healthy, evidence: `${preview}/health` });
    if (!healthy) throw new Error("server never became healthy");
    log.success("Server is healthy (HTTP 200 /health).");

    // 6. BROWSER QA ---------------------------------------------------------
    log.step("Launching browser for QA…");
    const browser = await provider.launchBrowser();
    browserThings.push(browser);
    bus.emit("qa.started", `Browser session: ${browser.id}`, {
      id: browser.id,
      realBrowser: browser.isRealBrowser,
    });
    log.success(`Browser session: ${browser.id}${browser.isRealBrowser ? "" : " (HTTP-probe stand-in)"}`);
    const page = await browser.newPage();

    // QA 1: home page loads with expected title
    const home = await page.goto(`${preview}/`);
    const title = await page.title();
    const homeOk = home.status === 200 && title.includes("ForgeAI PoC API");
    checks.push({ name: "GET / returns 200 with title", passed: homeOk, evidence: `status=${home.status} title="${title}"` });
    (homeOk ? log.success : log.error).call(log, `QA / -> ${home.status}, title="${title}"`);

    // QA 2: business logic — average rating of [5,4,5,3] === 4.25
    const workersResp = await page.goto(`${preview}/workers`);
    const body = await page.content();
    const has425 = /"averageRating"\s*:\s*4\.25/.test(body) || body.includes("4.25");
    const workersOk = workersResp.status === 200 && has425;
    checks.push({ name: "GET /workers computes averageRating 4.25", passed: workersOk, evidence: `status=${workersResp.status}, body has 4.25=${has425}` });
    (workersOk ? log.success : log.error).call(log, `QA /workers -> ${workersResp.status}, averageRating 4.25 present=${has425}`);

    // 7. VERDICT ------------------------------------------------------------
    const passed = checks.filter((c) => c.passed).length;
    const total = checks.length;
    const allPass = passed === total;
    bus.emit(allPass ? "qa.passed" : "qa.failed", `${passed}/${total} checks passed`);

    printReport(mode, checks, allPass);
    bus.emit(allPass ? "project.completed" : "project.failed", `PoC ${allPass ? "PASSED" : "FAILED"}`);
    return allPass ? 0 : 1;
  } catch (err) {
    log.error(`PoC aborted: ${(err as Error).message}`);
    printReport(mode, checks, false);
    return 1;
  } finally {
    // 8. CLEANUP (spec §28.4) ----------------------------------------------
    for (const b of browserThings) await b.close().catch(() => {});
    if (sandbox) {
      await sandbox.destroy().catch(() => {});
      bus.emit("sandbox.destroyed", "Sandbox destroyed");
    }
    await provider.close().catch(() => {});
  }
}

function printReport(mode: string, checks: Check[], allPass: boolean): void {
  const line = "─".repeat(60);
  console.log(`\n${line}`);
  console.log("  FORGEAI — PHASE 1 POC REPORT");
  console.log(line);
  console.log(`  Infrastructure : ${mode}`);
  console.log(`  Checks         : ${checks.filter((c) => c.passed).length}/${checks.length} passed`);
  console.log(line);
  for (const c of checks) {
    console.log(`  ${c.passed ? "✓ PASS" : "✗ FAIL"}  ${c.name}`);
    console.log(`         evidence: ${c.evidence}`);
  }
  console.log(line);
  console.log(`  RESULT: ${allPass ? "✅ PASS — full loop verified with evidence" : "❌ FAIL"}`);
  console.log(`${line}\n`);
}

main().then((code) => process.exit(code));
