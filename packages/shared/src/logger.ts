/**
 * Timestamped console logger matching the spec's log format (§30):
 *   04:31:04 Creating sandbox
 *
 * Optionally mirrors every line into an EventBus as a `log` event so the
 * dashboard and the terminal always agree.
 */
import type { EventBus } from "./events.js";

const COLORS = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
} as const;

type Level = "info" | "success" | "warn" | "error" | "step";

const LEVEL_COLOR: Record<Level, string> = {
  info: COLORS.cyan,
  success: COLORS.green,
  warn: COLORS.yellow,
  error: COLORS.red,
  step: COLORS.magenta,
};

const LEVEL_MARK: Record<Level, string> = {
  info: "•",
  success: "✓",
  warn: "⚠",
  error: "✗",
  step: "→",
};

function clock(): string {
  return new Date().toTimeString().slice(0, 8);
}

export interface LoggerOptions {
  /** Prefix shown in dim before each message, e.g. an agent name. */
  scope?: string;
  /** Mirror log lines into this bus as `log` events. */
  bus?: EventBus;
  /** Disable ANSI colors (e.g. when piping to a file). */
  noColor?: boolean;
}

export class Logger {
  private scope?: string;
  private bus?: EventBus;
  private noColor: boolean;

  constructor(opts: LoggerOptions = {}) {
    this.scope = opts.scope;
    this.bus = opts.bus;
    this.noColor = opts.noColor ?? !process.stdout.isTTY;
  }

  child(scope: string): Logger {
    return new Logger({ scope, bus: this.bus, noColor: this.noColor });
  }

  private paint(color: string, text: string): string {
    return this.noColor ? text : `${color}${text}${COLORS.reset}`;
  }

  private write(level: Level, message: string): void {
    const mark = this.paint(LEVEL_COLOR[level], LEVEL_MARK[level]);
    const time = this.paint(COLORS.dim, clock());
    const scope = this.scope
      ? this.paint(COLORS.dim, `[${this.scope}] `)
      : "";
    const line = `${time} ${mark} ${scope}${message}`;
    if (level === "error") console.error(line);
    else console.log(line);
    this.bus?.emit("log", message, { level, scope: this.scope });
  }

  info(message: string): void {
    this.write("info", message);
  }
  success(message: string): void {
    this.write("success", message);
  }
  warn(message: string): void {
    this.write("warn", message);
  }
  error(message: string): void {
    this.write("error", message);
  }
  step(message: string): void {
    this.write("step", message);
  }
}
