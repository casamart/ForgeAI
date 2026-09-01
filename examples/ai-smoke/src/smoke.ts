/**
 * ForgeAI — AI layer smoke test.
 *
 * Proves the @forgeai/ai package works, using the keyless MockProvider so it
 * runs anywhere with no API key. It checks three things:
 *   1. generate()          -> a plain text reply
 *   2. stream()            -> text arriving in chunks
 *   3. structuredOutput()  -> JSON validated against a Zod schema, INCLUDING
 *                             the automatic "repair" retry when the model's
 *                             first answer is invalid.
 *
 * Every check prints its evidence and PASS/FAIL, matching ForgeAI's
 * "evidence over claims" principle.
 */
import { z } from "zod";
import {
  createAIProvider,
  MockProvider,
  type ChatMessage,
} from "@forgeai/ai";

// A tiny schema that previews what the Architect agent will later produce.
const PlanSchema = z.object({
  projectType: z.string(),
  summary: z.string(),
  tasks: z.array(z.string()).min(1),
});

interface Check {
  name: string;
  passed: boolean;
  evidence: string;
}

async function main(): Promise<number> {
  const checks: Check[] = [];
  const line = "─".repeat(60);

  // --- Check 1: generate() -------------------------------------------------
  const echo = createAIProvider("mock"); // default mock = echoes the last message
  const messages: ChatMessage[] = [
    { role: "user", content: "Say hello to ForgeAI." },
  ];
  const gen = await echo.generate(messages);
  const genOk = gen.text.includes("Say hello to ForgeAI");
  checks.push({
    name: "generate() returns text",
    passed: genOk,
    evidence: `provider=${gen.provider} text="${gen.text}"`,
  });

  // --- Check 2: stream() ---------------------------------------------------
  let streamed = "";
  for await (const chunk of echo.stream(messages)) streamed += chunk;
  const streamOk = streamed.trim().length > 0;
  checks.push({
    name: "stream() yields chunks",
    passed: streamOk,
    evidence: `streamed "${streamed.trim()}"`,
  });

  // --- Check 3: structuredOutput() with a repair retry ---------------------
  // We script the mock to answer BADLY first (missing "tasks"), then correctly.
  // The BaseProvider should reject the first answer, feed the Zod error back,
  // and accept the second — ending with attempts === 2.
  const badThenGood = MockProvider.fromReplies([
    // 1st reply: invalid — "tasks" is missing.
    `{ "projectType": "node-rest-api", "summary": "Worker marketplace API" }`,
    // 2nd reply: valid.
    `{
      "projectType": "node-rest-api",
      "summary": "Worker marketplace API",
      "tasks": ["init project", "add worker model", "add rating endpoint"]
    }`,
  ]);

  const structured = await badThenGood.structuredOutput(
    [{ role: "user", content: "Plan a worker marketplace API." }],
    PlanSchema,
    { schemaHint: "projectType, summary, and a non-empty tasks[] of strings" },
  );
  const structOk =
    structured.data.tasks.length === 3 && structured.attempts === 2;
  checks.push({
    name: "structuredOutput() validates + self-repairs",
    passed: structOk,
    evidence: `attempts=${structured.attempts}, tasks=${structured.data.tasks.length}`,
  });

  // --- Report --------------------------------------------------------------
  const passed = checks.filter((c) => c.passed).length;
  const allPass = passed === checks.length;
  console.log(`\n${line}`);
  console.log("  FORGEAI — AI LAYER SMOKE TEST");
  console.log(line);
  for (const c of checks) {
    console.log(`  ${c.passed ? "✓ PASS" : "✗ FAIL"}  ${c.name}`);
    console.log(`         evidence: ${c.evidence}`);
  }
  console.log(line);
  console.log(`  RESULT: ${allPass ? "✅ PASS" : "❌ FAIL"} (${passed}/${checks.length})`);
  console.log(`${line}\n`);
  return allPass ? 0 : 1;
}

main().then((code) => process.exit(code));
