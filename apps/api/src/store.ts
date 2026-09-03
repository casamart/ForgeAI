/**
 * In-memory project store (MVP — a database comes later, see docs/database.md).
 *
 * Each "project" is one build attempt. The store starts the Orchestrator in the
 * background, keeps its EventBus (so we can stream events over SSE), and records
 * the final result. All AI/Solari credentials stay here on the server — they are
 * never sent to the browser (SECURITY: keys stay server-side).
 */
import { randomUUID } from "node:crypto";
import { createAIProvider } from "@forgeai/ai";
import {
  Orchestrator,
  createDemoAIProvider,
  createRepairDemoAIProvider,
  DEMO_REQUIREMENT,
  type BuildResult,
} from "@forgeai/orchestrator";
import { EventBus, Logger, type AiProvider } from "@forgeai/shared";

export type ProjectStatus = "running" | "completed" | "failed";

export interface ProjectSummary {
  id: string;
  name: string;
  requirement: string;
  status: ProjectStatus;
  verdict?: string;
  createdAt: number;
  durationMs?: number;
  demo: boolean;
}

interface ProjectRecord extends ProjectSummary {
  bus: EventBus;
  result?: BuildResult;
  error?: string;
}

export interface CreateProjectInput {
  requirement: string;
  name?: string;
  /** Force the offline scripted demo (no API key needed). */
  demo?: boolean;
  /**
   * Which demo storyline to run (demo mode only):
   *  - "happy"  (default) builds cleanly first time,
   *  - "repair" ships a bug so the autonomous repair loop runs live.
   */
  scenario?: "happy" | "repair";
}

export class ProjectStore {
  private projects = new Map<string, ProjectRecord>();
  private nextPort = 3300;

  /** Start a new build and return its record immediately (runs in background). */
  create(input: CreateProjectInput): ProjectRecord {
    const id = randomUUID();
    const bus = new EventBus();

    // Decide the AI provider. If demo is requested, or no real provider is
    // configured, use the offline scripted demo so the pipeline still runs.
    const configured: string | undefined = process.env.FORGEAI_AI_PROVIDER;
    const useDemo =
      input.demo === true ||
      !configured ||
      configured === "mock" ||
      configured === "demo";

    const requirement =
      input.requirement?.trim() || DEMO_REQUIREMENT;

    const record: ProjectRecord = {
      id,
      name: input.name?.trim() || "ForgeAI Project",
      requirement,
      status: "running",
      createdAt: Date.now(),
      demo: useDemo,
      bus,
    };
    this.projects.set(id, record);

    const ai = useDemo
      ? input.scenario === "repair"
        ? createRepairDemoAIProvider()
        : createDemoAIProvider()
      : createAIProvider(configured as AiProvider);
    const logger = new Logger({ scope: `proj:${id.slice(0, 8)}`, bus });
    const orchestrator = new Orchestrator({
      ai,
      // infraMode omitted -> Orchestrator reads FORGEAI_MODE (default "auto").
      projectName: record.name,
      port: this.nextPort++,
      bus,
      logger,
    });

    // Fire and forget — SSE streams progress; the record is updated on finish.
    orchestrator
      .build(requirement)
      .then((result) => {
        record.result = result;
        record.status = result.state === "COMPLETED" ? "completed" : "failed";
        record.verdict = result.review?.status;
        record.durationMs = result.durationMs;
      })
      .catch((err: unknown) => {
        record.status = "failed";
        record.error = (err as Error).message;
        bus.emit("project.failed", `Build crashed: ${(err as Error).message}`);
      });

    return record;
  }

  get(id: string): ProjectRecord | undefined {
    return this.projects.get(id);
  }

  list(): ProjectSummary[] {
    return [...this.projects.values()]
      .map(toSummary)
      .sort((a, b) => b.createdAt - a.createdAt);
  }
}

export function toSummary(r: ProjectRecord): ProjectSummary {
  return {
    id: r.id,
    name: r.name,
    requirement: r.requirement,
    status: r.status,
    verdict: r.verdict,
    createdAt: r.createdAt,
    durationMs: r.durationMs,
    demo: r.demo,
  };
}

/** The full detail view returned by GET /api/projects/:id. */
export function toDetail(r: ProjectRecord) {
  return {
    ...toSummary(r),
    error: r.error,
    report: r.result?.report,
    previewUrl: r.result?.previewUrl,
    unitTests: r.result?.unitTests,
    qa: r.result?.qa
      ? {
          passed: r.result.qa.passed,
          failed: r.result.qa.failed,
          blocked: r.result.qa.blocked,
          inconclusive: r.result.qa.inconclusive,
          bugs: r.result.qa.bugs,
        }
      : undefined,
    review: r.result?.review,
    plan: r.result?.plan,
    criteria: r.result?.criteria,
    traceability: r.result?.traceability,
    eventCount: r.bus.history().length,
  };
}

export type { ProjectRecord };
