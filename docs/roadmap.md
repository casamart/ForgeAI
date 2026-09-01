# ForgeAI End-to-End Implementation Roadmap

## Overview

This roadmap takes ForgeAI from an empty repository to a polished Pinetree Research submission.

The principle is:

> **Prove the hardest technical path first, then build the product around it.**

Do not start with a beautiful dashboard.

First prove:

```text
AI → Solari Sandbox → Code → Server → Solari Browser → Verification
```

---

# PHASE 0 — Preparation

## Goal

Prepare the development environment and understand the challenge.

### Tasks

- [ ] Create project repository.
- [ ] Fork the Solari Cookbook.
- [ ] Read the relevant Cookbook examples.
- [ ] Create Solari account.
- [ ] Create Solari API key.
- [ ] Keep API key out of Git.
- [ ] Verify Node.js and TypeScript environment.
- [ ] Choose AI provider.
- [ ] Create local PostgreSQL database.
- [ ] Create project tracking board.

### Deliverable

A clean repository and working credentials.

### Success condition

You can run one official Solari example successfully.

---

# PHASE 1 — Solari Proof of Concept

## Goal

Prove the core technical path before building ForgeAI.

### 1.1 Browser POC

Create a tiny TypeScript program that:

1. creates a Solari browser
2. opens a public test page
3. reads the title
4. reads page text
5. takes a screenshot
6. closes the browser

### Success

```text
Browser created
Page opened
Title read
Screenshot captured
Browser closed
```

---

## 1.2 Sandbox POC

Create a tiny program that:

1. creates sandbox
2. writes a file
3. reads the file
4. executes a command
5. captures stdout/stderr
6. kills the sandbox

### Success

```text
Sandbox created
File written
File read
Command executed
Sandbox cleaned
```

---

## 1.3 Preview POC

Inside the sandbox:

```text
Create Node server
 ↓
Start server
 ↓
Expose port
 ↓
Receive preview URL
```

Then open the preview URL with the Solari browser.

### Success

```text
Sandbox app running
Preview URL reachable
Browser receives HTTP 200
```

---

## 1.4 First End-to-End POC

Hard-code the task:

> Create a Node.js `/hello` API.

The program should:

```text
Create sandbox
 ↓
Write project
 ↓
Install dependencies
 ↓
Start server
 ↓
Get preview URL
 ↓
Create browser
 ↓
Open /hello
 ↓
Verify response
 ↓
Cleanup
```

### This is the first major milestone.

Do not proceed until it works reliably.

---

# PHASE 2 — ForgeAI Repository

## Goal

Create the actual application structure.

```text
forgeai/
├── apps/
│   ├── web/
│   └── api/
├── packages/
│   ├── ai/
│   ├── agents/
│   ├── solari/
│   ├── database/
│   ├── events/
│   ├── policies/
│   └── shared/
├── docs/
├── examples/
└── tests/
```

### Tasks

- [ ] Initialize monorepo.
- [ ] Configure TypeScript.
- [ ] Configure linting.
- [ ] Configure formatting.
- [ ] Configure testing.
- [ ] Configure environment variables.
- [ ] Add `.env.example`.
- [ ] Add CI.
- [ ] Add README.

### Success

Repository installs and tests successfully.

---

# PHASE 3 — Solari Adapter

## Goal

Hide Solari implementation details behind ForgeAI interfaces.

Create:

```text
packages/solari/
```

### Interfaces

```text
SandboxManager
BrowserManager
ResourceManager
```

### Sandbox operations

```text
create
execute
executeBackground
readFile
writeFile
listFiles
preview
kill
```

### Browser operations

```text
create
navigate
readPage
screenshot
click
type
key
evaluate
close
replay
```

### Success

ForgeAI can use Solari without importing SDK details throughout the application.

---

# PHASE 4 — Database

## Goal

Persist workflow state.

### Tasks

- [ ] Create PostgreSQL database.
- [ ] Configure migration system.
- [ ] Create users.
- [ ] Create projects.
- [ ] Create tasks.
- [ ] Create agent runs.
- [ ] Create test runs.
- [ ] Create bugs.
- [ ] Create artifacts.
- [ ] Create events.
- [ ] Create resource sessions.
- [ ] Add indexes.
- [ ] Add ownership checks.

### Success

A project can be created and its state survives a server restart.

---

# PHASE 5 — Event System

## Goal

Make agent activity observable.

### Event flow

```text
Agent
 ↓
Event Bus
 ↓
PostgreSQL
 ↓
SSE
 ↓
Web Dashboard
```

### Tasks

- [ ] Define event schemas.
- [ ] Create event publisher.
- [ ] Store events.
- [ ] Create SSE endpoint.
- [ ] Handle reconnects.
- [ ] Add event ordering.

### Success

The browser receives:

```text
Sandbox created
Agent started
Command started
Command completed
Test passed
```

in real time.

---

# PHASE 6 — AI Provider

## Goal

Create an abstraction over the model.

### Interface

```text
AIProvider
├── generate
├── stream
└── structuredOutput
```

### Tasks

- [ ] Select initial model provider.
- [ ] Implement provider.
- [ ] Add structured outputs.
- [ ] Add timeout.
- [ ] Add retry.
- [ ] Add usage tracking.
- [ ] Add prompt versioning.

### Success

ForgeAI can send a requirement to the model and receive a validated structured plan.

---

# PHASE 7 — Architect Agent

## Goal

Turn requirements into executable plans.

### Input

```text
User requirement
```

### Output

```text
Project type
Stack
Tasks
Acceptance criteria
Test plan
```

### Tasks

- [ ] Write architect prompt.
- [ ] Create output schema.
- [ ] Validate output.
- [ ] Persist plan.
- [ ] Convert plan to tasks.

### Success

Given:

> Build a worker marketplace API.

ForgeAI produces a coherent task list.

---

# PHASE 8 — Developer Agent

## Goal

Make the AI actually write software.

### Tools

```text
read_file
write_file
list_files
execute
execute_background
```

### Tasks

- [ ] Build tool interface.
- [ ] Build tool authorization.
- [ ] Write developer prompt.
- [ ] Add workspace restrictions.
- [ ] Add command policy.
- [ ] Implement tool-call loop.
- [ ] Capture command output.
- [ ] Record changed files.

### Success

Developer Agent can independently create the `/hello` API inside a sandbox.

---

# PHASE 9 — Test Generation

## Goal

Make ForgeAI test what it builds.

### Tasks

- [ ] Add test-generation instructions.
- [ ] Generate unit tests.
- [ ] Generate integration tests.
- [ ] Store test plan.
- [ ] Run test suite.
- [ ] Parse test results.

### Success

ForgeAI can create an application and prove its core functions with automated tests.

---

# PHASE 10 — Debugger Agent

## Goal

Allow ForgeAI to repair test failures.

### Workflow

```text
Test failure
 ↓
Debugger
 ↓
Diagnosis
 ↓
Developer
 ↓
Patch
 ↓
Test
```

### Tasks

- [ ] Create failure schema.
- [ ] Build debugger prompt.
- [ ] Add relevant-file selection.
- [ ] Add fix verification.
- [ ] Add retry counter.
- [ ] Add failure state.

### Success

Intentionally introduce a bug and verify ForgeAI fixes it.

---

# PHASE 11 — Application Runner

## Goal

Launch generated applications.

### Tasks

- [ ] Start server.
- [ ] Track process.
- [ ] Capture logs.
- [ ] Detect readiness.
- [ ] Request preview URL.
- [ ] Verify health endpoint.

### Success

ForgeAI can reliably expose a working generated application.

---

# PHASE 12 — Browser QA Agent

## Goal

Verify real application behavior.

### Tasks

- [ ] Create browser manager.
- [ ] Create QA prompt.
- [ ] Convert acceptance criteria into browser tests.
- [ ] Navigate preview.
- [ ] Interact with application.
- [ ] Capture screenshots.
- [ ] Capture replay when enabled.
- [ ] Parse results.

### Success

QA agent can test the generated application without human interaction.

---

# PHASE 13 — Browser-to-Debugger Loop

## Goal

Make the agent repair real user-facing bugs.

### Workflow

```text
Build
 ↓
Run
 ↓
Browser QA
 ↓
Bug
 ↓
Debugger
 ↓
Developer
 ↓
Build
 ↓
Browser QA
```

### Tasks

- [ ] Browser failure schema.
- [ ] Evidence packaging.
- [ ] Debugger integration.
- [ ] Retry limits.
- [ ] Final QA verification.

### Success

Create an intentional browser bug and watch ForgeAI detect and repair it.

---

# PHASE 14 — Orchestrator

## Goal

Connect all agents into one workflow.

### Workflow

```text
Requirement
 ↓
Architect
 ↓
Sandbox
 ↓
Developer
 ↓
Unit Tests
 ↓
Debugger
 ↓
Application
 ↓
Browser QA
 ↓
Debugger
 ↓
Browser QA
 ↓
Reviewer
 ↓
Complete
```

### Tasks

- [ ] Implement state machine.
- [ ] Implement transitions.
- [ ] Add timeout.
- [ ] Add cancellation.
- [ ] Add retries.
- [ ] Add resource cleanup.
- [ ] Persist every transition.

### Success

One command can execute the entire workflow.

---

# PHASE 15 — Web Dashboard

## Goal

Make the project visually impressive.

### Screens

## Landing

```text
ForgeAI
Turn a software idea into a tested application.
[Start Building]
```

## Project creation

```text
What do you want to build?
[textarea]

[Build]
```

## Build dashboard

Show:

```text
Planning
Development
Testing
QA
Review
```

and live activity.

## Results

Show:

- test results
- browser results
- bugs fixed
- preview
- screenshots
- replay
- final report

---

# PHASE 16 — Evidence UI

## Goal

Make claims verifiable.

Example:

```text
31/31 unit tests passed

[View test output]
```

```text
18/18 browser tests passed

[Watch QA replay]
```

```text
4 bugs discovered
4 bugs fixed
```

---

# PHASE 17 — Worker Marketplace Demonstration

## Goal

Create the flagship example.

Requirement:

```text
Build a REST API for a worker marketplace.

Customers:
- register
- create jobs

Workers:
- register
- define category
- define location
- set availability

Jobs:
- create
- assign
- complete

Ratings:
- submit
- calculate worker average
```

### Required tests

```text
Registration
Login
Worker creation
Job creation
Worker assignment
Job completion
Rating creation
Rating calculation
Invalid input
Unauthorized request
```

---

# PHASE 18 — Intentionally Broken Demo

For the hiring demonstration, create a controlled scenario where ForgeAI encounters a real failure.

Example:

```text
Rating calculation contains a deliberate bug.
```

ForgeAI should:

```text
Test
 ↓
FAIL
 ↓
Diagnose
 ↓
Fix
 ↓
Test
 ↓
PASS
```

Then browser QA should verify the repaired behavior.

This makes the demo compelling.

---

# PHASE 19 — Security Hardening

### Tasks

- [ ] Solari key server-side.
- [ ] Tool authorization.
- [ ] Workspace restrictions.
- [ ] Command policy.
- [ ] Resource limits.
- [ ] Agent timeout.
- [ ] Retry limits.
- [ ] Secret redaction.
- [ ] Project isolation.
- [ ] Cleanup.
- [ ] Cancellation.
- [ ] Preview restrictions.
- [ ] Dependency policy.

### Success

A generated project cannot access ForgeAI host secrets or host filesystem.

---

# PHASE 20 — Observability

Track:

```text
workflow duration
agent duration
tool calls
test count
test failures
repair attempts
browser sessions
sandbox duration
cleanup status
AI usage
Solari usage estimate
```

Dashboard:

```text
Build time: 02:41
Agent calls: 18
Tool calls: 67
Tests: 31
Browser tests: 18
Bugs fixed: 4
```

---

# PHASE 21 — Cost Controls

### Tasks

- [ ] Maximum workflow duration.
- [ ] Maximum agent calls.
- [ ] Maximum retries.
- [ ] Maximum sandbox runtime.
- [ ] Maximum browser runtime.
- [ ] Cleanup on failure.
- [ ] Cost estimate.

### Success

A runaway agent cannot continue indefinitely.

---

# PHASE 22 — Git Integration

MVP:

```text
git init
git status
git diff
git commit
```

Future:

```text
GitHub clone
 ↓
branch
 ↓
modify
 ↓
test
 ↓
commit
 ↓
push
 ↓
pull request
```

---

# PHASE 23 — Testing ForgeAI Itself

ForgeAI needs its own tests.

## Unit tests

- state machine
- policy engine
- schemas
- database
- event system

## Integration tests

- AI provider
- Solari adapter
- sandbox lifecycle
- browser lifecycle

## End-to-end

```text
Requirement
 ↓
ForgeAI
 ↓
Solari
 ↓
Generated app
 ↓
QA
 ↓
Report
```

---

# PHASE 24 — Failure Testing

Intentionally test:

- Solari API unavailable
- AI provider timeout
- invalid model output
- sandbox creation failure
- command timeout
- test failure
- browser failure
- preview unavailable
- cleanup failure
- user cancellation
- retry exhaustion

ForgeAI should fail gracefully.

---

# PHASE 25 — Performance

Do not optimize prematurely.

Measure first.

Targets:

```text
API response: < 500ms for normal control-plane calls

Event delivery: near real-time

POC sandbox startup: track actual provider latency

Browser startup: track actual provider latency

Workflow: depends on generated project
```

Provider behavior should be measured rather than assumed.

---

# PHASE 26 — Documentation

Complete:

- README
- architecture
- agent documentation
- security
- database
- setup
- troubleshooting
- demo instructions

Add architecture diagram.

Add screenshots.

Add demo video.

---

# PHASE 27 — Public Repository Preparation

Before publishing:

- [ ] Remove secrets.
- [ ] Remove personal tokens.
- [ ] Check Git history.
- [ ] Add `.env.example`.
- [ ] Add setup instructions.
- [ ] Add screenshots.
- [ ] Add demo.
- [ ] Add architecture diagram.
- [ ] Add known limitations.
- [ ] Add license if appropriate.
- [ ] Ensure clean installation.

---

# PHASE 28 — Demo Video

Target:

**60–90 seconds.**

### Scene 1

User enters:

> Build a worker marketplace API.

### Scene 2

Planning.

### Scene 3

Sandbox creation.

### Scene 4

Code generation.

### Scene 5

Tests fail.

### Scene 6

Debugger fixes.

### Scene 7

Tests pass.

### Scene 8

Application launches.

### Scene 9

Browser QA.

### Scene 10

Browser finds issue.

### Scene 11

Debugger fixes.

### Scene 12

Final report.

### Scene 13

Open working preview.

---

# PHASE 29 — Final README Review

A reviewer should understand within 30 seconds:

```text
What is this?
Why is it useful?
How does Solari power it?
Can I run it?
Can I see it?
```

The README should lead with the demo.

---

# PHASE 30 — Submission

Final checklist:

- [ ] Forked Solari Cookbook.
- [ ] ForgeAI source is public.
- [ ] README complete.
- [ ] Demo works.
- [ ] Preview works.
- [ ] No secrets.
- [ ] Architecture documented.
- [ ] Solari usage clearly explained.
- [ ] Demo video published.
- [ ] X/LinkedIn post prepared.
- [ ] Official challenge tags included.
- [ ] Repository link included.
- [ ] Demo link included.

---

# PHASE 31 — Post-Submission Interview Preparation

Be prepared to explain:

### Why Solari?

Because ForgeAI needs isolated execution and real browser verification.

### Why sandbox?

Generated code is untrusted.

### Why browser?

Unit tests do not prove that the user-facing application works.

### Why multiple agents?

Specialization improves control, context management, and evidence handling.

### Why not microservices?

The MVP does not need them.

### Why TypeScript?

One language across frontend, backend, agents, and Solari integration.

### Why evidence-first?

AI-generated claims are not proof.

### What happens when the AI gets stuck?

Bounded retries, failure state, and human-visible evidence.

### What happens if generated code is malicious?

It runs inside the isolated execution environment, never on the ForgeAI host.

---

# PHASE 32 — Final Product

The completed experience:

```text
                     FORGEAI

User:
"Build a worker marketplace API."

                    ↓

              ARCHITECT AGENT

                    ↓

             SOLARI SANDBOX

                    ↓

             DEVELOPER AGENT

                    ↓

                UNIT TESTS

             ┌──────┴──────┐
             │             │
           PASS           FAIL
             │             │
             │         DEBUGGER
             │             │
             │             ↓
             │         DEVELOPER
             │             │
             └─────────────┘

                    ↓

              RUN APPLICATION

                    ↓

             SOLARI BROWSER

                    ↓

                 QA AGENT

             ┌──────┴──────┐
             │             │
           PASS           FAIL
             │             │
             │         DEBUGGER
             │             │
             │             ↓
             │         DEVELOPER
             │             │
             └─────────────┘

                    ↓

              REVIEWER AGENT

                    ↓

             FINAL VERIFICATION

                    ↓

             WORKING PREVIEW

                    ↓

             ENGINEERING REPORT
```

---

# Final Success Definition

ForgeAI succeeds when a reviewer can watch it take a software requirement and independently:

```text
PLAN
 ↓
BUILD
 ↓
EXECUTE
 ↓
TEST
 ↓
FAIL
 ↓
DEBUG
 ↓
REPAIR
 ↓
VERIFY
 ↓
SHIP
```

and every important success claim is backed by evidence.
