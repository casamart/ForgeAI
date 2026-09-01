/**
 * Local mock provider — a dev-only stand-in for Solari so the full ForgeAI
 * pipeline runs end-to-end WITHOUT a Solari API key.
 *
 * ⚠️  HONESTY / SECURITY NOTE (see docs/security.md §"No generated code on host"):
 * This mode runs generated commands on the HOST machine via child_process and
 * is therefore NOT isolated. It exists purely so the architecture can be proven
 * locally. The moment SOLARI_API_KEY is set, ForgeAI uses the real, isolated
 * SolariProvider instead. Never point this mode at untrusted requirements.
 *
 * - Sandbox  -> a temp workspace dir + child_process; previewUrl -> 127.0.0.1
 * - Browser  -> an HTTP-probe stand-in (fetch). It is NOT a real DOM browser,
 *               so click/fill/evaluate honestly throw NotSupportedError.
 */
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, isAbsolute } from "node:path";
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
import { NotSupportedError } from "./types.js";

interface ChildHandle {
  pid: number | undefined;
  kill: () => void;
}

class LocalSandbox implements ISandbox {
  readonly kind = "local" as const;
  readonly id = `local-sbx-${randomUUID().slice(0, 8)}`;
  private root: string | null = null;
  private children: ChildHandle[] = [];
  private dead = false;

  /** Map a sandbox-absolute path (e.g. /workspace/project) into the temp root. */
  private resolve(p: string): string {
    const root = this.root!;
    const rel = isAbsolute(p) ? p.replace(/^[/\\]+/, "") : p;
    return join(root, rel);
  }

  async connect(): Promise<void> {
    if (this.root) return;
    this.root = await mkdtemp(join(tmpdir(), "forgeai-local-"));
  }

  async run(cmd: string, opts: RunOptions = {}): Promise<CommandResult> {
    await this.connect();
    const cwd = opts.cwd ? this.resolve(opts.cwd) : this.root!;
    return await this.spawn(cmd, opts.args ?? [], cwd, opts, false);
  }

  async runShell(
    commandLine: string,
    opts: Omit<RunOptions, "args"> = {},
  ): Promise<CommandResult> {
    await this.connect();
    const cwd = opts.cwd ? this.resolve(opts.cwd) : this.root!;
    return await this.spawn(commandLine, [], cwd, opts, true);
  }

  async startBackground(
    commandLine: string,
    opts: Omit<RunOptions, "args"> = {},
  ): Promise<void> {
    await this.connect();
    const cwd = opts.cwd ? this.resolve(opts.cwd) : this.root!;
    const child = spawn(commandLine, {
      cwd,
      shell: true,
      detached: false,
      stdio: "ignore",
      env: { ...process.env, ...opts.env },
    });
    child.unref();
    this.children.push({ pid: child.pid, kill: () => child.kill() });
    // Give the process a beat to bind its port before callers request preview.
    await new Promise((r) => setTimeout(r, 300));
  }

  private spawn(
    cmd: string,
    args: string[],
    cwd: string,
    opts: RunOptions,
    shell: boolean,
  ): Promise<CommandResult> {
    return new Promise((resolve) => {
      const child = spawn(cmd, args, {
        cwd,
        shell,
        env: { ...process.env, ...opts.env },
      });
      let stdout = "";
      let stderr = "";
      const timer = opts.timeoutMs
        ? setTimeout(() => child.kill("SIGKILL"), opts.timeoutMs)
        : null;
      child.stdout?.on("data", (d) => (stdout += d.toString()));
      child.stderr?.on("data", (d) => (stderr += d.toString()));
      child.on("error", (err) => {
        if (timer) clearTimeout(timer);
        resolve({ exitCode: 127, stdout, stderr: stderr + String(err) });
      });
      child.on("close", (code) => {
        if (timer) clearTimeout(timer);
        resolve({ exitCode: code ?? 0, stdout, stderr });
      });
    });
  }

  async writeFile(path: string, content: string): Promise<void> {
    await this.connect();
    const full = this.resolve(path);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, content, "utf8");
  }

  async readFile(path: string): Promise<string> {
    await this.connect();
    return await readFile(this.resolve(path), "utf8");
  }

  async listDir(path: string): Promise<DirEntry[]> {
    await this.connect();
    const entries = await readdir(this.resolve(path), { withFileTypes: true });
    return entries.map((e) => ({
      name: e.name,
      type: e.isDirectory() ? "dir" : "file",
    }));
  }

  async previewUrl(port: number): Promise<string> {
    // Local mode: the "preview" is just the loopback address the server binds.
    return `http://127.0.0.1:${port}`;
  }

  async destroy(): Promise<void> {
    if (this.dead) return;
    this.dead = true;
    for (const c of this.children) {
      try {
        c.kill();
      } catch {
        /* already gone */
      }
    }
    if (this.root) {
      await rm(this.root, { recursive: true, force: true }).catch(() => {});
    }
  }
}

class LocalPage implements IBrowserPage {
  private status = 0;
  private body = "";

  async goto(url: string): Promise<{ status: number }> {
    const res = await fetch(url);
    this.status = res.status;
    this.body = await res.text();
    return { status: this.status };
  }
  async title(): Promise<string> {
    const m = this.body.match(/<title>([^<]*)<\/title>/i);
    return m?.[1] ?? "";
  }
  async content(): Promise<string> {
    return this.body;
  }
  async click(): Promise<void> {
    throw new NotSupportedError("browser.click");
  }
  async fill(): Promise<void> {
    throw new NotSupportedError("browser.fill");
  }
  async evaluate<T = unknown>(): Promise<T> {
    throw new NotSupportedError("browser.evaluate");
  }
  async screenshot(): Promise<Buffer | null> {
    // No real rendering surface in local mode — evidence is the HTTP body/status.
    return null;
  }
}

class LocalBrowser implements IBrowser {
  readonly kind = "local" as const;
  readonly isRealBrowser = false;
  readonly id = `local-brw-${randomUUID().slice(0, 8)}`;
  async newPage(): Promise<IBrowserPage> {
    return new LocalPage();
  }
  async close(): Promise<void> {
    /* nothing to release */
  }
}

export class LocalProvider implements ISolariProvider {
  readonly kind = "local" as const;

  async createSandbox(_opts: CreateSandboxOptions = {}): Promise<ISandbox> {
    const sbx = new LocalSandbox();
    await sbx.connect();
    return sbx;
  }

  async launchBrowser(_opts: LaunchBrowserOptions = {}): Promise<IBrowser> {
    return new LocalBrowser();
  }

  async close(): Promise<void> {
    /* no global handles */
  }
}
