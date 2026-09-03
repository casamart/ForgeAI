/**
 * The JourneyRunner — executes a browser journey step by step and judges it
 * from evidence (plan §7 Layer B, §60).
 *
 * HONESTY (plan §84): with the local HTTP-probe browser it can genuinely do
 * navigation and text/URL assertions (it reads the fetched HTML), but it CANNOT
 * click, fill, hover, scroll, evaluate JS, or judge real visibility. Those steps
 * are reported INCONCLUSIVE — never faked as a pass. With a real Solari browser
 * the same journey runs for real. The runner uses only the IBrowserPage methods
 * that already exist, so nothing about the interface pretends to be a browser.
 */
import type { IBrowserPage } from "@forgeai/solari";
import { NotSupportedError } from "@forgeai/solari";
import type { QAVerdict } from "../qa/schema.js";
import {
  describeAction,
  targetToSelector,
  type BrowserAction,
  type BrowserJourney,
} from "./actions.js";

export type StepStatus = "ok" | "failed" | "inconclusive" | "blocked";

export interface StepResult {
  index: number;
  action: BrowserAction;
  label: string;
  status: StepStatus;
  detail: string;
}

export interface JourneyResult {
  name: string;
  verdict: QAVerdict;
  steps: StepResult[];
  screenshots: string[];
}

export interface RunJourneyOptions {
  /** Directory to save screenshots into (real browser only). */
  screenshotDir?: string;
}

function joinUrl(base: string, path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

// A NotSupportedError means "this backend can't do it" → inconclusive, not fail.
function classify(err: unknown): { status: StepStatus; detail: string } {
  const e = err as Error;
  if (e?.name === "NotSupportedError") {
    return { status: "inconclusive", detail: "not supported by this browser (http-only)" };
  }
  return { status: "failed", detail: e?.message ?? String(err) };
}

export async function runJourney(
  page: IBrowserPage,
  baseUrl: string,
  journey: BrowserJourney,
  opts: RunJourneyOptions = {},
): Promise<JourneyResult> {
  const steps: StepResult[] = [];
  const screenshots: string[] = [];
  let currentUrl = baseUrl;

  for (let i = 0; i < journey.steps.length; i++) {
    const action = journey.steps[i]!;
    const label = describeAction(action);
    const res = await runStep(page, baseUrl, action, {
      getUrl: () => currentUrl,
      setUrl: (u) => (currentUrl = u),
      index: i,
      screenshotDir: opts.screenshotDir,
      screenshots,
    });
    steps.push({ index: i + 1, action, label, status: res.status, detail: res.detail });
  }

  // Verdict: the worst outcome wins, but honesty ranks BLOCKED/FAIL above unknown.
  let verdict: QAVerdict = "PASS";
  if (steps.some((s) => s.status === "blocked")) verdict = "BLOCKED";
  else if (steps.some((s) => s.status === "failed")) verdict = "FAIL";
  else if (steps.some((s) => s.status === "inconclusive")) verdict = "INCONCLUSIVE";

  return { name: journey.name, verdict, steps, screenshots };
}

interface StepCtx {
  getUrl: () => string;
  setUrl: (u: string) => void;
  index: number;
  screenshotDir?: string;
  screenshots: string[];
}

async function runStep(
  page: IBrowserPage,
  base: string,
  action: BrowserAction,
  ctx: StepCtx,
): Promise<{ status: StepStatus; detail: string }> {
  try {
    switch (action.action) {
      case "goto": {
        const url = joinUrl(base, action.path);
        const { status } = await page.goto(url);
        ctx.setUrl(url);
        if (status >= 400) return { status: "failed", detail: `GET ${action.path} -> ${status}` };
        return { status: "ok", detail: `GET ${action.path} -> ${status}` };
      }

      case "assertText": {
        const body = await page.content();
        const found = body.includes(action.value);
        return found
          ? { status: "ok", detail: `found "${action.value}"` }
          : { status: "failed", detail: `text "${action.value}" not on page` };
      }

      case "assertUrl": {
        const ok = ctx.getUrl().includes(action.contains);
        return ok
          ? { status: "ok", detail: `url contains "${action.contains}"` }
          : { status: "failed", detail: `url "${ctx.getUrl()}" missing "${action.contains}"` };
      }

      case "wait": {
        if (action.forText) {
          const body = await page.content();
          return body.includes(action.forText)
            ? { status: "ok", detail: `saw "${action.forText}"` }
            : { status: "failed", detail: `never saw "${action.forText}"` };
        }
        await new Promise((r) => setTimeout(r, Math.min(action.ms ?? 0, 5000)));
        return { status: "ok", detail: `waited ${action.ms ?? 0}ms` };
      }

      case "screenshot": {
        const name = action.name ?? `step-${ctx.index + 1}`;
        const path = ctx.screenshotDir ? `${ctx.screenshotDir}/${name}.png` : `${name}.png`;
        const bytes = await page.screenshot(path);
        if (bytes) {
          ctx.screenshots.push(path);
          return { status: "ok", detail: `screenshot ${path}` };
        }
        return { status: "ok", detail: "no screenshot (http-only)" };
      }

      // --- Interactive: real on a Solari browser, INCONCLUSIVE on http-only ---
      case "click": {
        await page.click(targetToSelector(action.target));
        return { status: "ok", detail: `clicked ${describeAction(action)}` };
      }
      case "fill": {
        await page.fill(targetToSelector(action.target), action.value);
        return { status: "ok", detail: `filled ${describeAction(action)}` };
      }
      case "select": {
        await page.evaluate(selectScript(targetToSelector(action.target), action.value));
        return { status: "ok", detail: `selected ${describeAction(action)}` };
      }
      case "hover": {
        await page.evaluate(hoverScript(targetToSelector(action.target)));
        return { status: "ok", detail: `hovered ${describeAction(action)}` };
      }
      case "press": {
        await page.evaluate(pressScript(action.key));
        return { status: "ok", detail: `pressed ${action.key}` };
      }
      case "scroll": {
        const amt = (action.direction === "up" ? -1 : 1) * (action.amount ?? 600);
        await page.evaluate(`(()=>{window.scrollBy(0,${amt});return true;})()`);
        return { status: "ok", detail: `scrolled ${action.direction ?? "down"}` };
      }
      case "assertVisible": {
        const vis = await page.evaluate<{ visible: boolean; reason?: string }>(
          visibleScript(targetToSelector(action.target)),
        );
        return vis.visible
          ? { status: "ok", detail: `visible ${describeAction(action)}` }
          : { status: "failed", detail: `not visible (${vis.reason ?? "hidden"})` };
      }
      case "evaluate": {
        await page.evaluate(action.script);
        return { status: "ok", detail: "evaluated script" };
      }
    }
  } catch (err) {
    // goto failures are BLOCKED (couldn't reach the page); the rest classify.
    if (action.action === "goto") {
      return { status: "blocked", detail: `could not reach ${action.path}: ${(err as Error).message}` };
    }
    return classify(err);
  }
}

// --- Small JS snippets used on a REAL browser (local throws NotSupported) ---
function selectScript(sel: string, value: string): string {
  return `(()=>{const el=document.querySelector(${JSON.stringify(sel)});if(!el)throw new Error('not found');el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return true;})()`;
}
function hoverScript(sel: string): string {
  return `(()=>{const el=document.querySelector(${JSON.stringify(sel)});if(!el)throw new Error('not found');el.dispatchEvent(new MouseEvent('mouseover',{bubbles:true}));return true;})()`;
}
function pressScript(key: string): string {
  return `(()=>{const el=document.activeElement||document.body;['keydown','keyup'].forEach(t=>el.dispatchEvent(new KeyboardEvent(t,{key:${JSON.stringify(key)},bubbles:true})));return true;})()`;
}
function visibleScript(sel: string): string {
  return `(()=>{const el=document.querySelector(${JSON.stringify(sel)});if(!el)return{visible:false,reason:'not found'};const r=el.getBoundingClientRect();const s=getComputedStyle(el);return{visible:r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'};})()`;
}
