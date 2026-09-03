/**
 * The QA Agent.
 *
 * It opens the running app in a browser and verifies concrete checks, one at a
 * time, recording evidence (HTTP status, body snippet, screenshot) and a
 * verdict for each. It is evidence-first and honest:
 *
 *   PASS         - the check was met, with proof.
 *   FAIL         - the app responded, but not as expected -> becomes a bug.
 *   BLOCKED      - the page could not even be reached -> becomes a bug.
 *   INCONCLUSIVE - the check needs something we cannot do here (never a PASS).
 *
 * The AI is used only to TURN a prose test plan into concrete checks
 * (deriveChecks). The actual verification is deterministic — no model gets to
 * "decide" a pass without observed evidence.
 */
import type { AIProvider, ChatMessage } from "@forgeai/ai";
import type { IBrowser, IBrowserPage } from "@forgeai/solari";
import type { EventBus, Logger } from "@forgeai/shared";
import {
  QAChecksSchema,
  QA_CHECKS_HINT,
  type Bug,
  type Evidence,
  type QACheck,
  type QACheckResult,
  type QAReport,
  type QAVerdict,
} from "./schema.js";
import { QA_SYSTEM_PROMPT } from "./prompt.js";
import {
  BrowserActionsSchema,
  BROWSER_ACTIONS_HINT,
  type BrowserAction,
  type BrowserJourney,
} from "../browser/actions.js";
import { runJourney, type JourneyResult } from "../browser/journey-runner.js";

export interface QAContext {
  ai: AIProvider;
  bus: EventBus;
  logger: Logger;
}

export interface QARunParams {
  previewUrl: string;
  checks: QACheck[];
  /** A browser session, already launched by the caller (the orchestrator). */
  browser: IBrowser;
  /** Where to save screenshots (real browser only). Defaults to no screenshots. */
  screenshotDir?: string;
}

// Join the preview base and a path without doubling the slash.
function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

export class QAAgent {
  constructor(private ctx: QAContext) {}

  /**
   * Ask the AI to convert a prose test plan into concrete browser checks.
   * (Optional convenience — the orchestrator can also pass checks directly.)
   */
  async deriveChecks(params: {
    requirement: string;
    testPlan: string;
  }): Promise<QACheck[]> {
    const messages: ChatMessage[] = [
      { role: "system", content: QA_SYSTEM_PROMPT },
      {
        role: "user",
        content:
          `Requirement:\n${params.requirement}\n\n` +
          `Prose test plan:\n${params.testPlan}\n\n` +
          `Produce concrete browser checks.`,
      },
    ];
    const { data } = await this.ctx.ai.structuredOutput(
      messages,
      QAChecksSchema,
      { schemaHint: QA_CHECKS_HINT, maxTokens: 4096 },
    );
    return data;
  }

  /**
   * Turn a prose user journey (from the Architect) into concrete browser
   * actions. The AI plans; the JourneyRunner executes deterministically (§60).
   */
  async deriveJourney(params: {
    name: string;
    proseSteps: string[];
    hints?: string;
  }): Promise<BrowserAction[]> {
    const messages: ChatMessage[] = [
      { role: "system", content: QA_SYSTEM_PROMPT },
      {
        role: "user",
        content:
          `Convert this user journey into concrete browser steps.\n\n` +
          `Journey: ${params.name}\n` +
          `Steps:\n- ${params.proseSteps.join("\n- ")}\n\n` +
          (params.hints ? `Available elements:\n${params.hints}\n\n` : "") +
          `Prefer targeting by testId. Return ONLY the JSON array.`,
      },
    ];
    const { data } = await this.ctx.ai.structuredOutput(
      messages,
      BrowserActionsSchema,
      { schemaHint: BROWSER_ACTIONS_HINT, maxTokens: 3072 },
    );
    return data;
  }

  /**
   * Run one browser journey against the preview and report an honest verdict.
   * (Interactive steps are INCONCLUSIVE on the local http-only browser.)
   */
  async runJourney(params: {
    previewUrl: string;
    journey: BrowserJourney;
    browser: IBrowser;
    screenshotDir?: string;
  }): Promise<JourneyResult> {
    const { bus, logger } = this.ctx;
    bus.emit("qa.started", `Journey "${params.journey.name}"`, {
      journey: params.journey.name,
      realBrowser: params.browser.isRealBrowser,
    });
    const page = await params.browser.newPage();
    const result = await runJourney(page, params.previewUrl, params.journey, {
      screenshotDir: params.screenshotDir,
    });
    for (const s of result.steps) {
      logger.info(`  ${s.status.toUpperCase().padEnd(12)} ${s.label} — ${s.detail}`);
    }
    bus.emit(
      result.verdict === "PASS" ? "qa.passed" : "qa.failed",
      `Journey "${result.name}" ${result.verdict}`,
      { journey: result.name, verdict: result.verdict },
    );
    (result.verdict === "PASS" ? logger.success : logger.warn).call(
      logger,
      `Journey "${result.name}": ${result.verdict}`,
    );
    return result;
  }

  /** Run all checks against the preview URL and produce a QA report. */
  async run(params: QARunParams): Promise<QAReport> {
    const { bus, logger } = this.ctx;
    const { previewUrl, checks, browser } = params;

    bus.emit("qa.started", `QA started on ${previewUrl}`, {
      url: previewUrl,
      checks: checks.length,
      realBrowser: browser.isRealBrowser,
    });
    logger.step(`QA started (${checks.length} checks) on ${previewUrl}`);

    const page = await browser.newPage();
    const results: QACheckResult[] = [];
    const bugs: Bug[] = [];

    for (const check of checks) {
      const result = await this.runOne(page, previewUrl, check, browser, params.screenshotDir);
      results.push(result);

      bus.emit(
        result.verdict === "PASS" ? "qa.passed" : "qa.failed",
        `${check.id} ${result.verdict}: ${check.description}`,
        { id: check.id, verdict: result.verdict },
      );
      const logFn =
        result.verdict === "PASS"
          ? logger.success
          : result.verdict === "FAIL" || result.verdict === "BLOCKED"
            ? logger.error
            : logger.warn;
      logFn.call(logger, `${check.id} ${result.verdict} — ${result.reason}`);

      // FAIL and BLOCKED are real defects worth a bug report (spec §21).
      if (result.verdict === "FAIL" || result.verdict === "BLOCKED") {
        const bug: Bug = {
          id: `BUG-${String(bugs.length + 1).padStart(3, "0")}`,
          title: `${check.description} (${result.verdict})`,
          severity: result.verdict === "BLOCKED" ? "high" : "medium",
          description: result.reason,
          evidence: result.evidence,
          checkId: check.id,
          acceptanceCriteriaId: check.acceptanceCriteriaId,
        };
        bugs.push(bug);
        bus.emit("bug.detected", `${bug.id}: ${bug.title}`, { id: bug.id });
      }
    }

    const count = (v: QAVerdict) =>
      results.filter((r) => r.verdict === v).length;
    const report: QAReport = {
      previewUrl,
      total: results.length,
      passed: count("PASS"),
      failed: count("FAIL"),
      blocked: count("BLOCKED"),
      inconclusive: count("INCONCLUSIVE"),
      results,
      bugs,
      allPassed: results.length > 0 && results.every((r) => r.verdict === "PASS"),
    };

    bus.emit("qa.step", "QA finished", {
      passed: report.passed,
      failed: report.failed,
      blocked: report.blocked,
      inconclusive: report.inconclusive,
    });
    return report;
  }

  /** Run a single check and decide its verdict from observed evidence only. */
  private async runOne(
    page: IBrowserPage,
    previewUrl: string,
    check: QACheck,
    browser: IBrowser,
    screenshotDir?: string,
  ): Promise<QACheckResult> {
    const evidence: Evidence[] = [];

    // Honest INCONCLUSIVE: this check needs a real DOM browser we don't have.
    if (check.requiresRealBrowser && !browser.isRealBrowser) {
      return {
        check,
        verdict: "INCONCLUSIVE",
        reason:
          "Needs a real browser (clicks/JS); running with the HTTP-probe stand-in.",
        evidence: [
          { type: "note", value: "requiresRealBrowser=true, isRealBrowser=false" },
        ],
      };
    }
    // Only GET is testable via a browser navigation today. Missing = GET.
    const method = check.method ?? "GET";
    if (method !== "GET") {
      return {
        check,
        verdict: "INCONCLUSIVE",
        reason: `Method ${method} cannot be exercised via browser navigation.`,
        evidence: [{ type: "note", value: `method=${method}` }],
      };
    }

    const url = joinUrl(previewUrl, check.path);

    // BLOCKED: the page could not be reached at all.
    let status: number;
    let body: string;
    try {
      const nav = await page.goto(url);
      status = nav.status;
      body = await page.content();
    } catch (err) {
      return {
        check,
        verdict: "BLOCKED",
        reason: `Could not reach ${url}: ${(err as Error).message}`,
        evidence: [{ type: "note", value: `navigation error at ${url}` }],
      };
    }
    evidence.push({ type: "http", value: `GET ${check.path} -> ${status}` });
    evidence.push({ type: "body", value: body.slice(0, 300) });

    // Save a screenshot for the record when we have a real browser.
    if (browser.isRealBrowser && screenshotDir) {
      const shot = `${screenshotDir}/${check.id}.png`;
      try {
        const bytes = await page.screenshot(shot);
        if (bytes) evidence.push({ type: "screenshot", value: shot });
      } catch {
        /* screenshots are best-effort evidence */
      }
    }

    // Evaluate expectations. Any miss = FAIL.
    const problems: string[] = [];
    if (check.expectStatus !== undefined && status !== check.expectStatus) {
      problems.push(`expected status ${check.expectStatus}, got ${status}`);
    }
    for (const needle of check.expectBodyIncludes ?? []) {
      if (!body.includes(needle)) {
        problems.push(`body missing "${needle}"`);
      }
    }

    if (problems.length > 0) {
      return {
        check,
        verdict: "FAIL",
        reason: problems.join("; "),
        evidence,
      };
    }
    return {
      check,
      verdict: "PASS",
      reason: "All expectations met.",
      evidence,
    };
  }
}
