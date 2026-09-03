/**
 * Real Solari-backed provider. Thin adapter over `@solarisdk/sdk` (sandboxes)
 * and `@solarisdk/browser` (Playwright-compatible cloud browsers).
 *
 * The SDK packages are loaded via dynamic import so that local mock mode never
 * needs them installed/resolvable. Their runtime shapes are documented in the
 * Solari cookbook; we type the handles loosely and re-expose a strict surface.
 */
import type {
  CommandResult,
  CreateSandboxOptions,
  DirEntry,
  IBrowser,
  IBrowserPage,
  ISandbox,
  ISolariProvider,
  LaunchBrowserOptions,
  RunOptions,
} from "./types.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

function requireKey(): string {
  const key = process.env.SOLARI_API_KEY;
  if (!key) {
    throw new Error(
      "SOLARI_API_KEY is required for Solari mode. Get one at https://console.getsolari.com",
    );
  }
  return key;
}

class SolariSandbox implements ISandbox {
  readonly kind = "solari" as const;
  private handle: any;
  private connected = false;
  private dead = false;

  constructor(handle: any) {
    this.handle = handle;
  }

  get id(): string {
    return this.handle.sandboxId;
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    await this.handle.connect();
    this.connected = true;
  }

  async run(cmd: string, opts: RunOptions = {}): Promise<CommandResult> {
    const res = await this.handle.commands.run(cmd, {
      args: opts.args ?? [],
      ...(opts.cwd ? { cwd: opts.cwd } : {}),
      ...(opts.env ? { env: opts.env } : {}),
      ...(opts.timeoutMs ? { timeoutMs: opts.timeoutMs } : {}),
    });
    return {
      exitCode: res.exitCode ?? 0,
      stdout: res.stdout ?? "",
      stderr: res.stderr ?? "",
    };
  }

  async runShell(
    commandLine: string,
    opts: Omit<RunOptions, "args"> = {},
  ): Promise<CommandResult> {
    return this.run("sh", { ...opts, args: ["-c", commandLine] });
  }

  async startBackground(
    commandLine: string,
    opts: Omit<RunOptions, "args"> = {},
  ): Promise<void> {
    // Background it with a shell so commands.run returns immediately instead of
    // blocking until the idle timeout (matches the Solari port-preview recipe).
    const cd = opts.cwd ? `cd ${opts.cwd} && ` : "";
    await this.run("sh", {
      ...opts,
      args: [
        "-c",
        `${cd}nohup ${commandLine} > /tmp/forgeai-bg.log 2>&1 &`,
      ],
    });
  }

  async stopBackground(): Promise<void> {
    // Best-effort inside the isolated VM: stop node dev servers so the port
    // frees up before a restart. "|| true" so a no-match is not an error.
    await this.run("sh", { args: ["-c", "pkill -f 'node ' || true"] });
  }

  async writeFile(path: string, content: string): Promise<void> {
    await this.handle.files.write(path, content);
  }

  async readFile(path: string): Promise<string> {
    return await this.handle.files.readText(path);
  }

  async listDir(path: string): Promise<DirEntry[]> {
    const entries = await this.handle.files.list(path);
    // Real Solari FsEntry is { name, dir: boolean, size }.
    return (entries ?? []).map((e: any): DirEntry => ({
      name: e.name,
      type: e.dir ? "dir" : "file",
    }));
  }

  async previewUrl(port: number): Promise<string> {
    const { url } = await this.handle.previewUrl(port);
    return url;
  }

  async destroy(): Promise<void> {
    if (this.dead) return;
    this.dead = true;
    await this.handle.kill();
  }
}

class SolariPage implements IBrowserPage {
  private page: any;
  constructor(page: any) {
    this.page = page;
  }
  async goto(url: string): Promise<{ status: number }> {
    const res = await this.page.goto(url, { waitUntil: "load" });
    return { status: res?.status?.() ?? 200 };
  }
  async title(): Promise<string> {
    return await this.page.title();
  }
  async content(): Promise<string> {
    // innerText of body is closer to "what a user sees" than raw HTML.
    return await this.page.evaluate("document.body?.innerText ?? ''");
  }
  async click(selector: string): Promise<void> {
    await this.page.click(selector);
  }
  async fill(selector: string, value: string): Promise<void> {
    await this.page.fill(selector, value);
  }
  async evaluate<T = unknown>(script: string): Promise<T> {
    return await this.page.evaluate(script);
  }
  async screenshot(path: string): Promise<Buffer | null> {
    return await this.page.screenshot({ path });
  }
}

class SolariBrowser implements IBrowser {
  readonly kind = "solari" as const;
  readonly isRealBrowser = true;
  private browser: any;
  constructor(browser: any) {
    this.browser = browser;
  }
  get id(): string {
    return this.browser.id;
  }
  async newPage(): Promise<IBrowserPage> {
    return new SolariPage(await this.browser.newPage());
  }
  async close(): Promise<void> {
    await this.browser.close();
  }
}

export class SolariProvider implements ISolariProvider {
  readonly kind = "solari" as const;
  private sdk: any;
  private browserClient: any;

  private async sandboxes(): Promise<any> {
    if (!this.sdk) {
      const { SolariClient } = await import("@solarisdk/sdk");
      this.sdk = new SolariClient({ apiKey: requireKey() });
    }
    return this.sdk;
  }

  private async browsers(): Promise<any> {
    if (!this.browserClient) {
      const { Solari } = await import("@solarisdk/browser");
      this.browserClient = new Solari({ apiKey: requireKey() });
    }
    return this.browserClient;
  }

  async createSandbox(opts: CreateSandboxOptions = {}): Promise<ISandbox> {
    const sdk = await this.sandboxes();
    const handle = await sdk.sandboxes.create({
      template: opts.template ?? "base",
      timeoutMs: opts.timeoutMs ?? 5 * 60_000,
    });
    return new SolariSandbox(handle);
  }

  async launchBrowser(opts: LaunchBrowserOptions = {}): Promise<IBrowser> {
    const client = await this.browsers();
    const browser = await client.launch({
      ...(opts.stealth ? { stealth: true } : {}),
      ...(opts.proxy ? { proxy: opts.proxy } : {}),
      ...(opts.profileId ? { profileId: opts.profileId } : {}),
      ...(opts.recording ? { recording: true } : {}),
    });
    return new SolariBrowser(browser);
  }

  async close(): Promise<void> {
    // Required in Node or the browser client keeps the event loop alive.
    if (this.browserClient) await this.browserClient.close();
  }
}
