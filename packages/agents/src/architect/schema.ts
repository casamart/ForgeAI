/**
 * The Architect turns a plain-language requirement into a structured PLAN.
 * These Zod schemas define exactly what a valid plan looks like, so the rest
 * of ForgeAI (Developer, QA, Reviewer) can rely on its shape.
 */
import { z } from "zod";

// One unit of implementation work for the Developer agent.
const TaskSchema = z.object({
  id: z.string().describe('Stable id like "T-001".'),
  title: z.string(),
  description: z.string(),
});

// One thing QA will later verify about the running app.
const TestCaseSchema = z.object({
  id: z.string().describe('Stable id like "TC-001".'),
  description: z.string(),
  expected: z.string().describe("The expected, observable result."),
});

export const ArchitectPlanSchema = z.object({
  projectType: z
    .string()
    .describe('Supported type, e.g. "node-rest-api".'),
  summary: z.string().describe("One-paragraph description of the app."),
  stack: z.array(z.string()).min(1).describe("Technologies to use."),
  tasks: z.array(TaskSchema).min(1).describe("Ordered implementation tasks."),
  acceptanceCriteria: z
    .array(z.string())
    .min(1)
    .describe("Plain statements that must all be true when done."),
  testPlan: z.array(TestCaseSchema).min(1).describe("Cases QA will verify."),
});

export type ArchitectPlan = z.infer<typeof ArchitectPlanSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type TestCase = z.infer<typeof TestCaseSchema>;

// Short prompt hint describing the JSON shape we want back.
export const ARCHITECT_PLAN_HINT =
  '{"projectType","summary","stack":[..],' +
  '"tasks":[{"id","title","description"}],' +
  '"acceptanceCriteria":[..],' +
  '"testPlan":[{"id","description","expected"}]}';

/**
 * Flatten a plan's tasks into the plain string list the Developer agent takes.
 * (The Developer's DeveloperTask.tasks is string[].)
 */
export function planToDeveloperTasks(plan: ArchitectPlan): string[] {
  return plan.tasks.map((t) => `${t.id} ${t.title}: ${t.description}`);
}
