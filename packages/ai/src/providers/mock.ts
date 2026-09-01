/**
 * Mock provider — a fake AI that needs no API key and no network.
 *
 * Why it exists:
 *   - You can run and test the whole ForgeAI pipeline for free.
 *   - Tests can feed in exact, predictable answers.
 *
 * How to control what it "says":
 *   - new MockProvider()                       -> a simple echo reply
 *   - new MockProvider({ responder })          -> your own function decides
 *   - MockProvider.fromReplies(["a", "b"])     -> returns "a", then "b", ...
 *
 * It is honest by design: it never pretends to be a real model, and its
 * `name` is "mock".
 */
import { BaseProvider } from "../base.js";
import { ChatMessage, GenerateOptions, GenerateResult } from "../types.js";

// A responder decides what text to reply with, given the conversation.
export type MockResponder = (
  messages: ChatMessage[],
  opts: GenerateOptions,
) => string;

// The default reply: echo back the last user message so output is predictable.
const echoResponder: MockResponder = (messages) => {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  return `MOCK REPLY to: ${lastUser?.content ?? "(empty)"}`;
};

export interface MockOptions {
  responder?: MockResponder;
}

export class MockProvider extends BaseProvider {
  readonly name = "mock" as const;
  readonly defaultModel = "mock-model";

  private responder: MockResponder;

  constructor(options: MockOptions = {}) {
    super();
    this.responder = options.responder ?? echoResponder;
  }

  /**
   * Build a mock that returns the given replies in order. Handy in tests:
   * the first generate() returns replies[0], the second returns replies[1], etc.
   * After the list runs out, it keeps returning the last reply.
   */
  static fromReplies(replies: string[]): MockProvider {
    let index = 0;
    return new MockProvider({
      responder: () => {
        const reply = replies[Math.min(index, replies.length - 1)] ?? "";
        index++;
        return reply;
      },
    });
  }

  async generate(
    messages: ChatMessage[],
    opts: GenerateOptions = {},
  ): Promise<GenerateResult> {
    const text = this.responder(messages, opts);
    return {
      text,
      model: this.defaultModel,
      provider: this.name,
      usage: { inputTokens: 0, outputTokens: 0 },
      finishReason: "stop",
    };
  }

  async *stream(
    messages: ChatMessage[],
    opts: GenerateOptions = {},
  ): AsyncIterable<string> {
    // Stream the mock reply word by word so streaming code paths can be tested.
    const text = this.responder(messages, opts);
    for (const word of text.split(" ")) {
      yield word + " ";
    }
  }
}
