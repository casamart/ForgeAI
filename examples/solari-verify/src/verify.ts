/**
 * ForgeAI — REAL Solari path verification.
 *
 * This is the only example that talks to real Solari infrastructure, so it runs
 * ONLY when SOLARI_API_KEY is set. It exercises the whole path once and cleans
 * up after itself (one sandbox + one browser, ~30–60s — a small metered charge):
 *
 *   sandbox → write file → run command → start server → preview URL
 *           → real cloud browser → navigate + assert + screenshot → cleanup
 *
 * The key is read from the environment. Put it in a gitignored .env.local at the
 * repo root (SOLARI_API_KEY=...); this script loads that file if present. Never
 * paste the key into a chat or commit it.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createSolariProvider } from "@forgeai/solari";
import { EventBus, Logger } from "@forgeai/shared";

// Tiny .env.local loader (no dependency): fills process.env for missing keys.
function loadEnvLocal(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(process.cwd(), ".env.local"),
    resolve(here, "../../../.env.local"), // repo root from examples/solari-verify/src
  ];
  for (const file of candidates) {
    try {
      for (const line of readFileSync(file, "utf8").split("\n")) {
        const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
        if (m && !process.env[m[1]]) {
          process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
        }
      }
    } catch {
      /* no such file — fine */
    }
  }
}

const PORT = 3000;
const SERVER = `const http=require('http');
const PORT=process.env.PORT||3000;
function average(n){return n.length?n.reduce((a,b)=>a+b,0)/n.length:0;}
const workers=[{id:1,name:'Amaka O.',ratings:[5,4,5,3]}];
http.createServer((req,res)=>{
  const u=(req.url||'/').split('?')[0];
  if(u==='/health'){res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify({status:'ok'}));}
  if(u==='/workers'){res.writeHead(200,{'Content-Type':'text/html'});return res.end('<h1 data-testid="avg">'+average(workers[0].ratings).toFixed(2)+'</h1>');}
  res.writeHead(404);res.end('nope');
}).listen(PORT,'0.0.0.0',()=>console.log('up on '+PORT));
`;

async function waitForHttp(url: string, tries = 30): Promise<number | null> {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return r.status;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
}

async function main(): Promise<number> {
  loadEnvLocal();
  const line = "─".repeat(64);

  if (!process.env.SOLARI_API_KEY) {
    console.error(
      "\nSOLARI_API_KEY is not set.\n" +
        "Create a gitignored .env.local at the repo root containing:\n" +
        "  SOLARI_API_KEY=sk_...\n" +
        "then run: npm run solari:verify\n",
    );
    return 2;
  }

  const bus = new EventBus();
  const logger = new Logger({ scope: "solari", bus });
  const { provider, mode } = createSolariProvider("solari");
  logger.info(`Infrastructure mode: ${mode}`);

  const results: { name: string; passed: boolean; evidence: string }[] = [];
  const record = (name: string, passed: boolean, evidence: string) => {
    results.push({ name, passed, evidence });
    (passed ? logger.success : logger.error).call(logger, `${name} — ${evidence}`);
  };

  const shotPath = resolve(process.cwd(), "solari-workers.png");
  let sandbox: Awaited<ReturnType<typeof provider.createSandbox>> | undefined;
  let browser: Awaited<ReturnType<typeof provider.launchBrowser>> | undefined;

  // Hard cap so a hung remote call can never run up the meter.
  const cap = setTimeout(() => {
    logger.error("Timed out (4 min cap) — forcing exit.");
    process.exit(1);
  }, 240_000);

  try {
    // 1. Sandbox
    sandbox = await provider.createSandbox({ template: "base" });
    await sandbox.connect();
    record("sandbox created", !!sandbox.id, `id=${sandbox.id}`);

    // 2. Command execution
    const ver = await sandbox.runShell("node --version");
    record("command ran in sandbox", ver.exitCode === 0 && /v\d/.test(ver.stdout), `node ${ver.stdout.trim()} (exit ${ver.exitCode})`);

    // 3. Write + read a file
    await sandbox.writeFile("/workspace/server.js", SERVER);
    const back = await sandbox.readFile("/workspace/server.js");
    record("file written + read back", back.includes("listen"), `${back.length} bytes`);

    // 4. Start server + preview URL
    await sandbox.startBackground("node server.js", { cwd: "/workspace", env: { PORT: String(PORT) } });
    const preview = await sandbox.previewUrl(PORT);
    record("preview URL issued", /^https?:\/\//.test(preview), preview);

    // 5. Preview reachable from the public internet
    const status = await waitForHttp(`${preview}/health`);
    record("preview reachable (/health 200)", status === 200, `status=${status}`);

    // 6. REAL cloud browser opens the app
    browser = await provider.launchBrowser();
    record("cloud browser launched", browser.isRealBrowser === true, `id=${browser.id}, real=${browser.isRealBrowser}`);
    const page = await browser.newPage();
    const nav = await page.goto(`${preview}/workers`);
    const content = await page.content();
    record("browser navigated + saw correct value", nav.status === 200 && content.includes("4.25"), `status=${nav.status}, body~="${content.slice(0, 40).replace(/\n/g, " ")}"`);

    // 7. Screenshot evidence
    const bytes = await page.screenshot(shotPath);
    record("screenshot captured", !!bytes && bytes.length > 0, bytes ? `${bytes.length} bytes → ${shotPath}` : "none");
  } catch (err) {
    record("run completed without error", false, (err as Error).message);
  } finally {
    clearTimeout(cap);
    // Always release Solari resources (§28.4).
    if (browser) await browser.close().catch(() => {});
    if (sandbox) await sandbox.destroy().catch(() => {});
    await provider.close().catch(() => {});
    logger.info("Cleaned up Solari resources.");
  }

  const passed = results.filter((r) => r.passed).length;
  const allPass = passed === results.length && results.length > 0;
  console.log(`\n${line}`);
  console.log("  FORGEAI — REAL SOLARI PATH VERIFICATION");
  console.log(line);
  for (const r of results) {
    console.log(`  ${r.passed ? "✓ PASS" : "✗ FAIL"}  ${r.name}`);
    console.log(`         ${r.evidence}`);
  }
  console.log(line);
  console.log(`  RESULT: ${allPass ? "✅ PASS — real Solari sandbox + browser verified" : "❌ FAIL"} (${passed}/${results.length})`);
  console.log(`${line}\n`);
  return allPass ? 0 : 1;
}

main().then((code) => process.exit(code));
