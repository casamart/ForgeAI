/**
 * BaseProvider implements the provider-agnostic parts:
 *  - structuredOutput() = generate() + JSON extraction + Zod validation +
 *    a bounded repair loop that feeds the validation error back to the model
 *    (AGENTS §17). Concrete providers only implement generate() and stream().
 */
import type { ZodType } from "zod";
import type { AiProvider } from "@forgeai/shared";
import {
  AIProvider,
  ChatMessage,
  GenerateOptions,
  GenerateResult,
  StructuredOptions,
  StructuredOutputError,
  StructuredResult,
} from "./types.js";

/**
 * Pull a JSON string out of a model's reply.
 *
 * Models often wrap JSON in prose or ```json fences. This does two simple
 * things, in order:
 *   1. If there is a ```json ... ``` code fence, use what's inside it.
 *   2. Otherwise, take everything from the first "{" or "[" to the matching
 *      last "}" or "]".
 * Returns the JSON text, or null if none was found. It does NOT parse — the
 * caller decides how to parse and validate.
 */
export function extractJson(text: string): string | null {
  // Step 1: if the model used a ```json code fence, prefer its contents.
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1]!.trim() : text.trim();

  // Step 2: find where JSON starts ("{" for an object, "[" for an array).
  const firstCurly = body.indexOf("{");
  const firstSquare = body.indexOf("[");
  if (firstCurly === -1 && firstSquare === -1) return null;

  // Whichever bracket appears first is our opening bracket.
  const startsWithArray =
    firstSquare !== -1 && (firstCurly === -1 || firstSquare < firstCurly);
  const start = startsWithArray ? firstSquare : firstCurly;
  const lastBracket = startsWithArray
    ? body.lastIndexOf("]")
    : body.lastIndexOf("}");
  if (lastBracket <= start) return null;

  // The JSON is the slice from the first opening to the last closing bracket.
  return body.slice(start, lastBracket + 1);
}

export abstract class BaseProvider implements AIProvider {
  abstract readonly name: AiProvider;
  abstract readonly defaultModel: string;

  abstract generate(
    messages: ChatMessage[],
    opts?: GenerateOptions,
  ): Promise<GenerateResult>;

  abstract stream(
    messages: ChatMessage[],
    opts?: GenerateOptions,
  ): AsyncIterable<string>;

  async structuredOutput<T>(
    messages: ChatMessage[],
    schema: ZodType<T>,
    opts: StructuredOptions = {},
  ): Promise<StructuredResult<T>> {
    const maxRepairs = opts.maxRepairs ?? 2;
    const hint = opts.schemaHint
      ? `\n\nThe JSON must satisfy: ${opts.schemaHint}`
      : "";
    const instruction: ChatMessage = {
      role: "user",
      content:
        "Respond with ONLY a single valid JSON value and no prose, no code fences, no explanation." +
        hint,
    };

    const convo: ChatMessage[] = [...messages, instruction];
    let lastRaw = "";
    let usage;
    let model = this.defaultModel;

    for (let attempt = 1; attempt <= maxRepairs + 1; attempt++) {
      const res = await this.generate(convo, opts);
      lastRaw = res.text;
      usage = res.usage;
      model = res.model;

      const json = extractJson(res.text);
      if (json) {
        try {
          const parsed = schema.parse(JSON.parse(json));
          return {
            data: parsed,
            raw: json,
            model: res.model,
            provider: this.name,
            usage: res.usage,
            attempts: attempt,
          };
        } catch (err) {
          // Feed the exact failure back and ask for a correction.
          convo.push({ role: "assistant", content: res.text });
          convo.push({
            role: "user",
            content:
              "That was not valid against the schema. Error:\n" +
              (err as Error).message +
              "\nReturn corrected JSON only.",
          });
          continue;
        }
      }
      convo.push({ role: "assistant", content: res.text });
      convo.push({
        role: "user",
        content: "No JSON found. Return ONLY a valid JSON value.",
      });
    }

    throw new StructuredOutputError(
      `Failed to obtain schema-valid JSON after ${maxRepairs + 1} attempts.`,
      this.name,
      lastRaw,
      maxRepairs + 1,
    );
  }
}
