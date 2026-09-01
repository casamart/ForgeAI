/**
 * ForgeAI infrastructure abstraction (spec §27).
 *
 * Agents talk to THESE interfaces, never to the Solari SDK directly. That lets
 * us run the exact same agent code against real Solari cloud infrastructure or
 * against a local mock, and swap the backend later without touching agents.
 */

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface RunOptions {
  /** Arguments passed as argv — NOT shell-interpreted (matches Solari). */
  args?: string[];
  /** Working directory inside the environment. */
  cwd?: string;
  /** Extra environment variables. */
  env?: Record<string, string>;
  /** Per-command timeout in ms. */
  timeoutMs?: number;
}

export interface DirEntry {
  name: string;
  type: "file" | "dir";
}

/**
 * An isolated development environment (Solari sandbox, or a local temp dir).
 */
export interface ISandbox {
  readonly id: string;
  /** Backend kind, for honest logging ("solari" vs "local"). */
  readonly kind: "solari" | "local";

  /** Open the control channel (no-op for local). Idempotent. */
  connect(): Promise<void>;

  /** Run a command to completion. `cmd` is argv[0]; use runShell for pipes. */
  run(cmd: string, opts?: RunOptions): Promise<CommandResult>;
  /** Convenience: run a full shell command line via `sh -c`, to completion. */
  runShell(commandLine: string, opts?: Omit<RunOptions, "args">): Promise<CommandResult>;
  /**
   * Launch a long-running process (e.g. a dev server) and return once it is
   * launched, WITHOUT waiting for it to exit. Its output is captured to a log
   * file inside the environment for later inspection.
   */
  startBackground(commandLine: string, opts?: Omit<RunOptions, "args">): Promise<void>;

  writeFile(path: string, content: string): Promise<void>;
  readFile(path: string): Promise<string>;
  listDir(path: string): Promise<DirEntry[]>;

  /** Public URL for a port exposed from inside the environment. */
  previewUrl(port: number): Promise<string>;

  /** Destroy the environment and free resources. Idempotent. */
  destroy(): Promise<void>;
}

/** A single page/tab in a browser session (subset of the Playwright surface). */
export interface IBrowserPage {
  goto(url: string): Promise<{ status: number }>;
  title(): Promise<string>;
  /** Visible text / body of the current page. */
  content(): Promise<string>;
  click(selector: string): Promise<void>;
  fill(selector: string, value: string): Promise<void>;
  /** Evaluate JS in page context (real browser only). */
  evaluate<T = unknown>(script: string): Promise<T>;
  /** Save a screenshot to `path`; returns bytes, or null if unsupported. */
  screenshot(path: string): Promise<Buffer | null>;
}

/** A browser session (Solari cloud browser, or a local HTTP-probe stand-in). */
export interface IBrowser {
  readonly id: string;
  readonly kind: "solari" | "local";
  /** True for a real DOM browser; false for the HTTP-probe fallback. */
  readonly isRealBrowser: boolean;
  newPage(): Promise<IBrowserPage>;
  close(): Promise<void>;
}

export interface CreateSandboxOptions {
  template?: string;
  timeoutMs?: number;
}

export interface LaunchBrowserOptions {
  stealth?: boolean;
  proxy?: string;
  profileId?: string;
  recording?: boolean;
}

/**
 * Top-level infrastructure provider. One instance owns the credentials and
 * hands out sandboxes and browsers.
 */
export interface ISolariProvider {
  readonly kind: "solari" | "local";
  createSandbox(opts?: CreateSandboxOptions): Promise<ISandbox>;
  launchBrowser(opts?: LaunchBrowserOptions): Promise<IBrowser>;
  /** Release any global handles (Solari requires this or Node hangs). */
  close(): Promise<void>;
}

export class NotSupportedError extends Error {
  constructor(feature: string) {
    super(
      `${feature} is not available in local mock mode. Set SOLARI_API_KEY (or FORGEAI_MODE=solari) to use a real Solari browser.`,
    );
    this.name = "NotSupportedError";
  }
}
