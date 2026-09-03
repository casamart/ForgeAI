# The Repair Loop

The autonomous repair loop is the heart of ForgeAI. A coding assistant stops at
"here's the code". ForgeAI keeps going: it runs the code, finds the failure,
diagnoses it, fixes it, and **independently re-verifies** — bounded so it never
loops forever.

## The loop

```
failure
  → CLASSIFY        (BUILD_FAILURE, ASSERTION_FAILURE, NETWORK_FAILURE, …)
  → DIAGNOSE        (Debugger: root cause + focused fix instruction)
  → PATCH           (Developer applies the fix in the sandbox)
  → RE-VERIFY       (the loop re-runs the real check — not the Developer's claim)
  → repeat until fixed, or stop
```

### Evidence over claims

The Developer may *say* it fixed the bug. The loop does not trust that: it calls
a caller-supplied `verify()` that re-runs the actual test or QA journey and reads
the real result. A repair only counts when the **original failing behaviour
passes again**.

## Failure classification (§53)

Every failure is tagged with a standard category from its evidence
(`classifyFailure`): `BUILD_FAILURE`, `UNIT_TEST_FAILURE`, `STARTUP_FAILURE`,
`NETWORK_FAILURE`, `DATABASE_FAILURE`, `ASSERTION_FAILURE`, `LOGIC_BUG`,
`TIMEOUT`, `AI_FAILURE`, `SOLARI_FAILURE`, `UNKNOWN`.

## Failure signatures (§56)

`failureSignature()` reduces a failure to a stable fingerprint
(`CATEGORY:hash`) that ignores volatile numbers and paths. Two failures that are
"the same problem" get the same signature.

## Bounded + stall-aware (§42/§55)

- **Retry limit** — at most `maxRepairAttempts` (default 3) rounds. If they run
  out: `REPAIR failed after N attempts`.
- **Stall guard** — if the failure signature is unchanged after a fix
  `stallLimit` (default 2) times in a row, the loop stops **early** with
  `REPAIR_STALLED` instead of re-applying a fix that clearly isn't working.

## Regression protection

After a fix the pipeline re-enters `REGRESSION_TESTING` and re-runs the checks,
so a repair that fixes one thing while breaking another is caught.

## Traceability (§57)

The whole chain is recorded per acceptance criterion:

```
Requirement → AC-003 → TC-PROFILE → FAIL → BUG-001 → repair → PASS → evidence
```

rendered as a matrix in the final report.

## Proofs

```bash
npm run dbg:smoke    # a real bug is diagnosed, fixed, and independently verified
npm run fail:smoke   # classification + a fix-that-never-works stops at REPAIR_STALLED
npm run demo:web     # behavioural bug caught by browser QA → repaired → re-verified
```

## Code

- `packages/agents/src/repair/repair-loop.ts` — the loop + stall guard
- `packages/agents/src/failures.ts` — classification + signatures
- `packages/agents/src/debugger/` — diagnosis
- `packages/agents/src/traceability.ts` — the AC → evidence matrix
