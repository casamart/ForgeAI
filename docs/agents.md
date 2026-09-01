# ForgeAI Agent System

## 1. Purpose

ForgeAI uses specialized agents to perform different parts of software engineering.

The agents are not autonomous without boundaries.

The Orchestrator controls:

- what agent runs
- when it runs
- what tools it receives
- how long it runs
- how many times it can retry
- what evidence is required
- when the workflow stops

---

# 2. Agent Hierarchy

```text
                    ORCHESTRATOR
                         |
        +----------------+----------------+
        |                |                |
        v                v                v
    ARCHITECT         DEVELOPER           QA
        |                |                |
        |                v                |
        |             SANDBOX             |
        |                                  |
        +----------------+----------------+
                         |
                         v
                     DEBUGGER
                         |
                         v
                     DEVELOPER
                         |
                         v
                     REVIEWER
```

---

# 3. Architect Agent

## Responsibilities

- Understand the user requirement.
- Identify ambiguities.
- Identify required features.
- Select the supported project type.
- Produce implementation tasks.
- Define acceptance criteria.
- Define test cases.

## Does not

- Execute arbitrary code.
- Modify files.
- Access the browser.
- Start servers.

## Input

```text
requirement
project constraints
supported stack
```

## Output

```json
{
  "projectType": "node-rest-api",
  "summary": "...",
  "stack": ["node", "typescript", "express"],
  "tasks": [],
  "acceptanceCriteria": [],
  "testPlan": []
}
```

---

# 4. Developer Agent

## Responsibilities

- Initialize projects.
- Create files.
- Modify files.
- Install dependencies.
- Run commands.
- Run tests.
- Inspect compiler/test output.
- Implement planned features.

## Tools

```text
sandbox.readFile
sandbox.writeFile
sandbox.listFiles
sandbox.execute
sandbox.executeBackground
sandbox.git
```

## Rules

1. Work only inside the assigned workspace.
2. Do not access the ForgeAI host filesystem.
3. Do not attempt to obtain ForgeAI secrets.
4. Do not disable security controls.
5. Do not claim success without command/test evidence.
6. Prefer small changes followed by verification.
7. Stop when the task is complete.

---

# 5. QA Agent

## Responsibilities

- Start browser session.
- Navigate to preview.
- Execute test plan.
- Verify expected behavior.
- Collect screenshots.
- Record console/network errors where available.
- Generate structured test results.

## Tools

```text
browser.navigate
browser.readPage
browser.screenshot
browser.click
browser.type
browser.key
browser.evaluate
```

## QA Rules

A test can only be:

```text
PASS
FAIL
BLOCKED
INCONCLUSIVE
```

The QA agent must not convert:

```text
unknown
```

into:

```text
PASS
```

---

# 6. Debugger Agent

## Responsibilities

- Analyze failures.
- Locate likely source.
- Form a diagnosis.
- Propose a fix.
- Apply or delegate the fix.
- Verify the fix.

## Inputs

```text
test result
error output
logs
screenshots
relevant files
expected behavior
actual behavior
```

## Rules

The debugger must not blindly rewrite the whole project.

Preferred:

```text
Identify
 ↓
Minimize
 ↓
Fix
 ↓
Test
```

---

# 7. Reviewer Agent

## Responsibilities

- Compare implementation against requirements.
- Check acceptance criteria.
- Review test evidence.
- Identify unresolved issues.
- Produce final assessment.

## Reviewer output

```json
{
  "status": "passed",
  "requirementsSatisfied": 1.0,
  "unitTests": {
    "passed": 31,
    "failed": 0
  },
  "browserTests": {
    "passed": 18,
    "failed": 0
  },
  "knownIssues": []
}
```

---

# 8. Orchestrator

The Orchestrator is the only component allowed to control the overall workflow.

## Responsibilities

- workflow state
- agent selection
- retry limits
- timeouts
- cancellation
- resource lifecycle
- event emission
- finalization

---

# 9. Agent Tool Permissions

| Agent | Sandbox | Browser | Database | Git |
|---|---:|---:|---:|---:|
| Architect | No | No | Read limited | No |
| Developer | Yes | No | Via generated app only | Yes |
| QA | No | Yes | No | No |
| Debugger | Yes | Evidence only | No | Yes |
| Reviewer | Read evidence | Read evidence | Read project metadata | No |

The agent should receive the minimum tools required.

---

# 10. Agent Loop

Generic loop:

```text
Observe
  ↓
Reason
  ↓
Act
  ↓
Observe result
  ↓
Evaluate
  ↓
Continue or stop
```

Every loop requires:

```text
max_iterations
timeout
termination_condition
```

---

# 11. Developer Loop

```text
Read task
 ↓
Inspect repository
 ↓
Plan small change
 ↓
Modify files
 ↓
Run focused test
 ↓
Evaluate
 ↓
Run broader tests
 ↓
Complete
```

---

# 12. QA Loop

```text
Read test case
 ↓
Navigate
 ↓
Interact
 ↓
Observe
 ↓
Compare with expected result
 ↓
Capture evidence
 ↓
PASS / FAIL / BLOCKED
```

---

# 13. Debugging Loop

```text
Failure
 ↓
Classify
 ↓
Collect evidence
 ↓
Inspect source
 ↓
Hypothesis
 ↓
Patch
 ↓
Test
 ↓
PASS?
 ├── YES → continue workflow
 └── NO  → retry until limit
```

---

# 14. Agent Memory

Do not rely on conversation history as the only source of state.

Persist:

```text
project requirements
architecture plan
tasks
completed tasks
test results
bugs
fix attempts
tool results
```

Agents receive only the relevant context.

This reduces token usage and hallucination.

---

# 15. Context Management

Do not send the entire repository to the model on every call.

Use:

```text
task
relevant files
relevant errors
relevant tests
recent changes
```

For large projects:

```text
search → inspect → modify → verify
```

---

# 16. Agent Failure Categories

```text
MODEL_ERROR
TOOL_ERROR
SOLARI_ERROR
TIMEOUT
INVALID_OUTPUT
TEST_FAILURE
BROWSER_FAILURE
RESOURCE_LIMIT
SECURITY_BLOCK
USER_CANCELLED
```

Each failure should have a recovery strategy.

---

# 17. Invalid Agent Output

If structured output fails validation:

1. Do not execute it.
2. Record the validation error.
3. Ask the same agent to repair its output.
4. Limit retries.
5. Mark workflow failed if the limit is exceeded.

---

# 18. Agent Prompt Rules

Every prompt should explicitly state:

- role
- objective
- available tools
- prohibited actions
- required output
- evidence requirements
- completion condition
- retry behavior

---

# 19. Prompt Design Principle

Bad:

> Build the application.

Better:

> Implement task T-014. Only modify files relevant to worker ratings. Run the rating test after modification. Return the test command, exit code, relevant output, files changed, and remaining concerns.

---

# 20. Evidence-First Agent Contract

Agents should return:

```json
{
  "status": "success",
  "summary": "...",
  "evidence": [
    {
      "type": "command",
      "command": "npm test",
      "exitCode": 0
    }
  ]
}
```

No evidence:

```text
success = unverified
```

---

# 21. Agent Cost Controls

Every agent invocation should have:

- model
- max tokens
- timeout
- retry limit
- tool-call limit

Store these in workflow policy.

---

# 22. Agent Security Rules

Agents must never:

- request or expose Solari API keys
- inspect ForgeAI host secrets
- modify host infrastructure
- bypass sandbox isolation
- disable security controls
- intentionally create infinite processes
- intentionally consume unlimited resources
- claim verification without evidence

---

# 23. Human Override

The user should eventually be able to:

```text
Pause
Resume
Cancel
Retry
Approve destructive action
```

MVP can start with:

```text
Cancel
```

and add approval gates later.

---

# 24. Future Agents

Possible future agents:

```text
Security Agent
Performance Agent
Documentation Agent
Deployment Agent
GitHub PR Agent
UX Agent
Database Agent
```

Do not add them until the core workflow is stable.
