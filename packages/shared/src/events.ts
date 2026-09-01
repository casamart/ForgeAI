/**
 * Canonical ForgeAI event stream (spec §25 / §30).
 *
 * Every meaningful operation emits one of these. The same stream drives the
 * dashboard, the logs, and the final report — so it is the single source of
 * truth for "what actually happened", supporting the core principle:
 * evidence over AI claims (spec §51).
 */

export type ForgeEventType =
  | "sandbox.created"
  | "sandbox.destroyed"
  | "agent.started"
  | "agent.finished"
  | "file.created"
  | "file.modified"
  | "command.started"
  | "command.completed"
  | "test.started"
  | "test.passed"
  | "test.failed"
  | "bug.detected"
  | "fix.started"
  | "fix.completed"
  | "server.started"
  | "preview.ready"
  | "qa.started"
  | "qa.step"
  | "qa.passed"
  | "qa.failed"
  | "review.started"
  | "review.completed"
  | "project.completed"
  | "project.failed"
  | "log";

export interface ForgeEvent {
  /** Monotonic id assigned by the emitter. */
  id: number;
  type: ForgeEventType;
  /** Short human-readable message (what shows up in the live log). */
  message: string;
  /** Millisecond epoch timestamp. */
  ts: number;
  /** Arbitrary structured payload (test counts, exit codes, urls, …). */
  metadata?: Record<string, unknown>;
}

export type ForgeEventListener = (event: ForgeEvent) => void;

/**
 * Tiny synchronous event bus. Deliberately dependency-free so every package
 * can share it. In the API layer these events are fanned out over SSE.
 */
export class EventBus {
  private seq = 0;
  private listeners = new Set<ForgeEventListener>();
  private log: ForgeEvent[] = [];

  on(listener: ForgeEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(
    type: ForgeEventType,
    message: string,
    metadata?: Record<string, unknown>,
  ): ForgeEvent {
    const event: ForgeEvent = {
      id: ++this.seq,
      type,
      message,
      ts: Date.now(),
      metadata,
    };
    this.log.push(event);
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // A broken listener must never break the pipeline.
      }
    }
    return event;
  }

  /** Full ordered history — the raw material for the final report. */
  history(): readonly ForgeEvent[] {
    return this.log;
  }
}
