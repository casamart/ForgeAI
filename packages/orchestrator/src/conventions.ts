/**
 * The contract between the Orchestrator and the agents.
 *
 * The Orchestrator needs to know how to test and launch whatever the Developer
 * builds. Rather than guess, it TELLS the Architect and Developer to follow a
 * few simple conventions, and then relies on them. This block is appended to
 * the requirement the agents receive.
 */
export function projectConventions(workspace: string, port: number): string {
  return `FORGEAI PROJECT CONVENTIONS (follow these exactly):
- The project root is "${workspace}".
- The HTTP server entry file MUST be "server.js", started with: node server.js
- The server MUST listen on process.env.PORT (default ${port}) and expose
  GET /health returning HTTP 200 with JSON {"status":"ok"}.
- Tests MUST run with: node --test
  (use Node's built-in node:test and node:assert; name test files *.test.mjs)
- Keep it dependency-light; prefer Node's built-in "http" module so no install
  step is required.`;
}

// The fixed commands the Orchestrator uses, matching the conventions above.
export const TEST_COMMAND = "node --test";
export const START_COMMAND = "node server.js";
