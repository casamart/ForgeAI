// Public surface of @forgeai/orchestrator.
export { Orchestrator } from "./orchestrator.js";
export type { OrchestratorOptions, BuildResult } from "./orchestrator.js";
export {
  type WorkflowState,
  TERMINAL_STATES,
  TRANSITIONS,
  isTerminal,
  canTransition,
  assertTransition,
} from "./state.js";
export {
  projectConventions,
  TEST_COMMAND,
  START_COMMAND,
} from "./conventions.js";
export { parseTestOutput, type TestCounts } from "./test-parser.js";
export {
  createDemoAIProvider,
  createRepairDemoAIProvider,
  createBehavioralDemoAIProvider,
  DEMO_REQUIREMENT,
  WEB_REQUIREMENT,
} from "./demo.js";
