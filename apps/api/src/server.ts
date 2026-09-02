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
import { ProjectStore, toDetail } from "./store.js";

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
      "GET /api/projects/:id/events": "Live event stream (SSE)",
    },
  });
});

// Start a build.
app.post("/api/projects", (req: Request, res: Response) => {
  const { requirement, name, demo, scenario } = req.body ?? {};
  if (demo !== true && (typeof requirement !== "string" || !requirement.trim())) {
    return res
      .status(400)
      .json({ error: "requirement (string) is required unless demo:true" });
  }
  const record = store.create({
    requirement,
    name,
    demo,
    scenario: scenario === "repair" ? "repair" : "happy",
  });
  res.status(201).json({
    id: record.id,
    status: record.status,
    demo: record.demo,
    events: `/api/projects/${record.id}/events`,
  });
});

// List builds.
app.get("/api/projects", (_req, res) => {
  res.json({ projects: store.list() });
});

// Build detail.
app.get("/api/projects/:id", (req, res) => {
  const record = store.get(req.params.id);
  if (!record) return res.status(404).json({ error: "not found" });
  res.json(toDetail(record));
});

// Live event stream (SSE). Replays history, then streams new events live.
app.get("/api/projects/:id/events", (req, res) => {
  const record = store.get(req.params.id);
  if (!record) return res.status(404).json({ error: "not found" });

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

  // 1. Replay everything that already happened, tracking the last id...
  let lastId = 0;
  for (const e of record.bus.history()) {
    send(e);
    lastId = e.id;
  }
  // 2. ...then stream only newer events (no duplicates).
  const unsubscribe = record.bus.on((e) => {
    if (e.id > lastId) send(e);
  });

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
