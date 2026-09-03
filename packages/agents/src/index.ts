// Public surface of @forgeai/agents.
export * from "./types.js";

// --- Architect agent ---
export { ArchitectAgent } from "./architect/architect-agent.js";
export type {
  ArchitectContext,
  ArchitectResult,
} from "./architect/architect-agent.js";
export {
  ArchitectPlanSchema,
  planToDeveloperTasks,
  type ArchitectPlan,
  type Task,
  type TestCase,
} from "./architect/schema.js";
export { ARCHITECT_SYSTEM_PROMPT } from "./architect/prompt.js";

// --- Browser action model + journey runner (§8, §9) ---
export {
  TargetSchema,
  BrowserActionSchema,
  BrowserActionsSchema,
  BrowserJourneySchema,
  BROWSER_ACTIONS_HINT,
  targetToSelector,
  describeTarget,
  describeAction,
  type Target,
  type BrowserAction,
  type BrowserJourney,
} from "./browser/actions.js";
export {
  runJourney,
  type JourneyResult,
  type StepResult,
  type StepStatus,
  type RunJourneyOptions,
} from "./browser/journey-runner.js";

// --- Evidence model (§15/§16): first-class, hashed, immutable artifacts ---
export {
  createEvidence,
  EvidenceLog,
  collectQAEvidence,
  type EvidenceType,
  type EvidenceItem,
  type EvidenceInput,
} from "./evidence.js";

// --- Requirement traceability (AC → test → bug → repair → evidence) ---
export {
  assignCriteriaIds,
  buildTraceability,
  renderTraceabilityMatrix,
  traceabilitySummary,
  type AcceptanceCriterion,
  type ACStatus,
  type TraceRow,
  type ResolvedBug,
  type TraceabilityInput,
} from "./traceability.js";

// --- QA agent ---
export { QAAgent } from "./qa/qa-agent.js";
export type { QAContext, QARunParams } from "./qa/qa-agent.js";
export {
  QACheckSchema,
  QAChecksSchema,
  type QACheck,
  type QAVerdict,
  type QACheckResult,
  type QAReport,
  type Bug,
  type Evidence,
} from "./qa/schema.js";
export { QA_SYSTEM_PROMPT } from "./qa/prompt.js";

// --- Debugger agent + repair loop ---
export { DebuggerAgent } from "./debugger/debugger-agent.js";
export type { DebuggerContext } from "./debugger/debugger-agent.js";
export {
  DiagnosisSchema,
  type Diagnosis,
  type FailureContext,
} from "./debugger/schema.js";
export { DEBUGGER_SYSTEM_PROMPT } from "./debugger/prompt.js";
export { runRepairLoop } from "./repair/repair-loop.js";
export type {
  RepairOptions,
  RepairResult,
  RepairStopReason,
  VerifyOutcome,
} from "./repair/repair-loop.js";
export {
  classifyFailure,
  failureSignature,
  type FailureCategory,
} from "./failures.js";

// --- Reviewer agent + final report ---
export { ReviewerAgent } from "./reviewer/reviewer-agent.js";
export type { ReviewerContext } from "./reviewer/reviewer-agent.js";
export {
  ReviewAssessmentSchema,
  type ReviewInput,
  type ReviewResult,
  type ReviewStatus,
} from "./reviewer/schema.js";
export { REVIEWER_SYSTEM_PROMPT } from "./reviewer/prompt.js";
export { renderFinalReport, type ReportMeta } from "./reviewer/report.js";

// --- Developer agent ---
export { DeveloperAgent } from "./developer/developer-agent.js";
export type {
  DeveloperTask,
  DeveloperResult,
  DeveloperStep,
  DeveloperStatus,
} from "./developer/developer-agent.js";
export {
  DeveloperActionSchema,
  type DeveloperAction,
} from "./developer/schema.js";
export { DEVELOPER_SYSTEM_PROMPT } from "./developer/prompt.js";
