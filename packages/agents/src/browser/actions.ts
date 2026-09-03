/**
 * The browser action + targeting model (plan §8, §9).
 *
 * A browser JOURNEY is a list of small, explicit ACTIONS (goto, click, fill,
 * assertText, …). The AI PLANS a journey; the JourneyRunner EXECUTES it
 * deterministically and judges the result from evidence (plan §60). This keeps
 * autonomous browser testing safe and reproducible.
 *
 * Elements are addressed through a targeting hierarchy (plan §9), most stable
 * first: accessibility role/name, then test id, then text, then CSS, then XPath.
 */
import { z } from "zod";

// How to find an element on the page (most stable first).
export const TargetSchema = z.discriminatedUnion("by", [
  z.object({ by: z.literal("role"), role: z.string(), name: z.string().optional() }),
  z.object({ by: z.literal("testId"), value: z.string() }),
  z.object({ by: z.literal("text"), value: z.string() }),
  z.object({ by: z.literal("css"), value: z.string() }),
  z.object({ by: z.literal("xpath"), value: z.string() }),
]);
export type Target = z.infer<typeof TargetSchema>;

// One browser action. Discriminated by "action".
export const BrowserActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("goto"), path: z.string() }),
  z.object({ action: z.literal("click"), target: TargetSchema }),
  z.object({ action: z.literal("fill"), target: TargetSchema, value: z.string() }),
  z.object({ action: z.literal("select"), target: TargetSchema, value: z.string() }),
  z.object({ action: z.literal("press"), key: z.string() }),
  z.object({ action: z.literal("hover"), target: TargetSchema }),
  z.object({
    action: z.literal("scroll"),
    direction: z.enum(["up", "down"]).optional(),
    amount: z.number().optional(),
  }),
  z.object({ action: z.literal("wait"), ms: z.number().optional(), forText: z.string().optional() }),
  z.object({ action: z.literal("assertText"), value: z.string(), target: TargetSchema.optional() }),
  z.object({ action: z.literal("assertVisible"), target: TargetSchema }),
  z.object({ action: z.literal("assertUrl"), contains: z.string() }),
  z.object({ action: z.literal("screenshot"), name: z.string().optional() }),
  z.object({ action: z.literal("evaluate"), script: z.string() }),
]);
export type BrowserAction = z.infer<typeof BrowserActionSchema>;

export const BrowserJourneySchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  steps: z.array(BrowserActionSchema).min(1),
});
export type BrowserJourney = z.infer<typeof BrowserJourneySchema>;

export const BrowserActionsSchema = z.array(BrowserActionSchema).min(1);

export const BROWSER_ACTIONS_HINT =
  'a JSON array of steps; each is one of: {"action":"goto","path"}, ' +
  '{"action":"click","target"}, {"action":"fill","target","value"}, ' +
  '{"action":"assertText","value","target?"}, {"action":"assertUrl","contains"}, ' +
  '{"action":"assertVisible","target"}, {"action":"screenshot","name?"}. ' +
  'A target is {"by":"testId","value"} | {"by":"role","role","name?"} | ' +
  '{"by":"text","value"} | {"by":"css","value"}.';

/** Turn a target into a CSS-ish selector usable by a real (Playwright) browser. */
export function targetToSelector(t: Target): string {
  switch (t.by) {
    case "testId":
      return `[data-testid="${t.value}"]`;
    case "css":
      return t.value;
    case "role":
      return t.name
        ? `[role="${t.role}"][aria-label="${t.name}"]`
        : `[role="${t.role}"]`;
    case "text":
      return `text=${t.value}`;
    case "xpath":
      return `xpath=${t.value}`;
  }
}

/** Human-readable one-liner for a target (for logs/evidence). */
export function describeTarget(t: Target): string {
  switch (t.by) {
    case "testId":
      return `testId=${t.value}`;
    case "css":
      return `css=${t.value}`;
    case "role":
      return t.name ? `role=${t.role} "${t.name}"` : `role=${t.role}`;
    case "text":
      return `text "${t.value}"`;
    case "xpath":
      return `xpath=${t.value}`;
  }
}

/** Human-readable one-liner for an action (for logs/evidence). */
export function describeAction(a: BrowserAction): string {
  switch (a.action) {
    case "goto":
      return `goto ${a.path}`;
    case "click":
      return `click ${describeTarget(a.target)}`;
    case "fill":
      return `fill ${describeTarget(a.target)} = "${a.value}"`;
    case "select":
      return `select ${describeTarget(a.target)} = "${a.value}"`;
    case "press":
      return `press ${a.key}`;
    case "hover":
      return `hover ${describeTarget(a.target)}`;
    case "scroll":
      return `scroll ${a.direction ?? "down"}`;
    case "wait":
      return a.forText ? `wait for "${a.forText}"` : `wait ${a.ms ?? 0}ms`;
    case "assertText":
      return `assertText "${a.value}"`;
    case "assertVisible":
      return `assertVisible ${describeTarget(a.target)}`;
    case "assertUrl":
      return `assertUrl contains "${a.contains}"`;
    case "screenshot":
      return `screenshot ${a.name ?? ""}`.trim();
    case "evaluate":
      return `evaluate <script>`;
  }
}
