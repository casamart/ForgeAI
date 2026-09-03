/**
 * Repository abstraction (plan §25).
 *
 * The API talks to these interfaces, never to a specific storage engine. Today
 * they are backed by in-memory maps (memory.ts); a PostgreSQL implementation
 * can be dropped in later without the API knowing any SQL. Event persistence
 * (§24) means a reconnecting client can always replay the full history.
 *
 * Repositories store only SERIALIZABLE data. Live handles (the EventBus and
 * Orchestrator for a running build) stay in the API layer, not here.
 */
import type { ForgeEvent } from "@forgeai/shared";
import type { BuildResult } from "@forgeai/orchestrator";

export type ProjectStatus = "running" | "completed" | "failed" | "cancelled";

export interface StoredProject {
  id: string;
  name: string;
  requirement: string;
  status: ProjectStatus;
  verdict?: string;
  createdAt: number;
  durationMs?: number;
  demo: boolean;
  error?: string;
  /** The finished build result (present once the run ends). */
  result?: BuildResult;
}

export interface ProjectRepository {
  create(project: StoredProject): Promise<void>;
  update(id: string, patch: Partial<StoredProject>): Promise<void>;
  get(id: string): Promise<StoredProject | undefined>;
  /** Newest first. */
  list(): Promise<StoredProject[]>;
}

export interface EventRepository {
  /** Persist one event for a project (§24: store, then broadcast). */
  append(projectId: string, event: ForgeEvent): Promise<void>;
  /** Ordered events with id > sinceId (default 0 → all). */
  list(projectId: string, sinceId?: number): Promise<ForgeEvent[]>;
  count(projectId: string): Promise<number>;
}
