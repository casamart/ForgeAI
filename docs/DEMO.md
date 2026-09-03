# Demos

Every demo runs **offline** with no API key: a scripted "router mock" AI answers
each agent from its system prompt, so the whole pipeline runs deterministically.
With a real provider (Claude/OpenAI/Gemini) the same agents reason for
themselves — nothing else changes. Mock runs are clearly labelled as scripted;
they are for deterministic regression, not a claim of autonomous reasoning.

Prereqs: `npm install && npm run build`. Local mode runs generated code on the
host via child processes — it is **not** the isolation boundary; Solari is.

---

## Demo 1 — Fast: unit-test repair

```bash
npm run demo:repair
```

The Developer ships a buggy rating module; `node --test` fails; the Debugger
diagnoses it; the Developer fixes it; tests pass. Shows the repair loop end to
end quickly. Expect: `RESULT: ✅ PASS` and a run that passes through
`DEBUGGING → REGRESSION_TESTING → UNIT_TESTING`.

## Demo 2 — Behavioural bug (the main demo)

```bash
npm run demo:web
```

ForgeAI builds a **real served web app** (ForgeWork: a worker directory + profile
pages with `data-testid`s). The profile rounds the average rating, so `[5,4,5]`
shows **"5"** when it should be **"4.67"**. Unit tests cover the average *math*
(correct) and pass — so **only browser QA catches it**. The bug is diagnosed,
`formatRating` is fixed, the server restarts, and QA re-verifies `4.67`.

Expect `8/8`+ checks including the traceability chain:

```
AC-003  ✓ PASS (repaired)   evidence: TC-PROFILE PASS · BUG-001 resolved by repair
```

## Demo 3 — Full pipeline + report

```bash
npm run demo
```

One requirement in → Architect plans → sandbox → Developer builds → unit tests →
app starts → browser QA → Reviewer → engineering report (with the traceability
matrix and `Evidence: N artifacts`).

---

## The dashboard

```bash
npm run api    # backend on :4000 (runs the pipeline server-side; keys stay here)
npm run web    # dashboard on :3000  (talks to the API over HTTP + SSE)
```

Open the dashboard, enter a requirement (or toggle "Inject a bug"), and watch the
phases, live agent log, and final report stream in. A running build can be
cancelled.

## All runnable proofs

```bash
npm run poc ai:smoke dev:smoke arch:smoke qa:smoke dbg:smoke rev:smoke \
        journey:smoke fail:smoke state:smoke demo demo:repair demo:web
```

Each prints a `RESULT: ✅ PASS` line backed by real execution evidence.

## Honest limitations

- Local mode is not sandboxed isolation (Solari is the intended boundary).
- The local browser is an HTTP probe; interactive click/fill journeys are
  `INCONCLUSIVE` locally and run for real only on Solari.
- Real-AI + real-Solari end-to-end is supported by the abstraction but is
  exercised separately from the offline demos.
