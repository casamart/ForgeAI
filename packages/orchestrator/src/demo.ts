/**
 * A self-contained, offline DEMO of the full pipeline.
 *
 * `createDemoAIProvider()` returns a "router mock" AI: it answers each agent
 * based on that agent's system prompt, using scripted replies that build a
 * small worker-marketplace API. This lets the ENTIRE ForgeAI pipeline run with
 * no API key — perfect for a reviewer who wants to see it work in 30 seconds.
 *
 * With a real provider (Claude/OpenAI/Gemini) the same agents reason for
 * themselves; nothing else changes.
 */
import { MockProvider, type AIProvider, type ChatMessage } from "@forgeai/ai";

export const DEMO_REQUIREMENT =
  "Build a REST API for a Nigerian worker marketplace. Workers have a name, " +
  "category, location and rating. Expose GET /workers, where each worker's " +
  "rating is the average of its ratings.";

const PLAN = JSON.stringify({
  projectType: "node-rest-api",
  summary: "A worker marketplace API exposing GET /workers with average ratings.",
  stack: ["node", "http"],
  tasks: [
    { id: "T-001", title: "HTTP server", description: "server.js with /health and /workers." },
    { id: "T-002", title: "Rating test", description: "rating.test.mjs asserting the average is 4.25." },
  ],
  acceptanceCriteria: [
    "GET /workers returns each worker with averageRating.",
    "A worker's averageRating equals the mean of its ratings (4.25 for [5,4,5,3]).",
  ],
  testPlan: [
    { id: "TC-001", description: "GET /workers computes the average rating", expected: "4.25" },
  ],
});

const SERVER_JS =
  'const http = require("http");\n' +
  "const PORT = process.env.PORT || 3000;\n" +
  "function average(n){ return n.length ? n.reduce((a,b)=>a+b,0)/n.length : 0; }\n" +
  'const workers = [{ id:1, name:"Amaka O.", category:"Plumber", location:"Lagos", ratings:[5,4,5,3] }];\n' +
  "http.createServer((req,res)=>{\n" +
  '  const url = (req.url||"/").split("?")[0];\n' +
  '  if (url === "/health"){ res.writeHead(200,{"Content-Type":"application/json"}); return res.end(JSON.stringify({status:"ok"})); }\n' +
  '  if (url === "/workers"){ res.writeHead(200,{"Content-Type":"application/json"}); return res.end(JSON.stringify(workers.map(w=>({...w,averageRating:average(w.ratings)})))); }\n' +
  '  res.writeHead(404,{"Content-Type":"application/json"}); res.end(JSON.stringify({error:"not found"}));\n' +
  '}).listen(PORT, ()=>console.log("listening on "+PORT));\n';

const TEST_MJS =
  'import { test } from "node:test";\n' +
  'import assert from "node:assert";\n' +
  "function average(n){ return n.length ? n.reduce((a,b)=>a+b,0)/n.length : 0; }\n" +
  'test("average of [5,4,5,3] is 4.25", () => {\n' +
  "  assert.strictEqual(average([5,4,5,3]), 4.25);\n" +
  "});\n";

const DEV_ACTIONS = [
  JSON.stringify({ tool: "writeFile", path: "server.js", content: SERVER_JS }),
  JSON.stringify({ tool: "writeFile", path: "rating.test.mjs", content: TEST_MJS }),
  JSON.stringify({ tool: "run", command: "node --test" }),
  JSON.stringify({ tool: "done", summary: "Built server + passing rating test." }),
];

const QA_CHECKS = JSON.stringify([
  {
    id: "TC-001",
    description: "GET /workers computes averageRating 4.25",
    path: "/workers",
    method: "GET",
    expectStatus: 200,
    expectBodyIncludes: ["4.25"],
  },
]);

const REVIEW = JSON.stringify({
  criteria: [
    { criterion: "GET /workers returns each worker with averageRating.", met: true, justification: "QA saw averageRating in the response." },
    { criterion: "averageRating equals the mean (4.25).", met: true, justification: "Unit test and QA both confirm 4.25." },
  ],
  knownIssues: [],
  summary: "All acceptance criteria satisfied by unit tests and browser QA.",
});

/**
 * A mock AI that routes replies by which agent is asking (its system prompt).
 * The Developer gets a queue of actions; every other agent gets one reply.
 */
export function createDemoAIProvider(): AIProvider {
  const devQueue = [...DEV_ACTIONS];
  return new MockProvider({
    responder: (messages: ChatMessage[]) => {
      const sys = messages.find((m) => m.role === "system")?.content ?? "";
      if (sys.includes("Architect Agent")) return PLAN;
      if (sys.includes("QA Agent")) return QA_CHECKS;
      if (sys.includes("Reviewer Agent")) return REVIEW;
      if (sys.includes("Developer Agent"))
        return devQueue.shift() ?? JSON.stringify({ tool: "done", summary: "done" });
      return "{}";
    },
  });
}
