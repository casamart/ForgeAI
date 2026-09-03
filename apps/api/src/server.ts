/**
 * ForgeAI API server.
 *
 * Thin HTTP layer over the Orchestrator. It:
 *   - starts builds (POST /api/projects),
 *   - streams live agent events over Server-Sent Events
 *     (GET /api/projects/:id/events),
 *   - reports status and the final report (GET /api/projects/:id).
 *
 * All credentials stay here on the server; the browser only ever sees events.
 */
import express, { type Request, type Response } from "express";
import type { ForgeEvent } from "@forgeai/shared";
import { ProjectStore } from "./store.js";

const PORT = Number(process.env.PORT ?? 4000);
const store = new ProjectStore();
const app = express();
app.use(express.json());

// Simple permissive CORS so a separate dashboard dev server can talk to us.
app.use((_req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  next();
});
app.options("*", (_req, res) => res.sendStatus(204));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "forgeai-api" });
});

app.get("/", (_req, res) => {
  res.json({
    service: "ForgeAI API",
    endpoints: {
      "POST /api/projects": "Start a build { requirement, name?, demo? }",
      "GET /api/projects": "List builds",
      "GET /api/projects/:id": "Build detail + final report",
      "POST /api/projects/:id/cancel": "Cancel a running build",
      "GET /api/projects/:id/events": "Live event stream (SSE)",
    },
  });
});

// Start a build.
app.post("/api/projects", async (req: Request, res: Response) => {
  const { requirement, name, demo, scenario } = req.body ?? {};
  if (demo !== true && (typeof requirement !== "string" || !requirement.trim())) {
    return res
      .status(400)
      .json({ error: "requirement (string) is required unless demo:true" });
  }
  const stored = await store.create({
    requirement,
    name,
    demo,
    scenario: scenario === "repair" ? "repair" : "happy",
  });
  res.status(201).json({
    id: stored.id,
    status: stored.status,
    demo: stored.demo,
    events: `/api/projects/${stored.id}/events`,
  });
});

// List builds.
app.get("/api/projects", async (_req, res) => {
  res.json({ projects: await store.list() });
});

// Build detail.
app.get("/api/projects/:id", async (req, res) => {
  const detail = await store.detail(req.params.id);
  if (!detail) return res.status(404).json({ error: "not found" });
  res.json(detail);
});

// Cancel a running build (§22). Cooperative: the orchestrator stops at its
// next checkpoint, cleans up, and ends in CANCELLED.
app.post("/api/projects/:id/cancel", async (req, res) => {
  const result = await store.cancel(req.params.id);
  if (!result) return res.status(404).json({ error: "not found" });
  res.json({ id: req.params.id, cancelling: result.ok, status: result.status });
});

// Live event stream (SSE). Replays PERSISTED history from the event repository
// (so a client reconnecting even after completion gets the full story, §24),
// then streams new events live from the build's bus if it is still running.
app.get("/api/projects/:id/events", async (req, res) => {
  const id = req.params.id;
  if (!(await store.get(id))) return res.status(404).json({ error: "not found" });

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // don't let proxies buffer the stream
  });
  res.write("retry: 3000\n\n");

  const send = (e: ForgeEvent) => {
    res.write(`id: ${e.id}\ndata: ${JSON.stringify(e)}\n\n`);
  };

  // 1. Replay persisted events, tracking the last id...
  let lastId = 0;
  for (const e of await store.eventsSince(id)) {
    send(e);
    lastId = e.id;
  }
  // 2. ...then stream only newer events live (if the build is still running).
  const bus = store.liveBus(id);
  const unsubscribe = bus
    ? bus.on((e) => {
        if (e.id > lastId) send(e);
      })
    : () => {};

  // Keep the connection warm through idle stretches.
  const heartbeat = setInterval(() => res.write(": ping\n\n"), 20000);

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`ForgeAI API listening on http://localhost:${PORT}`);
});
