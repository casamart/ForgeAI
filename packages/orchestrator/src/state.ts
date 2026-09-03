/**
 * The workflow state machine (ARCHITECTURE §6, spec §11, plan §50/§51).
 *
 * The Orchestrator moves a build through these states, looping back to
 * DEBUGGING → REGRESSION_TESTING when tests or QA fail, ending in a terminal
 * state. Transitions are GUARDED: impossible jumps (e.g. COMPLETED → DEBUGGING)
 * are rejected, so a corrupted run can't silently continue (§51).
 */
export type WorkflowState =
  | "CREATED"
  | "PLANNING"
  | "SANDBOX_CREATING"
  | "IMPLEMENTING"
  | "BUILDING"
  | "UNIT_TESTING"
  | "DEBUGGING"
  | "REGRESSION_TESTING"
  | "APP_STARTING"
  | "BROWSER_QA"
  | "EVIDENCE_COLLECTION"
  | "FINAL_REVIEW"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLING"
  | "CANCELLED";

// The states that mean "we are done" (nothing runs after these).
export const TERMINAL_STATES: WorkflowState[] = ["COMPLETED", "FAILED", "CANCELLED"];

export function isTerminal(state: WorkflowState): boolean {
  return TERMINAL_STATES.includes(state);
}

// The "happy path" successors for each active state. FAILED and CANCELLING are
// reachable from EVERY active state (added automatically below), so they are
// not listed here.
const BASE_TRANSITIONS: Record<WorkflowState, WorkflowState[]> = {
  CREATED: ["PLANNING"],
  PLANNING: ["SANDBOX_CREATING"],
  SANDBOX_CREATING: ["IMPLEMENTING"],
  IMPLEMENTING: ["BUILDING", "UNIT_TESTING"],
  BUILDING: ["UNIT_TESTING", "DEBUGGING"],
  UNIT_TESTING: ["DEBUGGING", "APP_STARTING"],
  DEBUGGING: ["REGRESSION_TESTING", "UNIT_TESTING", "BROWSER_QA"],
  REGRESSION_TESTING: ["UNIT_TESTING", "BROWSER_QA", "APP_STARTING"],
  APP_STARTING: ["BROWSER_QA"],
  BROWSER_QA: ["DEBUGGING", "EVIDENCE_COLLECTION", "FINAL_REVIEW"],
  EVIDENCE_COLLECTION: ["FINAL_REVIEW"],
  FINAL_REVIEW: ["COMPLETED"],
  CANCELLING: ["CANCELLED"],
  // Terminal states have no successors.
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
};

// Build the full graph: any non-terminal state may also go to FAILED, and any
// active (non-terminal, non-CANCELLING) state may go to CANCELLING.
export const TRANSITIONS: Record<WorkflowState, WorkflowState[]> = Object.fromEntries(
  (Object.keys(BASE_TRANSITIONS) as WorkflowState[]).map((from) => {
    const next = new Set(BASE_TRANSITIONS[from]);
    if (!isTerminal(from)) next.add("FAILED");
    if (!isTerminal(from) && from !== "CANCELLING") next.add("CANCELLING");
    return [from, [...next]];
  }),
) as Record<WorkflowState, WorkflowState[]>;

/** Is moving from → to allowed? A no-op (from === to) is always allowed. */
export function canTransition(from: WorkflowState, to: WorkflowState): boolean {
  if (from === to) return true;
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/** Throw if a transition is illegal (§51). */
export function assertTransition(from: WorkflowState, to: WorkflowState): void {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal state transition: ${from} → ${to}`);
  }
}
