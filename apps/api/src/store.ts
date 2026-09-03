/**
 * Project store — the API's use-case layer over the repositories (§24/§25).
 *
 * Persistence goes through ProjectRepository + EventRepository (in-memory by
 * default, Postgres-ready later). Live handles for a running build — its
 * EventBus and Orchestrator — are NOT persistable, so they are kept in a
 * runtime-only map here. All AI/Solari credentials stay server-side; they never
 * reach the browser.
 */
import { randomUUID } from "node:crypto";
import { createAIProvider } from "@forgeai/ai";
import {
  Orchestrator,
  createDemoAIProvider,
  createRepairDemoAIProvider,
  DEMO_REQUIREMENT,
} from "@forgeai/orchestrator";
import { EventBus, Logger, type AiProvider, type ForgeEvent } from "@forgeai/shared";
import {
  InMemoryEventRepository,
  InMemoryProjectRepository,
  type EventRepository,
  type ProjectRepository,
  type ProjectStatus,
  type StoredProject,
} from "./repositories/index.js";

export type { ProjectStatus, StoredProject };

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

// Runtime-only handles for a build (never persisted).
interface LiveHandles {
  bus: EventBus;
  orchestrator: Orchestrator;
}

export class ProjectStore {
  private nextPort = 3300;
  private live = new Map<string, LiveHandles>();

  constructor(
    private projects: ProjectRepository = new InMemoryProjectRepository(),
    private events: EventRepository = new InMemoryEventRepository(),
  ) {}

  /** Start a new build; returns the stored project immediately (runs in background). */
  async create(input: CreateProjectInput): Promise<StoredProject> {
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

    const requirement = input.requirement?.trim() || DEMO_REQUIREMENT;
    const name = input.name?.trim() || "ForgeAI Project";

    const ai = useDemo
      ? input.scenario === "repair"
        ? createRepairDemoAIProvider()
        : createDemoAIProvider()
      : createAIProvider(configured as AiProvider);

    const logger = new Logger({ scope: `proj:${id.slice(0, 8)}`, bus });
    const orchestrator = new Orchestrator({
      ai,
      // infraMode omitted -> Orchestrator reads FORGEAI_MODE (default "auto").
      projectName: name,
      port: this.nextPort++,
      bus,
      logger,
    });

    const stored: StoredProject = {
      id,
      name,
      requirement,
      status: "running",
      createdAt: Date.now(),
      demo: useDemo,
    };
    await this.projects.create(stored);
    this.live.set(id, { bus, orchestrator });

    // §24: persist every event as it happens, then it is broadcast over SSE.
    bus.on((e: ForgeEvent) => {
      void this.events.append(id, e);
    });

    // Fire and forget — SSE streams progress; the record is updated on finish.
    orchestrator
      .build(requirement)
      .then((result) => {
        const status: ProjectStatus =
          result.state === "COMPLETED"
            ? "completed"
            : result.state === "CANCELLED"
              ? "cancelled"
              : "failed";
        void this.projects.update(id, {
          result,
          status,
          verdict: result.review?.status,
          durationMs: result.durationMs,
        });
      })
      .catch((err: unknown) => {
        void this.projects.update(id, { status: "failed", error: (err as Error).message });
        bus.emit("project.failed", `Build crashed: ${(err as Error).message}`);
      });

    return stored;
  }

  async get(id: string): Promise<StoredProject | undefined> {
    return this.projects.get(id);
  }

  async list(): Promise<ProjectSummary[]> {
    return (await this.projects.list()).map(toSummary);
  }

  /** The full detail view returned by GET /api/projects/:id. */
  async detail(id: string): Promise<ReturnType<typeof toDetail> | undefined> {
    const p = await this.projects.get(id);
    if (!p) return undefined;
    return toDetail(p, await this.events.count(id));
  }

  /** Replay persisted events (so a reconnecting client gets full history, §24). */
  async eventsSince(id: string, sinceId = 0): Promise<ForgeEvent[]> {
    return this.events.list(id, sinceId);
  }

  /** The live EventBus for an in-progress build (undefined once it has finished). */
  liveBus(id: string): EventBus | undefined {
    return this.live.get(id)?.bus;
  }

  /** Request cooperative cancellation of a running build (§22). */
  async cancel(id: string): Promise<{ ok: boolean; status: ProjectStatus } | undefined> {
    const p = await this.projects.get(id);
    if (!p) return undefined;
    if (p.status === "running") this.live.get(id)?.orchestrator.cancel();
    return { ok: p.status === "running", status: p.status };
  }
}

export function toSummary(p: StoredProject): ProjectSummary {
  return {
    id: p.id,
    name: p.name,
    requirement: p.requirement,
    status: p.status,
    verdict: p.verdict,
    createdAt: p.createdAt,
    durationMs: p.durationMs,
    demo: p.demo,
  };
}

export function toDetail(p: StoredProject, eventCount: number) {
  return {
    ...toSummary(p),
    error: p.error,
    report: p.result?.report,
    previewUrl: p.result?.previewUrl,
    unitTests: p.result?.unitTests,
    qa: p.result?.qa
      ? {
          passed: p.result.qa.passed,
          failed: p.result.qa.failed,
          blocked: p.result.qa.blocked,
          inconclusive: p.result.qa.inconclusive,
          bugs: p.result.qa.bugs,
        }
      : undefined,
    review: p.result?.review,
    plan: p.result?.plan,
    criteria: p.result?.criteria,
    traceability: p.result?.traceability,
    evidence: p.result?.evidence,
    eventCount,
  };
}
