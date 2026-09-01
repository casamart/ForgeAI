# ForgeAI — Autonomous AI Software Engineer

Give ForgeAI a software requirement. ForgeAI creates an isolated development environment, plans and writes the software, runs tests, launches the application, uses a browser agent to test it, fixes discovered issues, and produces a final engineering report.

## 1. Project Overview

### 1.1 Project Name
ForgeAI

### 1.2 One-Line Description
ForgeAI is an autonomous AI software-engineering agent that transforms natural-language software requirements into tested, runnable applications using Solari's isolated sandboxes and browser environments.

### 1.3 Primary Objective
Build a working demonstration for the Pinetree Research SWE Intern challenge that showcases the ability to:

- Understand a software requirement
- Plan an implementation
- Create an isolated development environment
- Write and modify code autonomously
- Execute code safely
- Run automated tests
- Diagnose failures
- Fix implementation problems
- Start a working application
- Test the application through a real browser
- Detect browser-level bugs
- Automatically repair discovered bugs
- Produce a final engineering report

The objective is not to build another chatbot.

The objective is to demonstrate:

**An AI agent that can actually do software engineering.**

## 2. Why ForgeAI?

Traditional AI coding assistants primarily generate code for a developer.

ForgeAI goes further.

Instead of:

```text
User
 ↓
AI
 ↓
Code
 ↓
Developer manually tests it
```

ForgeAI aims for:

```text
User
 ↓
AI Planner
 ↓
AI Developer
 ↓
Solari Sandbox
 ↓
Code
 ↓
Automated Tests
 ↓
Bug Detection
 ↓
AI Debugger
 ↓
Fix
 ↓
Application
 ↓
Solari Browser
 ↓
Browser QA
 ↓
Bug Detection
 ↓
AI Debugger
 ↓
Final Working Application
```

The key concept is the closed engineering loop.

## 3. Solari

### 3.1 What Solari Provides
Solari provides infrastructure that allows AI agents and applications to interact with:

- Cloud browsers
- Isolated Linux sandboxes
- Linux desktops

The ForgeAI MVP will primarily use:

1. Solari Sandbox
2. Solari Browser

Desktop support will be considered for a future version.

Official resources:

- Solari Documentation: https://docs.getsolari.com/
- Solari Cookbook: https://github.com/solari-sdk/solari-cookbook/

## 4. Solari Components Used by ForgeAI

### 4.1 Sandbox
The sandbox is ForgeAI's temporary development computer.

It is used for:

- Creating projects
- Writing files
- Reading files
- Installing dependencies
- Running commands
- Running tests
- Running development servers
- Git operations
- Creating snapshots
- Exposing development ports

Conceptually:

```text
ForgeAI
   |
   v
Solari Sandbox
   |
   +-- Source code
   +-- Dependencies
   +-- Tests
   +-- Git
   +-- Runtime
   +-- Development server
```

## 5. Browser

The Solari browser becomes ForgeAI's QA engineer.

It can be used to:

- Open URLs
- Navigate websites
- Click elements
- Type into forms
- Read pages
- Take screenshots
- Execute JavaScript
- Upload files
- Maintain browser sessions
- Record browser sessions

ForgeAI will use the browser to test applications produced inside the sandbox.

## 6. Core Architecture

```text
                         USER
                           |
                           v
                  +----------------+
                  |  ForgeAI Web   |
                  |    Interface   |
                  +-------+--------+
                          |
                          v
                  +----------------+
                  |   Node.js API  |
                  +-------+--------+
                          |
                          v
                  +----------------+
                  |  Orchestrator  |
                  +-------+--------+
                          |
             +------------+-------------+
             |            |             |
             v            v             v
        +---------+  +---------+  +----------+
        | Planner |  |Developer|  |    QA    |
        +---------+  +---------+  +----------+
             |            |             |
             +------------+-------------+
                          |
                          v
                  +----------------+
                  |     Solari     |
                  +-------+--------+
                          |
             +------------+-------------+
             |                          |
             v                          v
       +-------------+            +-------------+
       |   Sandbox   |            |   Browser   |
       +-------------+            +-------------+
             |                          |
             v                          v
        Application                 Application
        Development                 Testing
```

## 7. Agent Architecture

ForgeAI should not initially use one giant AI prompt.

The system will contain specialized agents.

### 7.1 Architect Agent
Responsibilities:

- Understand the user's requirements
- Identify features
- Determine technical requirements
- Design the application
- Produce an implementation plan
- Break the project into tasks

Example:

```text
Requirement:

Build a worker marketplace API.

Architect:

1. Initialize Node.js project
2. Configure TypeScript
3. Configure Express
4. Configure database
5. Create worker model
6. Create customer model
7. Create job model
8. Create rating model
9. Create authentication
10. Create API routes
11. Add validation
12. Create tests
```

## 8. Developer Agent

The Developer Agent performs the actual implementation.

Responsibilities:

- Create files
- Modify files
- Delete files when necessary
- Install dependencies
- Run commands
- Run tests
- Inspect errors
- Implement features
- Refactor code
- Commit changes

Possible tools:

```text
create_file
read_file
edit_file
delete_file

run_command
run_tests

git_status
git_diff
git_commit
git_branch
```

The Developer Agent operates inside the Solari sandbox.

## 9. QA Agent

The QA Agent uses the Solari browser.

Responsibilities:

- Open the application
- Navigate through the application
- Execute test cases
- Interact with forms
- Verify expected behavior
- Capture screenshots
- Inspect failures
- Generate bug reports

Example:

```text
Test:
User registration

Expected:
Valid registration should create an account
and redirect the user to the dashboard.

Actual:
HTTP 500

Result:
FAIL
```

## 10. Debugger Agent

The Debugger Agent receives failures from:

- Unit tests
- Integration tests
- Browser tests
- Runtime errors
- Server logs
- Browser console
- Screenshots

It then:

```text
Analyze failure
      ↓
Identify probable cause
      ↓
Inspect source code
      ↓
Modify code
      ↓
Run tests
      ↓
Confirm fix
```

## 11. Orchestrator

The Orchestrator controls the entire workflow.

It maintains project state.

Possible states:

```text
CREATED
    |
    v
PLANNING
    |
    v
ENVIRONMENT_CREATED
    |
    v
IMPLEMENTING
    |
    v
UNIT_TESTING
    |
    +---- FAIL ----> DEBUGGING
    |                    |
    |                    +----> UNIT_TESTING
    |
    v
APPLICATION_RUNNING
    |
    v
BROWSER_TESTING
    |
    +---- FAIL ----> DEBUGGING
    |                    |
    |                    +----> BROWSER_TESTING
    |
    v
FINAL_REVIEW
    |
    v
COMPLETED
```

## 12. Complete ForgeAI Workflow

### Step 1 — User Requirement
The user enters something like:

```text
Build a REST API for a Nigerian worker marketplace.

Workers should have:
- Name
- Category
- Location
- Rating

Customers should be able to:
- Create accounts
- Create jobs
- Assign workers
- Rate completed jobs
```

### Step 2 — Planning
Architect Agent analyzes the request.

Output:

```text
Project:
Worker Marketplace API

Stack:
Node.js
TypeScript
Express
PostgreSQL

Features:
- Authentication
- Workers
- Customers
- Jobs
- Ratings
- Worker availability
```

## 13. Step 3 — Create Solari Sandbox

ForgeAI requests an isolated sandbox.

The sandbox becomes the AI's development environment.

```text
/workspace/project
```

The backend stores the associated:

```text
sandbox_id
```

## 14. Step 4 — Initialize Project

Developer Agent creates:

```text
package.json
tsconfig.json
src/
tests/
README.md
.env.example
```

Then installs dependencies.

## 15. Step 5 — Implement Application

Developer Agent implements the planned features.

Example:

```text
src/
├── app.ts
├── server.ts
│
├── modules/
│   ├── auth/
│   ├── workers/
│   ├── customers/
│   ├── jobs/
│   └── ratings/
│
├── middleware/
├── database/
└── utils/
```

## 16. Step 6 — Generate Tests

ForgeAI should generate tests alongside implementation.

Example:

```text
tests/
├── auth.test.ts
├── workers.test.ts
├── jobs.test.ts
└── ratings.test.ts
```

## 17. Step 7 — Run Tests

The Developer Agent executes the test suite.

Example:

```text
31 tests

27 passed
4 failed
```

ForgeAI captures:

- stdout
- stderr
- exit code
- test results
- stack traces

## 18. Step 8 — Automatic Debugging

The Debugger Agent receives the failure.

Example:

```text
POST /api/ratings

Expected:
201 Created

Received:
500 Internal Server Error
```

The agent investigates.

It might discover:

```text
rating validation middleware
wasn't registered.
```

It fixes the implementation.

Then runs tests again.

```text
31/31 passed
```

## 19. Step 9 — Start Application

The Developer Agent starts the server.

Example:

```text
npm run dev
```

The application listens on:

```text
localhost:3000
```

ForgeAI requests a Solari preview URL.

Example:

```text
https://preview.example...
```

The URL is displayed in the dashboard.

## 20. Step 10 — Browser QA

The QA Agent receives the preview URL.

It executes:

```text
Open application
     ↓
Test registration
     ↓
Test login
     ↓
Create worker
     ↓
Create job
     ↓
Assign worker
     ↓
Complete job
     ↓
Submit rating
     ↓
Verify rating
```

## 21. Step 11 — Browser Bug Detection

Suppose the browser discovers:

```text
Rating submission failed.

Expected:
Rating saved.

Actual:
500 Internal Server Error.
```

QA produces a bug report:

```text
BUG-004

Feature:
Worker rating

Severity:
High

Expected:
Customer can rate completed job.

Actual:
Server returns HTTP 500.

Evidence:
Screenshot
Browser console
Network response
```

## 22. Step 12 — Automatic Repair

Debugger Agent receives the QA report.

It:

```text
Inspect logs
      ↓
Inspect relevant files
      ↓
Identify bug
      ↓
Modify code
      ↓
Run unit tests
      ↓
Start/restart application
      ↓
QA retest
```

If successful:

```text
Rating test: PASS
```

## 23. Step 13 — Final Review

A Reviewer Agent evaluates:

- Requirements
- Code quality
- Test coverage
- Remaining bugs
- Architecture
- Security issues
- Build status

Example:

```text
FINAL REVIEW

Requirements:      100%
Unit tests:        31/31
Browser tests:     18/18
Known bugs:        0
Build:             PASS
Application:       RUNNING
```

## 24. Step 14 — Final Report

ForgeAI generates:

```text
FORGEAI ENGINEERING REPORT

Project:
Worker Marketplace API

Files created:
47

Unit tests:
31

Unit tests passed:
31

Browser tests:
18

Browser tests passed:
18

Bugs discovered:
4

Bugs fixed:
4

Build status:
PASS

Preview:
https://...
```

## 25. Recommended Technology Stack

### Frontend
Next.js + TypeScript

Reason:

- Web-based developer tool
- Easy public deployment
- Fast reviewer access
- Excellent dashboard capabilities
- Strong TypeScript ecosystem

### Backend
Node.js + TypeScript

Responsibilities:

- API
- Agent orchestration
- AI communication
- Solari communication
- Project management
- Event streaming

### Database
PostgreSQL

Initial tables:

```text
users
projects
agent_runs
tasks
test_runs
bugs
artifacts
events
```

### Real-Time Communication
Use Server-Sent Events (SSE) for the MVP.

The dashboard can receive events such as:

```text
sandbox.created
agent.started
file.created
command.started
command.completed
test.started
test.failed
bug.detected
fix.started
fix.completed
qa.started
qa.completed
project.completed
```

WebSockets can be considered later if bidirectional real-time communication becomes necessary.

## 26. Database Design

**projects**

```text
id
name
description
status
sandbox_id
preview_url
created_at
updated_at
```

**agent_runs**

```text
id
project_id
agent_type
status
input
output
started_at
finished_at
```

**tasks**

```text
id
project_id
title
description
status
priority
created_at
completed_at
```

**test_runs**

```text
id
project_id
type
status
tests_total
tests_passed
tests_failed
report
created_at
```

**bugs**

```text
id
project_id
title
description
severity
source
status
evidence
created_at
resolved_at
```

**events**

```text
id
project_id
event_type
message
metadata
created_at
```

## 27. Tool Abstraction

Do not tightly couple agents directly to the Solari SDK.

Create an internal abstraction layer.

```text
Agent
  |
  v
ForgeAI Tools
  |
  v
Solari SDK
```

Example:

```text
sandbox.create()
sandbox.execute()
sandbox.readFile()
sandbox.writeFile()
sandbox.preview()

browser.create()
browser.navigate()
browser.click()
browser.type()
browser.screenshot()
browser.readPage()
```

This gives us the ability to change infrastructure later without rewriting every agent.

## 28. Security Architecture

### 28.1 Never execute AI-generated code on the ForgeAI backend

Incorrect:

```text
User
 ↓
AI
 ↓
Node.js server
 ↓
exec()
```

Correct:

```text
User
 ↓
AI
 ↓
Solari Sandbox
 ↓
Generated code
```

### 28.2 Protect API Keys
The Solari API key must never be exposed to the browser.

Correct:

```text
Browser
   ↓
ForgeAI Backend
   ↓
Solari
```

Incorrect:

```text
Browser
   ↓
Solari API Key
```

### 28.3 Resource Limits
Every project should have limits.

Example:

```text
MAX_BUILD_TIME = 10 minutes

MAX_DEBUG_LOOPS = 3

MAX_BROWSER_SESSIONS = 1

MAX_SANDBOXES_PER_PROJECT = 1
```

These values should be configurable.

### 28.4 Cleanup
Every project should clean up resources when complete.

Example lifecycle:

```text
Create sandbox
      ↓
Use sandbox
      ↓
Save required artifacts
      ↓
Close browser
      ↓
Destroy or pause sandbox
```

Cleanup should also occur if the job fails.

## 29. Cost Control

Solari resources are metered.

ForgeAI therefore needs:

```text
Maximum runtime
Maximum retries
Maximum browser sessions
Maximum sandbox resources
Maximum project duration
```

The dashboard should eventually show:

```text
Current usage
Estimated cost
Session duration
Sandbox duration
```

## 30. Logging

Every important operation should be logged.

Example:

```text
04:31:04 Creating sandbox
04:31:05 Sandbox ready
04:31:06 Initializing project
04:31:09 Installing dependencies
04:31:22 Creating API routes
04:31:29 Running tests
04:31:32 4 tests failed
04:31:34 Debugger started
04:31:39 Applying fix
04:31:42 Running tests
04:31:45 31/31 tests passed
04:31:47 Starting application
04:31:50 Preview available
04:31:51 Browser QA started
04:32:03 Login test passed
04:32:09 Registration test failed
04:32:12 Applying fix
04:32:21 Registration test passed
04:32:23 BUILD COMPLETE
```

This event stream is also a major part of the product's UI.

## 31. ForgeAI Dashboard

The dashboard should show:

```text
+------------------------------------------------------+
| FORGEAI                           ● BUILDING          |
+------------------------------------------------------+
|                                                      |
| Worker Marketplace API                               |
|                                                      |
| +------------+ +-------------+ +----------------+   |
| | PLANNING   | | DEVELOPMENT | |      QA        |   |
| |     ✓      | |      ✓      | |     24/28      |   |
| +------------+ +-------------+ +----------------+   |
|                                                      |
| LIVE AGENT ACTIVITY                                  |
|                                                      |
| ✓ Sandbox created                                    |
| ✓ Project initialized                                |
| ✓ 31 files generated                                 |
| ✓ 18 unit tests passed                               |
| ⚠ Registration test failed                           |
| → Developer agent investigating                      |
| → Fix applied                                        |
| ✓ Registration test passed                            |
|                                                      |
| [ View Code ] [ QA Replay ] [ Open Preview ]         |
|                                                      |
+------------------------------------------------------+
```

## 32. Project Timeline UI

Each project should have a visual timeline:

```text
Planning       ✓
    |
Sandbox        ✓
    |
Development    ✓
    |
Unit Tests     ✓
    |
Application    ✓
    |
Browser QA     ✓
    |
Debugging      ✓
    |
Final Review   ✓
    |
Completed      ✓
```

## 33. QA Replay

If browser session recording is available, ForgeAI should provide QA Replay.

The reviewer can watch the browser agent:

```text
Open application
      ↓
Click login
      ↓
Enter credentials
      ↓
Submit
      ↓
Observe failure
      ↓
Retry after fix
      ↓
PASS
```

This provides visual evidence that the system actually performed the test.

## 34. MVP Scope

The first version should NOT attempt to build arbitrary software.

Supported target: Node.js REST APIs

Recommended stack:

```text
Node.js
TypeScript
Express
PostgreSQL
```

Example projects:

```text
Worker marketplace API
Task management API
Inventory API
Booking API
Payment simulation API
```

## 35. First Demonstration Project

The primary ForgeAI demonstration should be:

**Nigerian Worker Marketplace API**

Requirements:

Users

- Customer
- Worker

Worker

- Name
- Category
- Location
- Availability
- Rating

Job

- Customer
- Worker
- Category
- Description
- Location
- Status

Rating

- Customer
- Worker
- Job
- Rating
- Comment
- Date

## 36. Rating Logic

Example:

Worker receives:

```text
5
4
5
3
```

Average:

```text
(5 + 4 + 5 + 3) / 4
= 17 / 4
= 4.25
```

ForgeAI should create tests to verify this business logic.

Example:

```text
Expected:
4.25

Actual:
4.25

PASS
```

## 37. Repository Structure

Recommended monorepo:

```text
forgeai/
│
├── apps/
│   ├── web/
│   └── api/
│
├── packages/
│   ├── ai/
│   ├── agents/
│   │   ├── planner/
│   │   ├── developer/
│   │   ├── qa/
│   │   ├── debugger/
│   │   └── reviewer/
│   │
│   ├── solari/
│   ├── database/
│   └── shared/
│
├── examples/
│   └── worker-marketplace/
│
├── tests/
│
├── docs/
│   ├── architecture.md
│   ├── agents.md
│   ├── security.md
│   ├── cost-control.md
│   └── decisions.md
│
├── README.md
├── package.json
└── .env.example
```

## 38. Development Roadmap

### Phase 1 — Solari Proof of Concept
Goal: Prove that ForgeAI can communicate with Solari.

Tasks:

- Create Solari account/API key
- Initialize TypeScript project
- Create sandbox
- Execute command
- Write file
- Read file
- Run code
- Start server
- Obtain preview URL
- Create browser
- Open preview URL
- Test endpoint

Success condition:

```text
AI
 ↓
Solari Sandbox
 ↓
Create Node API
 ↓
Run server
 ↓
Solari Browser
 ↓
Test API
 ↓
PASS
```

## 39. Phase 2 — AI Tool System

Create tools:

```text
create_sandbox
destroy_sandbox

read_file
write_file
edit_file

run_command
run_tests

start_server
get_preview_url

browser_create
browser_navigate
browser_click
browser_type
browser_screenshot
browser_read
```

## 40. Phase 3 — Developer Agent

Implement:

```text
Requirement
 ↓
Plan
 ↓
Create project
 ↓
Implement
 ↓
Test
 ↓
Debug
 ↓
Pass
```

## 41. Phase 4 — Browser QA

Implement:

```text
Application
 ↓
Preview URL
 ↓
Browser
 ↓
Test plan
 ↓
Test execution
 ↓
Evidence
 ↓
Bug report
```

## 42. Phase 5 — Autonomous Repair Loop

Implement:

```text
Developer
    ↕
    QA
```

Maximum retries should be configurable.

Example:

```text
MAX_REPAIR_ATTEMPTS = 3
```

If all attempts fail:

```text
BUILD FAILED

Reason:
Unable to resolve database connection issue.
```

The system should never loop indefinitely.

## 43. Phase 6 — Dashboard

Build:

- Project creation
- Project status
- Live agent logs
- Test results
- Browser replay
- Preview URL
- Final report

## 44. Phase 7 — Polish

Add:

- Error handling
- Security
- Resource cleanup
- Cost monitoring
- Better prompts
- Better agent memory
- Test coverage
- Documentation
- Architecture diagrams
- Demo recording

## 45. Future Features

These are deliberately outside MVP.

### Desktop Agent
Use Solari Desktop for:

- GUI applications
- File management
- Office applications
- Visual workflows
- Desktop testing

### GitHub Integration
Eventually:

```text
GitHub repository
      ↓
ForgeAI
      ↓
Clone
      ↓
Create branch
      ↓
Modify code
      ↓
Test
      ↓
Commit
      ↓
Push
      ↓
Pull Request
```

### Pull Request Agent
ForgeAI could eventually review and implement GitHub issues.

Example:

```text
Issue #42

"Add worker availability endpoint."
```

ForgeAI:

```text
Read issue
 ↓
Understand repository
 ↓
Create branch
 ↓
Implement
 ↓
Run tests
 ↓
Browser QA
 ↓
Commit
 ↓
Create PR
```

## 46. Future Multi-Agent Architecture

Eventually:

```text
                    ORCHESTRATOR
                         |
        +----------------+----------------+
        |                |                |
        v                v                v
   ARCHITECT         DEVELOPER           QA
        |                |                |
        |                v                |
        |             SANDBOX            |
        |                |                |
        +----------------+----------------+
                         |
                         v
                      DEBUGGER
                         |
                         v
                      REVIEWER
```

But the MVP should remain simple.

## 47. What NOT to Build Initially

Do not add technologies just to make the project look complex.

Avoid initially:

- Kubernetes
- Kafka
- Redis
- Terraform
- Lambda
- Microservices
- Vector databases
- Complex authentication
- Mobile applications
- Multi-region infrastructure
- Desktop automation

The goal is not "Use as many technologies as possible."

The goal is "Demonstrate excellent engineering using Solari."

## 48. Competitive Strategy

The submission should be optimized for a reviewer who may spend only a few minutes with it.

The reviewer should understand the project within 30 seconds.

The GitHub README should immediately show:

```text
What it does
 ↓
Why it matters
 ↓
Architecture
 ↓
Demo
 ↓
How Solari is used
 ↓
How to run it
```

## 49. Demo Strategy

Target demo length: 60–90 seconds

Recommended sequence:

```text
1. Enter software requirement
2. ForgeAI creates sandbox
3. Architect generates plan
4. Developer writes code
5. Tests fail
6. AI diagnoses failure
7. AI fixes code
8. Tests pass
9. Application launches
10. Browser QA starts
11. Browser discovers a bug
12. Debugger fixes it
13. Browser retests
14. Everything passes
15. Final report appears
```

The demo should show actual behavior rather than explaining what the system supposedly does.

## 50. README Strategy

The final README should contain:

```text
# ForgeAI

One-line description

## Demo

Video/GIF

## Problem

Why autonomous software engineering matters.

## Solution

How ForgeAI works.

## Architecture

Architecture diagram.

## Solari Integration

Explain exactly how Solari is used.

## Agent Architecture

Planner
Developer
QA
Debugger
Reviewer

## Example

Worker Marketplace API

## Security

Sandbox isolation
API-key protection
Resource limits

## Cost Controls

Runtime limits
Retry limits

## Installation

Setup instructions

## Environment Variables

Example configuration

## Running Locally

Commands

## Limitations

Honest limitations

## Future Work

Potential improvements
```

## 51. Important Engineering Principle

ForgeAI must never pretend an operation succeeded.

If the AI says `Tests passed`, the system should have actual test output confirming it.

If the AI says `Application works`, the browser QA should provide evidence.

If the AI says `Bug fixed`, the test should run again.

The system should prefer: **Evidence over AI claims.**

This is one of the most important design principles of ForgeAI.

## 52. Core Philosophy

ForgeAI is built around five principles:

1. **AI does the work** — Not just code generation.
2. **Sandboxes provide safe execution** — Generated code runs in isolated environments.
3. **Tests provide evidence** — The AI cannot simply claim success.
4. **Browser QA verifies real behavior** — The application is actually interacted with.
5. **The system ships** — The final result must be runnable.

## 53. Definition of Done

ForgeAI MVP is complete when it can:

- Accept a natural-language software requirement
- Generate an implementation plan
- Create a Solari sandbox
- Initialize a project
- Create source files
- Install dependencies
- Write application code
- Generate tests
- Execute tests
- Detect failures
- Diagnose failures
- Modify code
- Re-run tests
- Start application
- Generate preview URL
- Create Solari browser session
- Execute browser tests
- Capture evidence
- Detect browser-level failures
- Repair browser failures
- Re-run browser tests
- Generate final report
- Clean up Solari resources
- Display the entire process in the dashboard

## 54. Final Vision

The final ForgeAI experience should feel like this:

```text
USER

"Build me a worker marketplace API."

              ↓

           FORGEAI

       "Planning..."
              ↓
       "Creating sandbox..."
              ↓
       "Writing code..."
              ↓
       "Running tests..."
              ↓
       "4 tests failed."
              ↓
       "Debugging..."
              ↓
       "All tests passed."
              ↓
       "Launching application..."
              ↓
       "Browser QA started."
              ↓
       "1 bug discovered."
              ↓
       "Fixing..."
              ↓
       "QA passed."
              ↓
       "Application ready."
              ↓
       PREVIEW
              ↓
       FINAL REPORT
```

The ultimate message of the project is:

**ForgeAI doesn't just generate software. It builds, executes, tests, repairs, and verifies software.**

## 55. Primary Success Metric

The most important question is not "How much code did ForgeAI generate?"

It is: **Can ForgeAI take a reasonable software requirement and autonomously produce a working, tested application with verifiable evidence?**

If the answer is yes, we have successfully demonstrated the core idea.

## 56. Immediate Next Step

Do not start building the complete dashboard yet.

First build the smallest possible end-to-end proof:

```text
User
 ↓
AI
 ↓
Solari Sandbox
 ↓
Create Node.js API
 ↓
Run API
 ↓
Solari Preview
 ↓
Solari Browser
 ↓
Test API
 ↓
PASS
```

Once this works reliably, build the Developer Agent.

Then add QA.

Then add autonomous repair.

Then build the polished interface.

This order minimizes wasted work and gets us to a working demonstration as quickly as possible.
