"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  cancelBuild,
  eventStreamUrl,
  getProject,
  startBuild,
  type ForgeEvent,
  type ProjectDetail,
} from "@/lib/api";

// The ordered pipeline (spec §32). Labels shown in the timeline.
const TIMELINE: { state: string; label: string }[] = [
  { state: "PLANNING", label: "Planning" },
  { state: "SANDBOX_CREATING", label: "Sandbox" },
  { state: "IMPLEMENTING", label: "Development" },
  { state: "UNIT_TESTING", label: "Unit Tests" },
  { state: "APP_STARTING", label: "App" },
  { state: "BROWSER_QA", label: "Browser QA" },
  { state: "FINAL_REVIEW", label: "Review" },
  { state: "COMPLETED", label: "Done" },
];

const DEFAULT_REQUIREMENT =
  "Build a REST API for a Nigerian worker marketplace. Workers have a name, " +
  "category, location and rating. Expose GET /workers, where each worker's " +
  "rating is the average of its ratings.";

// Pick an icon + colour class for each event type.
function eventStyle(type: string, meta?: Record<string, unknown>): {
  icon: string;
  cls: string;
} {
  switch (type) {
    case "agent.started":
    case "review.started":
      return { icon: "◆", cls: "violet" };
    case "agent.finished":
      return { icon: "◇", cls: "violet" };
    case "file.created":
    case "file.modified":
      return { icon: "+", cls: "accent" };
    case "command.started":
      return { icon: "$", cls: "" };
    case "command.completed":
      return { icon: meta?.exitCode === 0 ? "✓" : "✗", cls: meta?.exitCode === 0 ? "green" : "red" };
    case "test.passed":
    case "qa.passed":
    case "fix.completed":
    case "preview.ready":
    case "review.completed":
    case "project.completed":
      return { icon: "✓", cls: "green" };
    case "test.failed":
    case "qa.failed":
    case "project.failed":
      return { icon: "✗", cls: "red" };
    case "bug.detected":
      return { icon: "●", cls: "red" };
    case "fix.started":
      return { icon: "⚙", cls: "amber" };
    case "server.started":
      return { icon: "▶", cls: "accent" };
    case "sandbox.created":
      return { icon: "▣", cls: "accent" };
    case "qa.started":
      return { icon: "◎", cls: "accent" };
    default:
      return { icon: "·", cls: "" };
  }
}

function hhmmss(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-GB", { hour12: false });
}

export default function Dashboard() {
  const [requirement, setRequirement] = useState(DEFAULT_REQUIREMENT);
  const [name, setName] = useState("Nigerian Worker Marketplace API");
  const [demo, setDemo] = useState(true);
  const [repair, setRepair] = useState(false);

  const [projectId, setProjectId] = useState<string | null>(null);
  const [events, setEvents] = useState<ForgeEvent[]>([]);
  const [status, setStatus] = useState<"idle" | "running" | "completed" | "failed" | "cancelled">("idle");
  const [cancelling, setCancelling] = useState(false);
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const seen = useRef<Set<number>>(new Set());
  const logRef = useRef<HTMLDivElement>(null);

  // Auto-scroll the log as events arrive.
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [events]);

  // Open the SSE stream whenever we have a project to watch.
  useEffect(() => {
    if (!projectId) return;
    const es = new EventSource(eventStreamUrl(projectId));

    es.onmessage = (msg) => {
      let e: ForgeEvent;
      try {
        e = JSON.parse(msg.data);
      } catch {
        return;
      }
      if (seen.current.has(e.id)) return; // guard against history-replay dupes
      seen.current.add(e.id);
      setEvents((prev) => [...prev, e]);

      if (
        e.type === "project.completed" ||
        e.type === "project.failed" ||
        e.type === "project.cancelled"
      ) {
        es.close();
        const terminal =
          e.type === "project.completed"
            ? "completed"
            : e.type === "project.cancelled"
              ? "cancelled"
              : "failed";
        getProject(projectId)
          .then((d) => {
            setDetail(d);
            setStatus((d.status as typeof status) ?? terminal);
          })
          .catch(() => setStatus(terminal));
      }
    };
    es.onerror = () => {
      // The stream ends when the server closes it after completion; that's fine.
    };

    // Belt-and-suspenders: also poll for the final result, so the panels render
    // even if a terminal SSE event is missed (dev double-mount, reconnects, …).
    const poll = setInterval(async () => {
      try {
        const d = await getProject(projectId);
        if (d.status !== "running") {
          setDetail(d);
          setStatus(d.status);
          clearInterval(poll);
          es.close();
        }
      } catch {
        /* keep polling */
      }
    }, 2000);

    return () => {
      es.close();
      clearInterval(poll);
    };
  }, [projectId]);

  async function onStart() {
    setError(null);
    setDetail(null);
    setEvents([]);
    seen.current = new Set();
    setStatus("running");
    try {
      const { id } = await startBuild({
        requirement,
        name,
        demo,
        scenario: repair ? "repair" : "happy",
      });
      setProjectId(id);
      setCancelling(false);
    } catch (err) {
      setError((err as Error).message);
      setStatus("idle");
    }
  }

  async function onCancel() {
    if (!projectId) return;
    setCancelling(true);
    try {
      await cancelBuild(projectId);
    } catch (err) {
      setError((err as Error).message);
      setCancelling(false);
    }
  }

  // Current workflow state, read from the latest "state → X" log line.
  const currentState = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i--) {
      const m = /state →\s*([A-Z_]+)/.exec(events[i].message);
      if (m) return m[1];
    }
    return status === "idle" ? "" : "PLANNING";
  }, [events, status]);

  // DEBUGGING / REGRESSION_TESTING are transient repair detours; EVIDENCE_COLLECTION
  // is a brief step before review. Keep the timeline steady on the last state that
  // is actually in the timeline, and flag when a repair is in progress.
  const repairing = currentState === "DEBUGGING" || currentState === "REGRESSION_TESTING";
  const timelineStates = useMemo(() => new Set(TIMELINE.map((t) => t.state)), []);
  const effectiveState = useMemo(() => {
    if (timelineStates.has(currentState)) return currentState;
    for (let i = events.length - 1; i >= 0; i--) {
      const m = /state →\s*([A-Z_]+)/.exec(events[i].message);
      if (m && timelineStates.has(m[1])) return m[1];
    }
    return currentState;
  }, [currentState, events, timelineStates]);
  const currentIndex = TIMELINE.findIndex((t) => t.state === effectiveState);

  // Live counters derived from the event stream.
  const counts = useMemo(() => {
    let unitPassed = 0,
      unitFailed = 0,
      qaPassed = 0,
      qaFailed = 0,
      bugs = 0,
      fixes = 0;
    for (const e of events) {
      if (e.type === "fix.completed") fixes++;
      if (e.type === "test.passed") {
        unitPassed = Number(e.metadata?.passed ?? unitPassed);
        unitFailed = Number(e.metadata?.failed ?? unitFailed);
      }
      if (e.type === "test.failed") {
        unitPassed = Number(e.metadata?.passed ?? unitPassed);
        unitFailed = Number(e.metadata?.failed ?? unitFailed);
      }
      if (e.type === "qa.passed") qaPassed++;
      if (e.type === "qa.failed") qaFailed++;
      if (e.type === "bug.detected") bugs++;
    }
    return { unitPassed, unitFailed, qaPassed, qaFailed, bugs, fixes };
  }, [events]);

  const qaTotal = counts.qaPassed + counts.qaFailed;
  const planningDone = currentIndex > 0 || status === "completed";
  const devDone = currentIndex > TIMELINE.findIndex((t) => t.state === "UNIT_TESTING");

  return (
    <div className="wrap">
      <div className="top">
        <div className="brand">
          <h1>
            <span className="spark">◆</span> FORGEAI
          </h1>
          <small>autonomous AI software engineer</small>
        </div>
        <span className={`badge ${status}`}>
          <span className="dot" />
          {status === "idle"
            ? "READY"
            : status === "running"
              ? "BUILDING"
              : status.toUpperCase()}
        </span>
      </div>

      <div className="grid">
        {/* Left: build form */}
        <div className="card">
          <h2>New build</h2>
          <label htmlFor="name">Project name</label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={status === "running"}
          />
          <label htmlFor="req">Requirement</label>
          <textarea
            id="req"
            value={requirement}
            onChange={(e) => setRequirement(e.target.value)}
            disabled={status === "running"}
          />
          <div className="row">
            <input
              id="demo"
              type="checkbox"
              checked={demo}
              onChange={(e) => setDemo(e.target.checked)}
              disabled={status === "running"}
            />
            <label htmlFor="demo">Offline demo (no API key needed)</label>
          </div>
          <div className="row">
            <input
              id="repair"
              type="checkbox"
              checked={repair}
              onChange={(e) => setRepair(e.target.checked)}
              disabled={status === "running" || !demo}
            />
            <label htmlFor="repair">Inject a bug — show the self-repair loop</label>
          </div>
          {status === "running" ? (
            <button className="danger" onClick={onCancel} disabled={cancelling}>
              {cancelling ? "Cancelling…" : "■ Cancel build"}
            </button>
          ) : (
            <button className="primary" onClick={onStart}>
              ▶ Start build
            </button>
          )}
          {error && <div className="err">{error}</div>}
          <div className="hint">
            The build runs on the API server and streams here live over SSE.
            {demo
              ? " Demo mode builds a worker-marketplace API with scripted agents."
              : " Real mode uses the AI provider configured on the server."}
          </div>
        </div>

        {/* Right: live activity + results */}
        <div>
          {/* Phase cards */}
          <div className="phases">
            <div className={`phase ${planningDone ? "done" : currentIndex === 0 ? "on" : ""}`}>
              <div className="k">Planning</div>
              <div className="v">{planningDone ? "✓" : currentIndex === 0 ? "…" : "—"}</div>
            </div>
            <div className={`phase ${devDone ? "done" : currentIndex >= 2 && currentIndex <= 3 ? "on" : ""}`}>
              <div className="k">Development</div>
              <div className="v">
                {counts.unitPassed + counts.unitFailed > 0
                  ? `${counts.unitPassed}/${counts.unitPassed + counts.unitFailed}`
                  : devDone
                    ? "✓"
                    : "—"}
              </div>
            </div>
            <div className={`phase ${currentState === "BROWSER_QA" ? "on" : qaTotal > 0 && counts.qaFailed === 0 ? "done" : ""}`}>
              <div className="k">Browser QA</div>
              <div className="v">{qaTotal > 0 ? `${counts.qaPassed}/${qaTotal}` : "—"}</div>
            </div>
            <div className={`phase ${status === "completed" ? "done" : status === "failed" ? "" : ""}`}>
              <div className="k">Verdict</div>
              <div className="v">
                {detail?.verdict
                  ? detail.verdict === "passed"
                    ? "✓"
                    : "✗"
                  : "—"}
              </div>
            </div>
          </div>

          {/* Timeline */}
          <div className="timeline">
            {TIMELINE.map((t, i) => {
              const cls =
                status === "failed" && i === currentIndex
                  ? "failed"
                  : i < currentIndex || status === "completed"
                    ? "done"
                    : i === currentIndex
                      ? "active"
                      : "";
              return (
                <span key={t.state} className={`step ${cls}`}>
                  {t.label}
                </span>
              );
            })}
            {repairing && (
              <span className="step repairing">⟳ self-repairing…</span>
            )}
            {!repairing && counts.fixes > 0 && (
              <span className="step done">
                ✓ {counts.fixes} autonomous fix{counts.fixes > 1 ? "es" : ""}
              </span>
            )}
          </div>

          {/* Live event log */}
          <div className="card" style={{ marginBottom: 18 }}>
            <h2>Live agent activity</h2>
            <div className="log" ref={logRef}>
              {events.length === 0 && (
                <div className="ev">
                  <span className="m" style={{ color: "var(--muted)" }}>
                    Waiting for a build… press “Start build”.
                  </span>
                </div>
              )}
              {events.map((e) => {
                const s = eventStyle(e.type, e.metadata);
                const dim = e.type === "log";
                return (
                  <div key={e.id} className={`ev ${s.cls}`}>
                    <span className="t">{hhmmss(e.ts)}</span>
                    <span className="ic">{s.icon}</span>
                    <span
                      className="m"
                      style={dim ? { color: "var(--muted)" } : undefined}
                    >
                      {e.message}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Results (after completion) */}
          {detail && detail.status !== "running" && (
            <div className="card">
              <h2>Result</h2>
              <div className="stats">
                <div className="stat">
                  <div className="k">Verdict</div>
                  <div className="v" style={{ color: detail.verdict === "passed" ? "var(--green)" : "var(--red)" }}>
                    {(detail.verdict ?? detail.status).toUpperCase()}
                  </div>
                </div>
                <div className="stat">
                  <div className="k">Unit tests</div>
                  <div className="v">
                    {detail.unitTests
                      ? `${detail.unitTests.passed}/${detail.unitTests.passed + detail.unitTests.failed}`
                      : "—"}
                  </div>
                </div>
                <div className="stat">
                  <div className="k">Browser QA</div>
                  <div className="v">
                    {detail.qa ? `${detail.qa.passed}/${detail.qa.passed + detail.qa.failed + detail.qa.blocked + detail.qa.inconclusive}` : "—"}
                  </div>
                </div>
                <div className="stat">
                  <div className="k">Duration</div>
                  <div className="v">{detail.durationMs ? `${(detail.durationMs / 1000).toFixed(1)}s` : "—"}</div>
                </div>
              </div>

              {detail.previewUrl && (
                <a className="link-btn" href={detail.previewUrl} target="_blank" rel="noreferrer">
                  ↗ Open preview
                </a>
              )}

              {detail.qa && detail.qa.bugs.length > 0 && (
                <>
                  <div className="space" />
                  <h2>Bugs found</h2>
                  {detail.qa.bugs.map((b) => (
                    <div className="bug" key={b.id}>
                      <span className={`sev ${b.severity}`}>{b.severity}</span>
                      {b.id} — {b.title}
                    </div>
                  ))}
                </>
              )}

              {/* Requirement traceability: AC → test → bug → repair (§57) */}
              {detail.traceability && detail.traceability.length > 0 && (
                <>
                  <div className="space" />
                  <h2>Requirement traceability</h2>
                  <div className="trace">
                    {detail.traceability.map((row) => (
                      <div className="trace-row" key={row.criterion.id}>
                        <span className={`tstat ${row.status}`}>
                          {row.status === "passed" ? (row.repaired ? "✓ repaired" : "✓") : row.status === "failed" ? "✗" : "○"}
                        </span>
                        <span className="tid">{row.criterion.id}</span>
                        <span className="ttext">
                          {row.criterion.text}
                          {(row.checkIds.length > 0 || row.resolvedBugIds.length > 0) && (
                            <span className="tev">
                              {row.checkIds.join(", ")}
                              {row.resolvedBugIds.length > 0 && ` · ${row.resolvedBugIds.join(", ")} fixed`}
                            </span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Evidence viewer (§16): hashed, immutable artifacts */}
              {detail.evidence && detail.evidence.length > 0 && (
                <>
                  <div className="space" />
                  <h2>Evidence · {detail.evidence.length} artifacts</h2>
                  <div className="evidence">
                    {detail.evidence.map((ev) => (
                      <div className="eitem" key={ev.id}>
                        <span className="etype">{ev.type}</span>
                        <span className="etitle">{ev.title}</span>
                        <span className="ehash" title="content hash (tamper-evident)">#{ev.hash}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {detail.error && <div className="err">{detail.error}</div>}

              {detail.report && (
                <>
                  <div className="space" />
                  <h2>Engineering report</h2>
                  <div className="report">{detail.report}</div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
