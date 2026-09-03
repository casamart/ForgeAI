# Browser QA

How ForgeAI verifies a running application through a browser, and how it stays
honest about what it can and cannot check.

## Two layers

**Layer A — deterministic checks (`QACheck`).** Open a path, assert on the HTTP
status and/or the response body. Each check maps to an acceptance criterion for
traceability. This is what the pipeline uses to gate a build.

**Layer B — user journeys (`BrowserJourney`).** A sequence of browser actions
(`goto`, `click`, `fill`, `assertText`, …) that walks a real user flow. The AI
*plans* the journey; the deterministic `JourneyRunner` *executes* it and judges
the result from evidence.

## Element targeting (most stable first)

1. accessibility `role` + name
2. `data-testid`
3. visible `text`
4. CSS selector
5. XPath (last resort)

ForgeAI asks generated apps to expose `data-testid` attributes so autonomous
targeting is reliable.

## Verdicts — and the honesty rule

Every check/journey resolves to one of four verdicts, and an unknown is **never**
reported as a pass:

| Verdict | Meaning |
|---|---|
| `PASS` | Reached and every expectation met, with evidence. |
| `FAIL` | Reached but wrong → a `Bug` is filed with evidence. |
| `BLOCKED` | Could not reach the page at all → high-severity bug. |
| `INCONCLUSIVE` | Could not be evaluated here (e.g. an interactive step on the local HTTP-probe browser). |

## Local vs. Solari (the §84 boundary)

- **Local browser** is an HTTP probe. It genuinely does navigation and
  text/URL assertions, but it **cannot** click, fill, hover, run JavaScript, or
  judge visual visibility. Those steps report `INCONCLUSIVE` — they are not
  faked. This keeps the abstraction honest.
- **Solari browser** runs the *same* journey for real (clicks, fills,
  screenshots, console/network inspection).

## Evidence

Each check/journey records evidence — HTTP status, a body snippet, and (on a
real browser) a screenshot — which becomes a first-class, hashed
[`EvidenceItem`](EVIDENCE.md).

## Proofs

```bash
npm run qa:smoke       # PASS / FAIL / INCONCLUSIVE verdict discipline
npm run journey:smoke  # nav journey PASS; interactive step honestly INCONCLUSIVE
```

## Code

- `packages/agents/src/qa/` — `QAAgent`, `QACheck`, verdicts, bug reports
- `packages/agents/src/browser/actions.ts` — action + targeting schema
- `packages/agents/src/browser/journey-runner.ts` — deterministic executor
