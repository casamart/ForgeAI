/**
 * The Developer Agent works one small step at a time. On each step the AI
 * returns exactly ONE "action" describing what it wants to do next. These Zod
 * schemas define the allowed actions and are used to validate the AI's JSON
 * (invalid JSON is auto-repaired by the AI layer before we ever see it).
 */
import { z } from "zod";

// Create or overwrite a file in the workspace.
const WriteFileAction = z.object({
  tool: z.literal("writeFile"),
  path: z.string().describe("File path, relative to the project root."),
  content: z.string().describe("The full file contents."),
  reason: z.string().optional().describe("Why this change is being made."),
});

// Read a file so the AI can see what is already there.
const ReadFileAction = z.object({
  tool: z.literal("readFile"),
  path: z.string(),
});

// List the files in a directory.
const ListFilesAction = z.object({
  tool: z.literal("listFiles"),
  path: z.string().describe("Directory to list, relative to the project root."),
});

// Run a shell command (install deps, run tests, etc.). Runs in the workspace.
const RunAction = z.object({
  tool: z.literal("run"),
  command: z.string().describe("A shell command line, e.g. 'node --test'."),
  reason: z.string().optional(),
});

// Signal that the task is finished.
const DoneAction = z.object({
  tool: z.literal("done"),
  summary: z.string().describe("Short summary of what was built."),
});

// The AI must return one of the actions above, chosen by its "tool" field.
export const DeveloperActionSchema = z.discriminatedUnion("tool", [
  WriteFileAction,
  ReadFileAction,
  ListFilesAction,
  RunAction,
  DoneAction,
]);

export type DeveloperAction = z.infer<typeof DeveloperActionSchema>;

// A short, human-readable hint injected into the prompt to guide the AI.
export const DEVELOPER_ACTION_HINT =
  'one of: {"tool":"writeFile","path","content","reason?"} | ' +
  '{"tool":"readFile","path"} | {"tool":"listFiles","path"} | ' +
  '{"tool":"run","command","reason?"} | {"tool":"done","summary"}';
