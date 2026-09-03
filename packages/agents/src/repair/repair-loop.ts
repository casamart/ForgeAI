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
import {
  classifyFailure,
  failureSignature,
  type FailureCategory,
} from "../failures.js";

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
  /** Stop early after this many IDENTICAL failures in a row (default 2). */
  stallLimit?: number;
  bus: EventBus;
  logger: Logger;
}

export type RepairStopReason = "repaired" | "exhausted" | "stalled";

export interface RepairResult {
  repaired: boolean;
  attempts: number;
  diagnoses: Diagnosis[];
  /** Evidence from the final verification. */
  finalEvidence: string;
  /** Why the loop stopped. */
  stopReason: RepairStopReason;
  /** True when it stopped because the same failure kept recurring (§55). */
  stalled: boolean;
  /** The failure category (§53) of the failure being repaired. */
  category: FailureCategory;
  /** The failure signature after each attempt (§56). */
  signatures: string[];
}

export async function runRepairLoop(
  opts: RepairOptions,
): Promise<RepairResult> {
  const { debuggerAgent, developer, verify, bus, logger } = opts;
  const maxAttempts = opts.maxAttempts ?? 3;
  const stallLimit = opts.stallLimit ?? 2;
  const diagnoses: Diagnosis[] = [];
  let failure = opts.failure;
  let finalEvidence = "";

  // Classify the failure and start tracking its signature (§53, §56).
  const category = classifyFailure(failure);
  let currentSig = failureSignature(failure);
  const signatures: string[] = [currentSig];
  let sameInARow = 0;
  bus.emit("log", `Failure classified: ${category} (${currentSig})`, {
    category,
    signature: currentSig,
  });
  logger.info(`Failure classified: ${category} (${currentSig})`);

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
      return {
        repaired: true,
        attempts: attempt,
        diagnoses,
        finalEvidence,
        stopReason: "repaired",
        stalled: false,
        category,
        signatures,
      };
    }

    logger.warn(`Still failing after attempt ${attempt}: ${outcome.evidence}`);
    failure = outcome.failure ?? failure;

    // Did this attempt change anything? If the failure signature is identical,
    // the fix isn't working — don't keep re-applying it (§55, §56).
    const newSig = failureSignature(failure);
    signatures.push(newSig);
    sameInARow = newSig === currentSig ? sameInARow + 1 : 0;
    currentSig = newSig;

    if (sameInARow >= stallLimit) {
      bus.emit("fix.failed", `Repair stalled: ${category} unchanged (${newSig})`, {
        attempts: attempt,
        category,
        signature: newSig,
        reason: "REPAIR_STALLED",
      });
      logger.error(
        `Repair STALLED after ${attempt} attempts — same failure (${newSig}) ` +
          `${sameInARow + 1}x in a row. Stopping (§55).`,
      );
      return {
        repaired: false,
        attempts: attempt,
        diagnoses,
        finalEvidence,
        stopReason: "stalled",
        stalled: true,
        category,
        signatures,
      };
    }
  }

  // Ran out of attempts. Stop honestly rather than loop forever (spec §42).
  bus.emit("fix.failed", `Repair failed after ${maxAttempts} attempts`, {
    attempts: maxAttempts,
    category,
  });
  logger.error(`Repair failed after ${maxAttempts} attempts.`);
  return {
    repaired: false,
    attempts: maxAttempts,
    diagnoses,
    finalEvidence,
    stopReason: "exhausted",
    stalled: false,
    category,
    signatures,
  };
}
