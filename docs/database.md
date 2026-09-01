# ForgeAI Database Design

## 1. Database

Recommended:

**PostgreSQL**

The database stores ForgeAI control-plane state.

It does not store or execute the generated application's database.

---

# 2. Core Entities

```text
users
projects
project_members
agent_runs
tasks
test_runs
bugs
artifacts
events
resource_sessions
```

---

# 3. Entity Relationship

```text
users
  |
  +----< project_members >---- projects
                                  |
             +--------------------+---------------------+
             |          |          |          |          |
             v          v          v          v          v
           tasks    agent_runs  test_runs   bugs     artifacts
                                  |
                                  v
                                events

projects
   |
   v
resource_sessions
   |
   +---- sandbox
   +---- browser
```

---

# 4. users

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Authentication provider details should be added later.

---

# 5. projects

```sql
CREATE TABLE projects (
    id UUID PRIMARY KEY,
    owner_id UUID NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL,
    project_type TEXT NOT NULL,
    sandbox_id TEXT,
    preview_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);
```

Recommended statuses:

```text
CREATED
PLANNING
SANDBOX_CREATING
IMPLEMENTING
UNIT_TESTING
DEBUGGING
RUNNING
BROWSER_QA
FINAL_REVIEW
COMPLETED
FAILED
CANCELLED
TIMED_OUT
```

---

# 6. project_members

Useful when collaboration is added.

```sql
CREATE TABLE project_members (
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (project_id, user_id)
);
```

Roles:

```text
OWNER
EDITOR
VIEWER
```

---

# 7. tasks

```sql
CREATE TABLE tasks (
    id UUID PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    external_key TEXT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL,
    priority INTEGER NOT NULL DEFAULT 0,
    depends_on UUID REFERENCES tasks(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);
```

Statuses:

```text
TODO
IN_PROGRESS
BLOCKED
DONE
FAILED
```

---

# 8. agent_runs

```sql
CREATE TABLE agent_runs (
    id UUID PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    agent_type TEXT NOT NULL,
    status TEXT NOT NULL,
    model TEXT,
    input JSONB,
    output JSONB,
    error JSONB,
    tool_calls INTEGER NOT NULL DEFAULT 0,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ
);
```

Agent types:

```text
ARCHITECT
DEVELOPER
QA
DEBUGGER
REVIEWER
```

---

# 9. test_runs

```sql
CREATE TABLE test_runs (
    id UUID PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    agent_run_id UUID REFERENCES agent_runs(id) ON DELETE SET NULL,
    test_type TEXT NOT NULL,
    status TEXT NOT NULL,
    total INTEGER NOT NULL DEFAULT 0,
    passed INTEGER NOT NULL DEFAULT 0,
    failed INTEGER NOT NULL DEFAULT 0,
    blocked INTEGER NOT NULL DEFAULT 0,
    output TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);
```

Test types:

```text
UNIT
INTEGRATION
API
BROWSER
HEALTH
```

---

# 10. bugs

```sql
CREATE TABLE bugs (
    id UUID PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    test_run_id UUID REFERENCES test_runs(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    severity TEXT NOT NULL,
    source TEXT NOT NULL,
    status TEXT NOT NULL,
    evidence JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);
```

Severity:

```text
LOW
MEDIUM
HIGH
CRITICAL
```

Source:

```text
UNIT_TEST
BROWSER
RUNTIME
BUILD
REVIEW
```

Status:

```text
OPEN
INVESTIGATING
FIXED
WONT_FIX
BLOCKED
```

---

# 11. artifacts

Artifacts are references to evidence or generated outputs.

```sql
CREATE TABLE artifacts (
    id UUID PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    uri TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Types:

```text
SCREENSHOT
REPLAY
LOG
REPORT
PATCH
BUILD_OUTPUT
TEST_OUTPUT
```

Do not store large binary files directly in PostgreSQL unless there is a strong reason.

Use object storage later.

---

# 12. events

```sql
CREATE TABLE events (
    id BIGSERIAL PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    message TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Examples:

```text
project.created
workflow.started
sandbox.created
agent.started
agent.completed
command.started
command.completed
test.started
test.failed
test.passed
bug.detected
fix.applied
browser.started
browser.completed
preview.created
workflow.completed
resource.cleaned
```

Index:

```sql
CREATE INDEX events_project_created_idx
ON events(project_id, created_at);
```

---

# 13. resource_sessions

Track external resources.

```sql
CREATE TABLE resource_sessions (
    id UUID PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    external_id TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMPTZ
);
```

Resource types:

```text
SANDBOX
BROWSER
DESKTOP
```

This allows cleanup workers to find resources that were created but not released.

---

# 14. Indexing Strategy

Important indexes:

```sql
CREATE INDEX projects_owner_idx
ON projects(owner_id);

CREATE INDEX projects_status_idx
ON projects(status);

CREATE INDEX tasks_project_idx
ON tasks(project_id);

CREATE INDEX agent_runs_project_idx
ON agent_runs(project_id);

CREATE INDEX test_runs_project_idx
ON test_runs(project_id);

CREATE INDEX bugs_project_status_idx
ON bugs(project_id, status);

CREATE INDEX resource_sessions_project_idx
ON resource_sessions(project_id);

CREATE INDEX resource_sessions_open_idx
ON resource_sessions(status)
WHERE status NOT IN ('CLOSED', 'KILLED');
```

---

# 15. JSONB Usage

Use JSONB for flexible evidence and agent metadata.

Good:

```text
test output metadata
browser evidence
tool arguments
agent structured output
```

Do not use JSONB for core relational data that needs frequent querying.

---

# 16. Transactions

Use transactions when multiple control-plane changes must succeed together.

Example:

```text
Bug fixed
+
Test passed
+
Bug marked resolved
```

These should be persisted consistently.

---

# 17. Project Ownership

Every project query should be scoped.

Bad:

```sql
SELECT * FROM projects WHERE id = $1;
```

Better:

```sql
SELECT *
FROM projects
WHERE id = $1
AND owner_id = $2;
```

For team projects, use `project_members`.

---

# 18. Retention

Not all data needs to live forever.

Potential retention:

```text
events: configurable
agent outputs: configurable
screenshots: short/medium term
browser replays: according to provider retention
temporary logs: short term
final reports: long term
project metadata: long term
```

Implement cleanup policies later.

---

# 19. Generated Application Database

Do not mix:

```text
ForgeAI database
```

with:

```text
generated application database
```

They are different trust domains.

For MVP generated projects can use SQLite inside the sandbox.

This reduces infrastructure complexity.

---

# 20. Migration Strategy

Use a migration system from the beginning.

Recommended:

```text
Drizzle Kit
```

or

```text
Prisma Migrate
```

Choose one and standardize on it.

---

# 21. Database Definition of Done

- [ ] PostgreSQL connection
- [ ] migrations
- [ ] projects
- [ ] tasks
- [ ] agent runs
- [ ] tests
- [ ] bugs
- [ ] artifacts
- [ ] events
- [ ] resource sessions
- [ ] ownership checks
- [ ] indexes
- [ ] cleanup policy
