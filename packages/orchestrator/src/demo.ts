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
    id: "TC-LIST",
    description: "GET /workers lists the seeded workers",
    path: "/workers",
    method: "GET",
    expectStatus: 200,
    expectBodyIncludes: ["Amaka O."],
    acceptanceCriteriaId: "AC-001",
  },
  {
    id: "TC-AVG",
    description: "GET /workers computes averageRating 4.25",
    path: "/workers",
    method: "GET",
    expectStatus: 200,
    expectBodyIncludes: ["4.25"],
    acceptanceCriteriaId: "AC-002",
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

// ---------------------------------------------------------------------------
// Repair scenario: the Developer ships a REAL bug first, the unit test fails,
// the Debugger diagnoses it, the Developer fixes it, and the test passes — all
// streamed live. This is the most convincing thing to show a reviewer: the
// autonomous repair loop actually running, with evidence at every step.
// ---------------------------------------------------------------------------

// A rating module with a genuine bug: it returns the SUM, not the average.
const RATING_BUGGY =
  "export function average(nums) {\n" +
  "  // BUG: returns the sum instead of the mean (forgot to divide).\n" +
  "  return nums.reduce((a, b) => a + b, 0);\n" +
  "}\n";

// The corrected module the Developer writes during the fix.
const RATING_FIXED =
  "export function average(nums) {\n" +
  "  if (nums.length === 0) return 0;\n" +
  "  return nums.reduce((a, b) => a + b, 0) / nums.length;\n" +
  "}\n";

// A test that imports the module, so the bug makes `node --test` genuinely fail.
const RATING_TEST_IMPORT =
  'import { test } from "node:test";\n' +
  'import assert from "node:assert";\n' +
  'import { average } from "./rating.mjs";\n' +
  'test("average of [5,4,5,3] is 4.25", () => {\n' +
  "  assert.strictEqual(average([5, 4, 5, 3]), 4.25);\n" +
  "});\n";

// First Developer run: buggy module + test + a (correct) server for later QA.
const REPAIR_DEV_ACTIONS_BUILD = [
  JSON.stringify({ tool: "writeFile", path: "rating.mjs", content: RATING_BUGGY }),
  JSON.stringify({ tool: "writeFile", path: "rating.test.mjs", content: RATING_TEST_IMPORT }),
  JSON.stringify({ tool: "writeFile", path: "server.js", content: SERVER_JS }),
  JSON.stringify({ tool: "done", summary: "Built server + rating module + test." }),
];

// Second Developer run (invoked by the repair loop): apply the fix.
const REPAIR_DEV_ACTIONS_FIX = [
  JSON.stringify({ tool: "writeFile", path: "rating.mjs", content: RATING_FIXED }),
  JSON.stringify({ tool: "run", command: "node --test" }),
  JSON.stringify({ tool: "done", summary: "Divided the sum by the count." }),
];

const REPAIR_DIAGNOSIS = JSON.stringify({
  rootCause:
    "average() in rating.mjs returns the sum of the ratings and never divides by nums.length.",
  confidence: "high",
  filesToInspect: ["rating.mjs"],
  fixInstruction:
    "In rating.mjs, divide the sum by nums.length so average([5,4,5,3]) returns 4.25.",
  verification: "node --test",
});

/**
 * Like createDemoAIProvider(), but the Developer's first attempt is buggy so the
 * repair loop kicks in. The Developer queue holds BOTH runs back-to-back; each
 * developer.implement() call drains actions up to its "done".
 */
export function createRepairDemoAIProvider(): AIProvider {
  const devQueue = [...REPAIR_DEV_ACTIONS_BUILD, ...REPAIR_DEV_ACTIONS_FIX];
  return new MockProvider({
    responder: (messages: ChatMessage[]) => {
      const sys = messages.find((m) => m.role === "system")?.content ?? "";
      if (sys.includes("Architect Agent")) return PLAN;
      if (sys.includes("QA Agent")) return QA_CHECKS;
      if (sys.includes("Reviewer Agent")) return REVIEW;
      if (sys.includes("Debugger Agent")) return REPAIR_DIAGNOSIS;
      if (sys.includes("Developer Agent"))
        return devQueue.shift() ?? JSON.stringify({ tool: "done", summary: "done" });
      return "{}";
    },
  });
}

// ===========================================================================
// BEHAVIORAL DEMO (the plan's "main demo", §44/§106).
//
// A REAL server-rendered Worker Marketplace web app ("ForgeWork") with a bug in
// the VIEW layer: a worker's average rating is ROUNDED to a whole star, so
// [5,4,5] shows "5" when it should show "4.67". The unit tests cover the pure
// average() math (which is correct), so they PASS — this bug is only visible in
// the rendered page. Browser QA opens the profile page over HTTP, sees the wrong
// value, and the repair loop fixes formatRating() and re-verifies. This proves
// ForgeAI catches a BEHAVIORAL defect, not just a syntax error.
//
// server.js is written with single-quoted JS strings + double-quoted HTML and
// no regex/backticks, so it embeds cleanly here with zero escaping.
// ===========================================================================

export const WEB_REQUIREMENT =
  "Build ForgeWork, a worker marketplace web app. Show a directory of workers " +
  "and a profile page for each worker that displays their average rating. A " +
  "worker's ratings are averaged and shown to two decimals (e.g. [5,4,5] => 4.67).";

// Shared top of server.js (identical for buggy + fixed builds).
const WEBAPP_HEAD = `const http = require('http');
const PORT = process.env.PORT || 3000;

function average(ratings) {
  return ratings.length ? ratings.reduce(function (a, b) { return a + b; }, 0) / ratings.length : 0;
}
`;

// The ONLY difference between the two builds: how the average is formatted.
const FORMAT_BUGGY = `
// BUG: rounds the average to a whole star instead of showing the real value.
function formatRating(ratings) {
  return String(Math.round(average(ratings)));
}
`;
const FORMAT_FIXED = `
// Fixed: show the real average to two decimals.
function formatRating(ratings) {
  return average(ratings).toFixed(2);
}
`;

// Shared bottom of server.js (routes + rendering).
const WEBAPP_TAIL = `
const workers = [
  { id: 1, name: 'Chinedu E.', category: 'Electrician', location: 'Lagos', ratings: [5, 4, 5] },
  { id: 2, name: 'Amaka O.', category: 'Plumber', location: 'Abuja', ratings: [4, 4, 5, 4] },
  { id: 3, name: 'Tunde B.', category: 'Carpenter', location: 'Ibadan', ratings: [5, 5, 4] }
];

function layout(title, body) {
  return '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>' + title + ' - ForgeWork</title>' +
    '<style>body{font-family:system-ui,Arial,sans-serif;max-width:720px;margin:2rem auto;padding:0 1rem;color:#111}a.card{display:block;padding:.75rem 1rem;border:1px solid #ddd;border-radius:10px;margin:.5rem 0;text-decoration:none;color:inherit}header{font-weight:600;margin-bottom:1rem}button{padding:.5rem 1rem;border-radius:8px;border:1px solid #111;background:#111;color:#fff}</style>' +
    '</head><body>' +
    '<header data-testid="app-header"><a href="/">ForgeWork</a> - Worker Marketplace</header>' +
    '<main>' + body + '</main></body></html>';
}

function workerCard(w) {
  return '<a class="card" data-testid="worker-card-' + w.id + '" href="/workers/' + w.id + '">' +
    '<strong data-testid="worker-name">' + w.name + '</strong> - ' +
    '<span data-testid="worker-category">' + w.category + '</span> in ' + w.location + '</a>';
}

function send(res, status, type, body) {
  res.writeHead(status, { 'Content-Type': type });
  res.end(body);
}

const server = http.createServer(function (req, res) {
  const url = (req.url || '/').split('?')[0];

  if (url === '/health') {
    return send(res, 200, 'application/json', JSON.stringify({ status: 'ok' }));
  }
  if (url === '/api/workers') {
    const data = workers.map(function (w) {
      return { id: w.id, name: w.name, category: w.category, location: w.location, averageRating: average(w.ratings) };
    });
    return send(res, 200, 'application/json', JSON.stringify(data));
  }
  if (url === '/' || url === '/workers') {
    const list = workers.map(workerCard).join('');
    const body = '<h1 data-testid="page-title">Find a worker</h1><div data-testid="worker-list">' + list + '</div>';
    return send(res, 200, 'text/html', layout('Workers', body));
  }
  if (url.indexOf('/workers/') === 0) {
    const idStr = url.slice('/workers/'.length);
    const id = Number(idStr);
    const w = idStr && !Number.isNaN(id) ? workers.find(function (x) { return x.id === id; }) : null;
    if (!w) return send(res, 404, 'text/html', layout('Not found', '<p data-testid="not-found">Worker not found</p>'));
    const body = '<h1 data-testid="worker-name">' + w.name + '</h1>' +
      '<p data-testid="worker-meta">' + w.category + ' in ' + w.location + '</p>' +
      '<p>Average rating: <strong data-testid="worker-rating">' + formatRating(w.ratings) + '</strong> ' +
      '<span data-testid="worker-rating-count">(' + w.ratings.length + ' reviews)</span></p>' +
      '<button data-testid="book-worker">Book ' + w.name + '</button>';
    return send(res, 200, 'text/html', layout(w.name, body));
  }
  return send(res, 404, 'application/json', JSON.stringify({ error: 'not found' }));
});

server.listen(PORT, function () { console.log('ForgeWork listening on ' + PORT); });
`;

const WEBAPP_BUGGY = WEBAPP_HEAD + FORMAT_BUGGY + WEBAPP_TAIL;
const WEBAPP_FIXED = WEBAPP_HEAD + FORMAT_FIXED + WEBAPP_TAIL;

// Unit tests cover the average MATH (correct in both builds), so they pass even
// while the view is buggy — the whole point of the behavioral demo.
const WEB_TEST = `import { test } from 'node:test';
import assert from 'node:assert';
function average(ratings) { return ratings.length ? ratings.reduce(function (a, b) { return a + b; }, 0) / ratings.length : 0; }
test('average of [5,4,5] is about 4.67', function () { assert.ok(Math.abs(average([5, 4, 5]) - 14 / 3) < 1e-9); });
test('average of [4,4,5,4] is 4.25', function () { assert.strictEqual(average([4, 4, 5, 4]), 4.25); });
`;

const WEB_PLAN = JSON.stringify({
  projectType: "node-web-app",
  summary:
    "ForgeWork: a server-rendered worker marketplace with a worker directory and per-worker profile pages showing average ratings.",
  stack: ["node", "http"],
  tasks: [
    { id: "T-001", title: "Server + pages", description: "server.js with /health, /workers directory, /workers/:id profile, and /api/workers." },
    { id: "T-002", title: "Rating logic", description: "average() and formatRating(); show the average on each profile page." },
    { id: "T-003", title: "Unit test", description: "rating.test.mjs covering the average calculation." },
  ],
  acceptanceCriteria: [
    "The worker directory lists workers with name, category and location.",
    "A worker profile page shows the worker's average rating.",
    "The displayed average equals the mean of the ratings (4.67 for [5,4,5]).",
  ],
  testPlan: [
    { id: "TC-PROFILE", description: "Worker 1 profile shows the correct average rating", expected: "4.67" },
  ],
});

// Each check links to the acceptance criterion it verifies (AC-001..3), so the
// traceability matrix can map requirement -> test -> verdict -> bug -> repair.
const WEB_QA_CHECKS = JSON.stringify([
  {
    id: "TC-DIR",
    description: "Directory lists workers with name and category",
    path: "/workers",
    method: "GET",
    expectStatus: 200,
    expectBodyIncludes: ["worker-list", "Chinedu E."],
    acceptanceCriteriaId: "AC-001",
  },
  {
    id: "TC-SHOWS",
    description: "Worker 1 profile shows a rating value",
    path: "/workers/1",
    method: "GET",
    expectStatus: 200,
    expectBodyIncludes: ["worker-rating"],
    acceptanceCriteriaId: "AC-002",
  },
  {
    id: "TC-PROFILE",
    description: "Worker 1 profile shows the correct average rating 4.67",
    path: "/workers/1",
    method: "GET",
    expectStatus: 200,
    expectBodyIncludes: ["4.67"],
    acceptanceCriteriaId: "AC-003",
  },
]);

const WEB_DIAGNOSIS = JSON.stringify({
  rootCause:
    "formatRating() in server.js rounds the average with Math.round, so [5,4,5] renders as 5 instead of 4.67.",
  confidence: "high",
  filesToInspect: ["server.js"],
  fixInstruction:
    "In server.js, change formatRating to return average(ratings).toFixed(2) instead of Math.round.",
  verification: "restart the server and GET /workers/1; it should show 4.67",
});

const WEB_REVIEW = JSON.stringify({
  criteria: [
    { criterion: "The worker directory lists workers with name, category and location.", met: true, justification: "GET /workers renders all seed workers with test IDs." },
    { criterion: "A worker profile page shows the worker's average rating.", met: true, justification: "GET /workers/1 renders a worker-rating element." },
    { criterion: "The displayed average equals the mean of the ratings (4.67 for [5,4,5]).", met: true, justification: "After the repair, browser QA confirmed 4.67 on the profile page." },
  ],
  knownIssues: [],
  summary:
    "Directory and profile pages work. Browser QA found the rounded-rating display bug, the loop repaired formatRating(), and QA re-verified 4.67.",
});

const WEB_DEV_BUILD = [
  JSON.stringify({ tool: "writeFile", path: "server.js", content: WEBAPP_BUGGY }),
  JSON.stringify({ tool: "writeFile", path: "rating.test.mjs", content: WEB_TEST }),
  JSON.stringify({ tool: "run", command: "node --test" }),
  JSON.stringify({ tool: "done", summary: "Built the ForgeWork web app + rating unit test." }),
];
const WEB_DEV_FIX = [
  JSON.stringify({ tool: "writeFile", path: "server.js", content: WEBAPP_FIXED }),
  JSON.stringify({ tool: "done", summary: "Fixed formatRating() to show the real average." }),
];

/**
 * Router mock for the behavioral demo: the Developer ships the buggy web app
 * first; browser QA catches the rounded rating; the repair loop fixes it.
 */
export function createBehavioralDemoAIProvider(): AIProvider {
  const devQueue = [...WEB_DEV_BUILD, ...WEB_DEV_FIX];
  return new MockProvider({
    responder: (messages: ChatMessage[]) => {
      const sys = messages.find((m) => m.role === "system")?.content ?? "";
      if (sys.includes("Architect Agent")) return WEB_PLAN;
      if (sys.includes("QA Agent")) return WEB_QA_CHECKS;
      if (sys.includes("Reviewer Agent")) return WEB_REVIEW;
      if (sys.includes("Debugger Agent")) return WEB_DIAGNOSIS;
      if (sys.includes("Developer Agent"))
        return devQueue.shift() ?? JSON.stringify({ tool: "done", summary: "done" });
      return "{}";
    },
  });
}
