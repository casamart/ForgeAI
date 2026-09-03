# Evidence

ForgeAI's first principle is **evidence over claims**: the system never reports
success because an AI said so — it reports success because a deterministic check
produced proof. This document explains what counts as evidence, how it is
collected, and how it drives PASS/FAIL.

## What counts as evidence

Evidence is a real artifact produced by executing something:

- build output, unit-test output, exit codes
- HTTP status and response bodies
- browser actions, screenshots, console/network errors
- generated files and diffs
- command output
- repair history (diagnosis → fix → re-verification)

An AI opinion is **not** evidence.

## The Evidence object (§15/§16)

Every artifact is captured as an immutable `EvidenceItem`:

```
EvidenceItem {
  id, runId, type, title, description,
  source,        // "qa" | "developer" | "orchestrator" | …
  timestamp,
  content,       // the actual text (truncated for large payloads)
  path?,         // for saved artifacts (e.g. a screenshot)
  hash,          // FNV-1a content hash — tamper-evident
  relatedCheckId?, relatedCriteriaId?
}
```

Types: `SCREENSHOT`, `VIDEO`, `LOG`, `TEST_OUTPUT`, `HTTP_RESPONSE`,
`BROWSER_EVENT`, `CONSOLE_ERROR`, `NETWORK_ERROR`, `FILE`, `DIFF`,
`COMMAND_OUTPUT`, `DATABASE_RESULT`.

### Integrity

`createEvidence()` computes a content hash over `type + content` and **freezes**
the object. Any later change to the content would change the hash, so the final
report can honestly say *"this PASS is backed by these exact artifacts"*.

The `EvidenceLog` collects items for a run and de-duplicates by hash.

## How evidence drives the verdict

The Reviewer's final verdict is **derived from the numbers**, not from the AI's
prose:

- a failing unit test or QA check ⇒ `FAILED` (a model cannot override this)
- nothing verifiable / app unreachable ⇒ `BLOCKED`
- works but with open bugs or unmet criteria ⇒ `PARTIAL`
- everything checks out ⇒ `PASS`

The engineering report prints an `Evidence: N artifacts` line and the
[traceability matrix](REPAIR-LOOP.md) linking each acceptance criterion to the
evidence that backs it.

## Proofs

```bash
npm run rev:smoke   # deterministic gate overrides an over-optimistic AI; BLOCKED
npm run demo:web    # asserts evidence is collected, hashed, and immutable
```

## Code

- `packages/agents/src/evidence.ts` — `EvidenceItem`, `createEvidence`, `EvidenceLog`
- `packages/agents/src/reviewer/` — verdict derivation + report
