/**
 * In-memory implementations of the repositories (§25).
 *
 * Fully functional and used by default. Because everything goes through the
 * repository interfaces, swapping in a PostgreSQL implementation later is a
 * drop-in change with no edits to the API routes or the store.
 */
import type { ForgeEvent } from "@forgeai/shared";
import type {
  EventRepository,
  ProjectRepository,
  StoredProject,
} from "./types.js";

export class InMemoryProjectRepository implements ProjectRepository {
  private map = new Map<string, StoredProject>();

  async create(project: StoredProject): Promise<void> {
    this.map.set(project.id, { ...project });
  }

  async update(id: string, patch: Partial<StoredProject>): Promise<void> {
    const current = this.map.get(id);
    if (current) this.map.set(id, { ...current, ...patch });
  }

  async get(id: string): Promise<StoredProject | undefined> {
    const p = this.map.get(id);
    return p ? { ...p } : undefined;
  }

  async list(): Promise<StoredProject[]> {
    return [...this.map.values()]
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((p) => ({ ...p }));
  }
}

export class InMemoryEventRepository implements EventRepository {
  private map = new Map<string, ForgeEvent[]>();

  async append(projectId: string, event: ForgeEvent): Promise<void> {
    const arr = this.map.get(projectId);
    if (arr) arr.push(event);
    else this.map.set(projectId, [event]);
  }

  async list(projectId: string, sinceId = 0): Promise<ForgeEvent[]> {
    return (this.map.get(projectId) ?? []).filter((e) => e.id > sinceId);
  }

  async count(projectId: string): Promise<number> {
    return (this.map.get(projectId) ?? []).length;
  }
}
