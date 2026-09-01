/**
 * The Developer Agent.
 *
 * It runs a simple, bounded loop:
 *
 *     ask the AI for ONE action  ->  do it in the sandbox  ->  observe result
 *     -> feed the observation back  ->  repeat, until "done" or a step limit.
 *
 * This is the classic "observe / act / observe" agent loop (AGENTS §11), kept
 * deliberately small and readable. Everything it does is real (files written,
 * commands run) and recorded as evidence — it can never just claim success.
 */
import type { ChatMessage } from "@forgeai/ai";
import type { CommandResult } from "@forgeai/solari";
import type { AgentContext } from "../types.js";
import {
  DeveloperActionSchema,
  DEVELOPER_ACTION_HINT,
  type DeveloperAction,
} from "./schema.js";
import { DEVELOPER_SYSTEM_PROMPT } from "./prompt.js";

/** What we ask the Developer Agent to build. */
export interface DeveloperTask {
  /** The overall requirement, in plain language. */
  requirement: string;
  /** Optional subtasks from the Architect agent. */
  tasks?: string[];
  /** How many action-steps the agent may take before we stop it (safety). */
  maxSteps?: number;
}

/** One recorded step: the action taken and what we observed afterwards. */
export interface DeveloperStep {
  index: number;
  action: DeveloperAction;
  observation: string;
  /** Present only for "run" actions. */
  command?: CommandResult;
}

export type DeveloperStatus =
  | "completed" // the AI called "done"
  | "stopped_step_limit" // ran out of allowed steps
  | "error"; // something threw

export interface DeveloperResult {
  status: DeveloperStatus;
  summary: string;
  filesWritten: string[];
  steps: DeveloperStep[];
  /** The most recent command result (often the test run). */
  lastCommand?: CommandResult;
}

// Keep observations short so the conversation does not grow without bound.
const MAX_OBSERVATION_CHARS = 2000;
function truncate(text: string): string {
  if (text.length <= MAX_OBSERVATION_CHARS) return text;
  return text.slice(0, MAX_OBSERVATION_CHARS) + "\n…(truncated)";
}

export class DeveloperAgent {
  constructor(private ctx: AgentContext) {}

  // Turn a workspace-relative path into an absolute sandbox path.
  private resolve(path: string): string {
    if (path.startsWith("/")) return path;
    const root = this.ctx.workspace.replace(/\/+$/, "");
    return `${root}/${path.replace(/^\/+/, "")}`;
  }

  async implement(task: DeveloperTask): Promise<DeveloperResult> {
    const { ai, sandbox, bus, logger } = this.ctx;
    const maxSteps = task.maxSteps ?? 12;
    const steps: DeveloperStep[] = [];
    const filesWritten = new Set<string>();
    let lastCommand: CommandResult | undefined;

    bus.emit("agent.started", "Developer agent started", { agent: "developer" });
    logger.step("Developer agent started");

    // The conversation the AI sees. It starts with the role + the task, and
    // grows by one action + one observation each step.
    const taskText =
      `Requirement:\n${task.requirement}\n\n` +
      (task.tasks?.length
        ? `Planned tasks:\n- ${task.tasks.join("\n- ")}\n\n`
        : "") +
      `The project root is "${this.ctx.workspace}". Begin.`;

    const messages: ChatMessage[] = [
      { role: "system", content: DEVELOPER_SYSTEM_PROMPT },
      { role: "user", content: taskText },
    ];

    try {
      for (let i = 1; i <= maxSteps; i++) {
        // 1. Ask the AI for ONE action (validated + auto-repaired to our schema).
        const { data: action, raw } = await ai.structuredOutput(
          messages,
          DeveloperActionSchema,
          { schemaHint: DEVELOPER_ACTION_HINT, maxTokens: 4096 },
        );

        // 2. Do it, and build an observation string describing the result.
        const { observation, command } = await this.execute(action);
        if (action.tool === "writeFile") filesWritten.add(action.path);
        if (command) lastCommand = command;
        steps.push({ index: i, action, observation, command });

        // 3. If the AI says it is finished, stop the loop.
        if (action.tool === "done") {
          bus.emit("agent.finished", "Developer agent finished", {
            agent: "developer",
            steps: i,
          });
          logger.success(`Developer agent finished: ${action.summary}`);
          return {
            status: "completed",
            summary: action.summary,
            filesWritten: [...filesWritten],
            steps,
            lastCommand,
          };
        }

        // 4. Otherwise, record the exchange and continue to the next step.
        messages.push({ role: "assistant", content: raw });
        messages.push({ role: "user", content: `OBSERVATION:\n${observation}` });
      }

      // Ran out of steps without a "done".
      logger.warn(`Developer agent hit the step limit (${maxSteps}).`);
      bus.emit("agent.finished", "Developer agent stopped at step limit", {
        agent: "developer",
        steps: maxSteps,
      });
      return {
        status: "stopped_step_limit",
        summary: `Stopped after ${maxSteps} steps without finishing.`,
        filesWritten: [...filesWritten],
        steps,
        lastCommand,
      };
    } catch (err) {
      logger.error(`Developer agent error: ${(err as Error).message}`);
      bus.emit("project.failed", "Developer agent errored", {
        agent: "developer",
        error: (err as Error).message,
      });
      return {
        status: "error",
        summary: (err as Error).message,
        filesWritten: [...filesWritten],
        steps,
        lastCommand,
      };
    }
  }

  /** Carry out a single action against the sandbox and describe what happened. */
  private async execute(
    action: DeveloperAction,
  ): Promise<{ observation: string; command?: CommandResult }> {
    const { sandbox, bus, logger } = this.ctx;

    switch (action.tool) {
      case "writeFile": {
        const full = this.resolve(action.path);
        await sandbox.writeFile(full, action.content);
        bus.emit("file.created", `Wrote ${action.path}`, { path: full });
        logger.info(`wrote ${action.path} (${action.content.length} bytes)`);
        return {
          observation: `Wrote ${action.content.length} bytes to ${action.path}.`,
        };
      }

      case "readFile": {
        try {
          const content = await sandbox.readFile(this.resolve(action.path));
          return { observation: `Contents of ${action.path}:\n${truncate(content)}` };
        } catch (err) {
          return { observation: `Could not read ${action.path}: ${(err as Error).message}` };
        }
      }

      case "listFiles": {
        try {
          const entries = await sandbox.listDir(this.resolve(action.path));
          const names = entries
            .map((e) => (e.type === "dir" ? `${e.name}/` : e.name))
            .join("  ");
          return { observation: `Files in ${action.path}: ${names || "(empty)"}` };
        } catch (err) {
          return { observation: `Could not list ${action.path}: ${(err as Error).message}` };
        }
      }

      case "run": {
        bus.emit("command.started", `$ ${action.command}`, { command: action.command });
        logger.info(`$ ${action.command}`);
        const result = await sandbox.runShell(action.command, {
          cwd: this.ctx.workspace,
        });
        bus.emit("command.completed", `exit ${result.exitCode}`, {
          command: action.command,
          exitCode: result.exitCode,
        });
        const out = [
          `Command: ${action.command}`,
          `Exit code: ${result.exitCode}`,
          result.stdout ? `stdout:\n${result.stdout}` : "",
          result.stderr ? `stderr:\n${result.stderr}` : "",
        ]
          .filter(Boolean)
          .join("\n");
        return { observation: truncate(out), command: result };
      }

      case "done":
        return { observation: "done" };
    }
  }
}
