/**
 * The workflow state machine (ARCHITECTURE §6, spec §11).
 *
 * The Orchestrator moves a build through these states in order, looping back to
 * DEBUGGING when tests or QA fail, and ending in a terminal state.
 */
export type WorkflowState =
  | "CREATED"
  | "PLANNING"
  | "SANDBOX_CREATING"
  | "IMPLEMENTING"
  | "UNIT_TESTING"
  | "DEBUGGING"
  | "APP_STARTING"
  | "BROWSER_QA"
  | "FINAL_REVIEW"
  | "COMPLETED"
  | "FAILED";

// The states that mean "we are done" (nothing runs after these).
export const TERMINAL_STATES: WorkflowState[] = ["COMPLETED", "FAILED"];

export function isTerminal(state: WorkflowState): boolean {
  return TERMINAL_STATES.includes(state);
}
