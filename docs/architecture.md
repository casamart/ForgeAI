# ForgeAI Architecture

## 1. Architectural Goal

ForgeAI is an agent orchestration platform.

Its architecture must allow an AI model to:

1. understand a requirement
2. select an appropriate action
3. operate inside an isolated environment
4. observe the result
5. evaluate evidence
6. repair failures
7. repeat within strict limits
8. finish with a verifiable result

---

# 2. High-Level Architecture

```text
                         +----------------+
                         |      User      |
                         +-------+--------+
                                 |
                                 v
                         +---------------+
                         |   Web Client  |
                         +-------+-------+
                                 |
                           HTTP / SSE
                                 |
                                 v
                         +---------------+
                         |    API        |
                         | Node + TS     |
                         +-------+-------+
                                 |
                                 v
                         +---------------+
                         | Orchestrator  |
                         +-------+-------+
                                 |
              +------------------+------------------+
              |                  |                  |
              v                  v                  v
        +-----------+      +-----------+      +-----------+
        | Architect |      | Developer |      |    QA     |
        +-----------+      +-----------+      +-----------+
              |                  |                  |
              |                  v                  |
              |           +-------------+           |
              |           |   Solari    |           |
              |           |   Sandbox   |           |
              |           +------+------+           |
              |                  |                  |
              |                  v                  |
              |             Running App <----------+
              |                  |
              |                  v
              |           +-------------+
              +---------->|   Browser   |
                          +-------------+
                                 |
                                 v
                           Test Evidence
                                 |
                                 v
                           +-------------+
                           |  Debugger   |
                           +-------------+
                                 |
                                 v
                           Developer Agent
```

---

# 3. Monorepo Architecture

ForgeAI should use a monorepo.

```text
forgeai/
├── apps/
│   ├── web/
│   └── api/
│
├── packages/
│   ├── agents/
│   ├── ai/
│   ├── solari/
│   ├── database/
│   ├── events/
│   ├── policies/
│   └── shared/
│
├── examples/
├── tests/
└── docs/
```

The reason is consistency rather than microservice complexity.

The initial deployment can still be a small number of applications.

---

# 4. Frontend

Recommended:

```text
Next.js
TypeScript
```

Responsibilities:

- create project
- enter requirements
- show project state
- show live agent events
- show tests
- show bugs
- show browser evidence
- show preview URL
- show final report

The frontend must not hold Solari credentials.

---

# 5. Backend

Recommended:

```text
Node.js
TypeScript
```

Responsibilities:

- API
- authentication later
- project lifecycle
- orchestration
- AI calls
- tool execution
- Solari lifecycle
- event streaming
- database access
- policy enforcement

The backend must not execute generated application code locally.

---

# 6. Orchestrator

The orchestrator is the most important application component.

Responsibilities:

- start workflows
- maintain workflow state
- invoke agents
- enforce limits
- process tool results
- decide transitions
- detect terminal states
- clean up resources

Example state machine:

```text
CREATED
  ↓
PLANNING
  ↓
SANDBOX_CREATING
  ↓
IMPLEMENTING
  ↓
UNIT_TESTING
  ├── PASS ────────────┐
  └── FAIL → DEBUGGING ┘
                         ↓
                 APPLICATION_STARTING
                         ↓
                    BROWSER_QA
                     ├── PASS ─────────────┐
                     └── FAIL → DEBUGGING ─┘
                                             ↓
                                      FINAL_REVIEW
                                             ↓
                                         COMPLETED
```

Terminal states:

```text
COMPLETED
FAILED
CANCELLED
TIMED_OUT
```

---

# 7. Agent Boundary

Agents should not directly own infrastructure.

Instead:

```text
Agent
  ↓
Tool Interface
  ↓
Tool Implementation
  ↓
Solari SDK
```

This makes agents easier to test.

---

# 8. Tool Layer

Initial tools:

```text
sandbox.create
sandbox.kill
sandbox.readFile
sandbox.writeFile
sandbox.listFiles
sandbox.execute
sandbox.executeBackground
sandbox.preview
sandbox.git

browser.create
browser.navigate
browser.readPage
browser.screenshot
browser.click
browser.type
browser.key
browser.evaluate
browser.close
browser.replay
```

The exact SDK method names must be verified against the installed Solari SDK version before implementation.

---

# 9. Solari Adapter

Create:

```text
packages/solari/
```

Suggested structure:

```text
packages/solari/
├── browser/
│   ├── client.ts
│   ├── session.ts
│   └── types.ts
│
├── sandbox/
│   ├── client.ts
│   ├── workspace.ts
│   └── types.ts
│
├── lifecycle/
│   ├── cleanup.ts
│   └── limits.ts
│
└── index.ts
```

The rest of ForgeAI should depend on this abstraction rather than importing the SDK everywhere.

---

# 10. Project Lifecycle

A project represents one ForgeAI build attempt.

```text
Project
  |
  +-- Requirement
  +-- Plan
  +-- Sandbox
  +-- Agent runs
  +-- Tests
  +-- Bugs
  +-- Artifacts
  +-- Events
  +-- Preview
```

A project should have one primary sandbox in the MVP.

---

# 11. Workspace Strategy

Inside the Solari sandbox:

```text
/workspace
└── project
    ├── src
    ├── tests
    ├── package.json
    └── README.md
```

ForgeAI should use a predictable root path.

Agents should not randomly create files throughout the VM.

---

# 12. Generated Application Lifecycle

```text
Create sandbox
      ↓
Initialize workspace
      ↓
Write package files
      ↓
Install dependencies
      ↓
Generate source
      ↓
Generate tests
      ↓
Run tests
      ↓
Fix failures
      ↓
Start server
      ↓
Obtain preview
      ↓
Browser QA
```

---

# 13. Browser QA Architecture

The browser agent receives:

```text
preview_url
test_plan
expected_behaviors
```

It returns:

```text
status
tests
screenshots
console_errors
network_errors
observations
bugs
replay_url
```

The QA agent must distinguish:

```text
PASS
FAIL
BLOCKED
INCONCLUSIVE
```

Do not turn an inconclusive test into PASS.

---

# 14. Debugging Architecture

Debugger input:

```text
failure_type
error_message
stack_trace
logs
screenshots
test_name
relevant_files
expected_behavior
actual_behavior
```

Debugger output:

```text
diagnosis
confidence
files_to_change
proposed_fix
verification_plan
```

The developer agent then applies the fix.

---

# 15. Evidence Model

Every important claim should have evidence.

Example:

```text
Claim:
"Login works."

Evidence:
- browser_test_id
- HTTP status
- screenshot
- final URL
- timestamp
```

Evidence should be stored as metadata rather than relying only on natural-language agent output.

---

# 16. Event Architecture

Every workflow operation emits an event.

Example:

```text
project.created
workflow.started
agent.started
agent.message
sandbox.created
sandbox.command.started
sandbox.command.completed
test.started
test.failed
debug.started
fix.applied
test.passed
browser.started
browser.test.started
browser.test.failed
browser.test.passed
preview.created
workflow.completed
workflow.failed
resource.cleaned
```

Events are stored in PostgreSQL and streamed to the frontend using SSE.

---

# 17. AI Provider Abstraction

Create:

```text
packages/ai/
```

Interface:

```text
AIProvider
├── generate()
├── stream()
└── structuredOutput()
```

Possible implementations:

```text
OpenAIProvider
AnthropicProvider
GeminiProvider
```

Do not hard-code the application to one provider.

---

# 18. Prompt Architecture

Avoid one enormous system prompt.

Use separate prompts:

```text
prompts/
├── architect.md
├── developer.md
├── qa.md
├── debugger.md
└── reviewer.md
```

Each prompt should define:

- role
- objective
- available tools
- constraints
- output schema
- stop conditions
- evidence requirements

---

# 19. Structured Outputs

Agents should return machine-readable results.

Example:

```json
{
  "status": "failed",
  "summary": "Registration returned HTTP 500",
  "severity": "high",
  "evidence": [
    {
      "type": "http",
      "status": 500
    }
  ],
  "recommended_action": "inspect registration persistence"
}
```

The exact schemas should be implemented with a runtime validator such as Zod.

---

# 20. Retry Architecture

Every autonomous loop needs a maximum.

Example:

```text
MAX_DEBUG_ATTEMPTS=3
MAX_BROWSER_RETRIES=2
MAX_WORKFLOW_MINUTES=10
```

When the limit is reached:

```text
FAILED_RETRY_LIMIT
```

The system must stop rather than continue indefinitely.

---

# 21. Cancellation

Users should eventually be able to press:

```text
STOP BUILD
```

Cancellation must:

1. mark workflow as cancelling
2. stop new agent work
3. terminate background tasks
4. release browser session
5. pause/kill sandbox according to policy
6. persist final state
7. emit cancellation event

---

# 22. Resource Lifecycle

Browser:

```text
create
 ↓
use
 ↓
close
```

Sandbox:

```text
create
 ↓
use
 ↓
pause or kill
```

The implementation must distinguish closing the client/control channel from destroying the underlying VM.

---

# 23. Preview Lifecycle

```text
Application starts
      ↓
Health check
      ↓
Request preview URL
      ↓
Verify URL reachable
      ↓
Pass URL to QA agent
```

Never give the browser a preview URL before verifying that the server is actually listening.

---

# 24. Git Architecture

Git operations should happen inside the sandbox.

Potential workflow:

```text
clone
 ↓
create branch
 ↓
modify
 ↓
test
 ↓
commit
```

GitHub integration is future scope.

---

# 25. Desktop Architecture

Desktop is not part of MVP.

Future:

```text
Agent
 ↓
Desktop adapter
 ↓
Solari VM
 ↓
Screenshot / click / type / key
```

Potential use:

- GUI testing
- desktop software
- file management
- office workflows
- computer-use demonstrations

---

# 26. Deployment Architecture

MVP:

```text
Internet
   |
   v
Next.js Web
   |
   v
Node API
   |
   +---- PostgreSQL
   |
   +---- AI Provider
   |
   +---- Solari
```

Do not split into microservices until actual scaling requirements justify it.

---

# 27. Future Scaling

If usage grows:

```text
API
 |
 v
Job Queue
 |
 +---- Worker A
 +---- Worker B
 +---- Worker C
 |
 v
Solari
```

Possible future technologies:

- Redis
- managed queue
- Kafka
- Kubernetes

These are not MVP requirements.

---

# 28. Observability

Track:

- workflow duration
- agent duration
- Solari session duration
- number of retries
- test pass rate
- browser failures
- sandbox failures
- AI token/cost metrics
- Solari cost estimates
- cleanup success

---

# 29. Architecture Quality Rules

1. No generated code executes on the backend.
2. Agents access infrastructure through tools.
3. Every autonomous loop is bounded.
4. Every success claim requires evidence.
5. Every Solari session has lifecycle management.
6. API keys remain server-side.
7. Agent output is schema-validated.
8. Workflow state is persisted.
9. The system can recover from a failed agent call.
10. The system can be cancelled.
