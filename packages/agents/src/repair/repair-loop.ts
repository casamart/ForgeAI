/**
 * The autonomous repair loop — the heart of ForgeAI.
 *
 * Given a failure, it repeats:
 *
 *     Debugger diagnoses  ->  Developer applies the fix  ->  we RE-VERIFY
 *
 * until the failure is gone or we hit a retry limit (spec §42, never loops
 * forever). The re-verification is done by a caller-supplied `verify` function
 * — so even if the Developer claims success, we independently check the real
 * result. Evidence over claims.
 *
 * The same loop works for a failing unit test or a browser QA bug: the caller
 * decides what `verify` means.
 */
import type { EventBus, Logger } from "@forgeai/shared";
import type { DebuggerAgent } from "../debugger/debugger-agent.js";
import type { Diagnosis, FailureContext } from "../debugger/schema.js";
import type { DeveloperAgent } from "../developer/developer-agent.js";

/** What a verification returns each round. */
export interface VerifyOutcome {
  passed: boolean;
  /** Human-readable proof of the current state. */
  evidence: string;
  /** If it still fails, an updated failure to feed the next diagnosis. */
  failure?: FailureContext;
}

export interface RepairOptions {
  debuggerAgent: DebuggerAgent;
  developer: DeveloperAgent;
  /** The failure that started the repair. */
  failure: FailureContext;
  /** Runs the real check and reports whether it passes now. */
  verify: () => Promise<VerifyOutcome>;
  /** Maximum diagnose→fix→verify rounds before giving up. */
  maxAttempts?: number;
  bus: EventBus;
  logger: Logger;
}

export interface RepairResult {
  repaired: boolean;
  attempts: number;
  diagnoses: Diagnosis[];
  /** Evidence from the final verification. */
  finalEvidence: string;
}

export async function runRepairLoop(
  opts: RepairOptions,
): Promise<RepairResult> {
  const { debuggerAgent, developer, verify, bus, logger } = opts;
  const maxAttempts = opts.maxAttempts ?? 3;
  const diagnoses: Diagnosis[] = [];
  let failure = opts.failure;
  let finalEvidence = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    bus.emit("fix.started", `Repair attempt ${attempt}/${maxAttempts}`, {
      attempt,
    });
    logger.step(`Repair attempt ${attempt}/${maxAttempts}`);

    // 1. Diagnose the current failure.
    const diagnosis = await debuggerAgent.diagnose(failure);
    diagnoses.push(diagnosis);

    // 2. Ask the Developer to apply the focused fix.
    await developer.implement({
      requirement:
        `Apply this fix and verify it.\n\n` +
        `Root cause: ${diagnosis.rootCause}\n` +
        `Fix: ${diagnosis.fixInstruction}\n` +
        `Verify with: ${diagnosis.verification}`,
      tasks: diagnosis.filesToInspect.map((f) => `Inspect/adjust ${f}`),
    });

    // 3. Independently RE-VERIFY (do not trust the Developer's own claim).
    const outcome = await verify();
    finalEvidence = outcome.evidence;

    if (outcome.passed) {
      bus.emit("fix.completed", `Repaired on attempt ${attempt}`, { attempt });
      logger.success(`Repaired on attempt ${attempt}: ${outcome.evidence}`);
      return { repaired: true, attempts: attempt, diagnoses, finalEvidence };
    }

    logger.warn(`Still failing after attempt ${attempt}: ${outcome.evidence}`);
    // Feed the fresh failure into the next round (or reuse the last one).
    failure = outcome.failure ?? failure;
  }

  // Ran out of attempts. Stop honestly rather than loop forever (spec §42).
  bus.emit("project.failed", `Repair failed after ${maxAttempts} attempts`, {
    attempts: maxAttempts,
  });
  logger.error(`Repair failed after ${maxAttempts} attempts.`);
  return { repaired: false, attempts: maxAttempts, diagnoses, finalEvidence };
}
