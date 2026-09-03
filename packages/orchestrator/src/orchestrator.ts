/**
 * The Orchestrator — ForgeAI's conductor.
 *
 * It takes ONE natural-language requirement and runs the whole pipeline:
 *
 *   PLANNING → SANDBOX → IMPLEMENTING → UNIT_TESTING (↻ DEBUGGING)
 *            → APP_STARTING → BROWSER_QA (↻ DEBUGGING) → FINAL_REVIEW → COMPLETED
 *
 * It owns the workflow state, the Solari resources (sandbox + browser), the
 * retry limits, and cleanup. It is the ONLY component that drives the agents,
 * and it turns their work into a final, evidence-backed engineering report.
 *
 * It runs unchanged against real Solari or the local mock — same as every other
 * ForgeAI component — because it only ever touches the @forgeai/solari
 * abstraction, never the Solari SDK directly.
 */
import type { AIProvider } from "@forgeai/ai";
import {
  ArchitectAgent,
  DeveloperAgent,
  QAAgent,
  DebuggerAgent,
  ReviewerAgent,
  runRepairLoop,
  planToDeveloperTasks,
  renderFinalReport,
  assignCriteriaIds,
  buildTraceability,
  renderTraceabilityMatrix,
  traceabilitySummary,
  EvidenceLog,
  collectQAEvidence,
  type EvidenceItem,
  type ArchitectPlan,
  type QACheck,
  type QAReport,
  type ReviewResult,
  type FailureContext,
  type AcceptanceCriterion,
  type ResolvedBug,
  type TraceRow,
} from "@forgeai/agents";
import {
  createSolariProvider,
  type IBrowser,
  type ISandbox,
  type ISolariProvider,
} from "@forgeai/solari";
import {
  EventBus,
  Logger,
  loadConfig,
  resolveInfraMode,
  type ForgeEvent,
  type InfraMode,
  type ResourceLimits,
} from "@forgeai/shared";
import { isTerminal, assertTransition, type WorkflowState } from "./state.js";
import { projectConventions, TEST_COMMAND, START_COMMAND } from "./conventions.js";
import { parseTestOutput } from "./test-parser.js";

export interface OrchestratorOptions {
  ai: AIProvider;
  infraMode?: InfraMode;
  limits?: Partial<ResourceLimits>;
  bus?: EventBus;
  logger?: Logger;
  projectName?: string;
  /** Port the generated app listens on. */
  port?: number;
  /** Project root inside the sandbox. */
  workspace?: string;
}

export interface BuildResult {
  state: WorkflowState;
  projectName: string;
  infraMode: "solari" | "local";
  plan?: ArchitectPlan;
  unitTests: { passed: number; failed: number };
  qa?: QAReport;
  review?: ReviewResult;
  previewUrl?: string;
  report: string;
  events: readonly ForgeEvent[];
  durationMs: number;
  /** Acceptance criteria with stable ids (AC-001…). */
  criteria?: AcceptanceCriterion[];
  /** Per-criterion traceability: test → verdict → bug → repair → evidence. */
  traceability?: TraceRow[];
  /** First-class, hashed evidence artifacts collected this run (§15/§16). */
  evidence?: EvidenceItem[];
}

// Poll a URL until it responds OK, so QA never gets an unready server (arch §23).
async function waitForHttp(url: string, tries = 20): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    try {
      if ((await fetch(url)).ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

export class Orchestrator {
  private ai: AIProvider;
  private bus: EventBus;
  private logger: Logger;
  private limits: ResourceLimits;
  private infraMode: InfraMode;
  private projectName: string;
  private port: number;
  private workspace: string;

  private state: WorkflowState = "CREATED";
  private startedAt = 0;
  private cancelRequested = false;
  private criteria: AcceptanceCriterion[] = [];
  private resolvedBugs: ResolvedBug[] = [];
  private lastUnitOutput = "";
  private runId = "";

  constructor(opts: OrchestratorOptions) {
    const cfg = loadConfig();
    this.ai = opts.ai;
    this.bus = opts.bus ?? new EventBus();
    this.logger = opts.logger ?? new Logger({ scope: "orchestrator", bus: this.bus });
    this.limits = { ...cfg.limits, ...opts.limits };
    this.infraMode = opts.infraMode ?? cfg.infraMode;
    this.projectName = opts.projectName ?? "ForgeAI Project";
    this.port = opts.port ?? 3000;
    this.workspace = opts.workspace ?? "/workspace/project";
  }

  /** Read-only access to the event stream (used by the dashboard/API). */
  get eventBus(): EventBus {
    return this.bus;
  }

  private setState(state: WorkflowState): void {
    // Reject impossible transitions so a corrupted run can't continue (§51).
    assertTransition(this.state, state);
    this.state = state;
    this.logger.step(`state → ${state}`);
    this.bus.emit("log", `state → ${state}`, { state });
  }

  private overBudget(): boolean {
    return Date.now() - this.startedAt > this.limits.maxBuildTimeMs;
  }

  /**
   * Request cooperative cancellation (§22). The build checks this at phase
   * boundaries, then transitions CANCELLING → cleanup → CANCELLED.
   */
  cancel(): void {
    if (isTerminal(this.state)) return;
    this.cancelRequested = true;
    this.bus.emit("log", "Cancellation requested", { state: this.state });
    this.logger.warn("Cancellation requested — will stop at the next checkpoint.");
  }

  /** Run the full build for one requirement. Always cleans up its resources. */
  async build(requirement: string): Promise<BuildResult> {
    this.startedAt = Date.now();
    this.criteria = [];
    this.resolvedBugs = [];
    this.lastUnitOutput = "";
    this.runId = `run-${Date.now().toString(36)}`;
    const resolvedMode = resolveInfraMode(this.infraMode);
    const { provider } = createSolariProvider(this.infraMode);

    let sandbox: ISandbox | undefined;
    let browser: IBrowser | undefined;
    let plan: ArchitectPlan | undefined;
    let qa: QAReport | undefined;
    let review: ReviewResult | undefined;
    let previewUrl: string | undefined;
    let unitTests = { passed: 0, failed: 0 };

    const conventions = projectConventions(this.workspace, this.port);

    try {
      // 1. PLANNING --------------------------------------------------------
      this.setState("PLANNING");
      const architect = new ArchitectAgent({ ai: this.ai, bus: this.bus, logger: this.logger });
      plan = (await architect.plan(`${requirement}\n\n${conventions}`)).plan;
      this.criteria = assignCriteriaIds(plan.acceptanceCriteria);

      // 2. SANDBOX ---------------------------------------------------------
      this.setState("SANDBOX_CREATING");
      sandbox = await provider.createSandbox({ template: "base" });
      await sandbox.connect();
      this.bus.emit("sandbox.created", `Sandbox ${sandbox.id}`, { id: sandbox.id });

      if (this.cancelRequested) {
        this.setState("CANCELLING");
        return this.finish("CANCELLED", { provider, sandbox, browser }, { plan, unitTests, qa, review, previewUrl, resolvedMode });
      }

      // 3. IMPLEMENTING ----------------------------------------------------
      this.setState("IMPLEMENTING");
      const developer = new DeveloperAgent({
        ai: this.ai,
        sandbox,
        bus: this.bus,
        logger: this.logger,
        workspace: this.workspace,
      });
      await developer.implement({
        requirement: `${requirement}\n\n${conventions}`,
        tasks: planToDeveloperTasks(plan),
      });

      // 4. UNIT TESTING (with a bounded repair loop) -----------------------
      this.setState("UNIT_TESTING");
      const runUnitTests = async () => {
        const res = await sandbox!.runShell(TEST_COMMAND, { cwd: this.workspace });
        const counts = parseTestOutput(res);
        unitTests = counts;
        this.lastUnitOutput = `${res.stdout}\n${res.stderr}`.trim();
        const passed = res.exitCode === 0 && counts.failed === 0;
        this.bus.emit(passed ? "test.passed" : "test.failed", `Unit tests: ${counts.passed} passed, ${counts.failed} failed`, { passed: counts.passed, failed: counts.failed });
        return { passed, res, counts };
      };

      let unit = await runUnitTests();
      if (!unit.passed) {
        this.setState("DEBUGGING");
        const repaired = await runRepairLoop({
          debuggerAgent: new DebuggerAgent({ ai: this.ai, bus: this.bus, logger: this.logger }),
          developer,
          failure: {
            kind: "unit_test",
            summary: `${unit.counts.failed} unit test(s) failed`,
            details: `${unit.res.stdout}\n${unit.res.stderr}`.trim(),
            relevantFiles: ["server.js"],
          },
          verify: async () => {
            this.setState("REGRESSION_TESTING");
            const r = await runUnitTests();
            return {
              passed: r.passed,
              evidence: `unit ${r.counts.passed} passed / ${r.counts.failed} failed`,
              failure: r.passed
                ? undefined
                : {
                    kind: "unit_test",
                    summary: `${r.counts.failed} unit test(s) still failing`,
                    details: `${r.res.stdout}\n${r.res.stderr}`.trim(),
                    relevantFiles: ["server.js"],
                  },
            };
          },
          maxAttempts: this.limits.maxRepairAttempts,
          bus: this.bus,
          logger: this.logger,
        });
        if (!repaired.repaired) {
          return this.finish("FAILED", { provider, sandbox, browser }, { plan, unitTests, qa, review, previewUrl, resolvedMode });
        }
        this.setState("UNIT_TESTING");
      }

      if (this.overBudget()) {
        return this.finish("FAILED", { provider, sandbox, browser }, { plan, unitTests, qa, review, previewUrl, resolvedMode });
      }
      if (this.cancelRequested) {
        this.setState("CANCELLING");
        return this.finish("CANCELLED", { provider, sandbox, browser }, { plan, unitTests, qa, review, previewUrl, resolvedMode });
      }

      // 5. APP STARTING + health gate --------------------------------------
      this.setState("APP_STARTING");
      await sandbox.startBackground(START_COMMAND, {
        cwd: this.workspace,
        env: { PORT: String(this.port) },
      });
      previewUrl = await sandbox.previewUrl(this.port);
      this.bus.emit("server.started", "Server launched", { url: previewUrl });
      const healthy = await waitForHttp(`${previewUrl}/health`);
      this.bus.emit(healthy ? "preview.ready" : "project.failed", healthy ? `Preview ready: ${previewUrl}` : "Server never became healthy", { url: previewUrl });
      if (!healthy) {
        return this.finish("FAILED", { provider, sandbox, browser }, { plan, unitTests, qa, review, previewUrl, resolvedMode });
      }

      // 6. BROWSER QA (with a bounded repair loop) -------------------------
      this.setState("BROWSER_QA");
      browser = await provider.launchBrowser();
      const qaAgent = new QAAgent({ ai: this.ai, bus: this.bus, logger: this.logger });
      const checks = await this.buildChecks(qaAgent, requirement, plan);

      const runQA = async (): Promise<QAReport> =>
        qaAgent.run({ previewUrl: previewUrl!, checks, browser: browser! });

      qa = await runQA();
      if (qa.failed > 0 || qa.blocked > 0) {
        // Remember which criteria's bugs we're about to try to fix, so the
        // traceability matrix can show them as "resolved by repair" (§57).
        const bugsBeingFixed: ResolvedBug[] = qa.bugs.map((b) => ({
          id: b.id,
          acceptanceCriteriaId: b.acceptanceCriteriaId,
        }));
        this.setState("DEBUGGING");
        const repaired = await runRepairLoop({
          debuggerAgent: new DebuggerAgent({ ai: this.ai, bus: this.bus, logger: this.logger }),
          developer,
          failure: this.qaFailure(qa),
          verify: async () => {
            this.setState("REGRESSION_TESTING");
            // Restart the server so the fix takes effect, then re-run QA.
            await sandbox!.stopBackground();
            await sandbox!.startBackground(START_COMMAND, { cwd: this.workspace, env: { PORT: String(this.port) } });
            await waitForHttp(`${previewUrl}/health`);
            qa = await runQA();
            const ok = qa.failed === 0 && qa.blocked === 0;
            return {
              passed: ok,
              evidence: `QA ${qa.passed}/${qa.total} passed`,
              failure: ok ? undefined : this.qaFailure(qa),
            };
          },
          maxAttempts: this.limits.maxRepairAttempts,
          bus: this.bus,
          logger: this.logger,
        });
        if (!repaired.repaired) {
          return this.finish("FAILED", { provider, sandbox, browser }, { plan, unitTests, qa, review, previewUrl, resolvedMode });
        }
        // The repair succeeded and QA now passes → those bugs are resolved.
        this.resolvedBugs = bugsBeingFixed;
        this.setState("BROWSER_QA");
      }

      if (this.cancelRequested) {
        this.setState("CANCELLING");
        return this.finish("CANCELLED", { provider, sandbox, browser }, { plan, unitTests, qa, review, previewUrl, resolvedMode });
      }

      // 6.5 EVIDENCE COLLECTION --------------------------------------------
      this.setState("EVIDENCE_COLLECTION");

      // 7. FINAL REVIEW ----------------------------------------------------
      this.setState("FINAL_REVIEW");
      const reviewer = new ReviewerAgent({ ai: this.ai, bus: this.bus, logger: this.logger });
      review = await reviewer.review({
        requirement,
        acceptanceCriteria: plan.acceptanceCriteria,
        unitTests,
        browserTests: {
          passed: qa.passed,
          failed: qa.failed,
          blocked: qa.blocked,
          inconclusive: qa.inconclusive,
        },
        openBugs: qa.bugs.map((b) => ({ id: b.id, title: b.title, severity: b.severity })),
        buildOk: true,
      });

      const finalState: WorkflowState = review.status === "failed" ? "FAILED" : "COMPLETED";
      return this.finish(finalState, { provider, sandbox, browser }, { plan, unitTests, qa, review, previewUrl, resolvedMode });
    } catch (err) {
      this.logger.error(`Orchestrator error: ${(err as Error).message}`);
      this.bus.emit("project.failed", `Orchestrator error: ${(err as Error).message}`);
      return this.finish("FAILED", { provider, sandbox, browser }, { plan, unitTests, qa, review, previewUrl, resolvedMode });
    }
  }

  /** Build the QA checks: always health-check, plus whatever the AI derives. */
  private async buildChecks(
    qaAgent: QAAgent,
    requirement: string,
    plan: ArchitectPlan,
  ): Promise<QACheck[]> {
    const health: QACheck = {
      id: "TC-HEALTH",
      description: "GET /health returns 200 and status ok",
      path: "/health",
      method: "GET",
      expectStatus: 200,
      expectBodyIncludes: ["ok"],
    };
    try {
      const prose = plan.testPlan
        .map((t) => `${t.id}: ${t.description} (expected: ${t.expected})`)
        .join("\n");
      const derived = await qaAgent.deriveChecks({ requirement, testPlan: prose });
      return [health, ...derived];
    } catch {
      // If derivation fails, at least verify the app is up.
      return [health];
    }
  }

  private qaFailure(report: QAReport): FailureContext {
    const failing = report.results.filter(
      (r) => r.verdict === "FAIL" || r.verdict === "BLOCKED",
    );
    return {
      kind: "browser_qa",
      summary: `${failing.length} QA check(s) failed`,
      details: failing
        .map((r) => `${r.check.id} ${r.verdict}: ${r.reason} | ${r.check.method ?? "GET"} ${r.check.path}`)
        .join("\n"),
      relevantFiles: ["server.js"],
    };
  }

  /** Common exit path: render the report, clean up resources, return result. */
  private async finish(
    finalState: WorkflowState,
    res: { provider: ISolariProvider; sandbox?: ISandbox; browser?: IBrowser },
    data: {
      plan?: ArchitectPlan;
      unitTests: { passed: number; failed: number };
      qa?: QAReport;
      review?: ReviewResult;
      previewUrl?: string;
      resolvedMode: "solari" | "local";
    },
  ): Promise<BuildResult> {
    this.setState(finalState);
    const terminalEvent =
      finalState === "COMPLETED"
        ? "project.completed"
        : finalState === "CANCELLED"
          ? "project.cancelled"
          : "project.failed";
    this.bus.emit(terminalEvent, `Build ${finalState}`);

    // Cleanup (spec §28.4): always release Solari resources.
    if (res.browser) await res.browser.close().catch(() => {});
    if (res.sandbox) {
      await res.sandbox.destroy().catch(() => {});
      this.bus.emit("sandbox.destroyed", "Sandbox destroyed");
    }
    await res.provider.close().catch(() => {});

    const durationMs = Date.now() - this.startedAt;

    // Collect the run's evidence as first-class, hashed, immutable artifacts.
    const evidenceLog = new EvidenceLog(this.runId);
    if (this.lastUnitOutput) {
      evidenceLog.add({
        type: "TEST_OUTPUT",
        title: `Unit tests: ${data.unitTests.passed} passed, ${data.unitTests.failed} failed`,
        source: "developer",
        content: this.lastUnitOutput,
      });
    }
    if (data.qa) {
      for (const ev of collectQAEvidence(data.qa, this.runId)) {
        evidenceLog.add({
          type: ev.type,
          title: ev.title,
          description: ev.description,
          source: ev.source,
          content: ev.content,
          path: ev.path,
          relatedCheckId: ev.relatedCheckId,
          relatedCriteriaId: ev.relatedCriteriaId,
          metadata: ev.metadata,
        });
      }
    }
    const evidence = evidenceLog.all();
    if (evidence.length) {
      this.bus.emit("log", `Evidence collected: ${evidence.length} artifacts`, {
        count: evidence.length,
        byType: evidenceLog.countByType(),
      });
    }

    // Requirement traceability, built deterministically from the QA evidence.
    const traceability = this.criteria.length
      ? buildTraceability({
          criteria: this.criteria,
          qaReport: data.qa,
          resolvedBugs: this.resolvedBugs,
        })
      : undefined;
    if (traceability) {
      const t = traceabilitySummary(traceability);
      this.bus.emit(
        "log",
        `Traceability: ${t.passed}/${t.total} criteria verified` +
          (t.repaired ? `, ${t.repaired} repaired` : "") +
          (t.unverified ? `, ${t.unverified} unverified` : ""),
        { ...t },
      );
    }

    let report = data.review
      ? renderFinalReport(data.review, {
          projectName: this.projectName,
          infraMode: data.resolvedMode,
          bugsDiscovered: data.qa?.bugs.length,
          previewUrl: data.previewUrl,
          durationMs,
          evidenceCount: evidence.length,
        })
      : `Build ${finalState} before a review could be produced.`;
    if (traceability) {
      report += "\n\n" + renderTraceabilityMatrix(traceability);
    }

    return {
      state: finalState,
      projectName: this.projectName,
      infraMode: data.resolvedMode,
      plan: data.plan,
      unitTests: data.unitTests,
      qa: data.qa,
      review: data.review,
      previewUrl: data.previewUrl,
      report,
      events: this.bus.history(),
      durationMs,
      criteria: this.criteria.length ? this.criteria : undefined,
      traceability,
      evidence: evidence.length ? evidence : undefined,
    };
  }
}

export { isTerminal };
