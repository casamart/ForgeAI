/**
 * Turn the output of `node --test` into pass/fail counts.
 *
 * Node's test runner prints a TAP summary that includes lines like:
 *     # pass 3
 *     # fail 1
 * We read those. If we can't find them (e.g. a plain script that just exits),
 * we fall back to the exit code: 0 = one passing "test", non-zero = one failing.
 */
import type { CommandResult } from "@forgeai/solari";

export interface TestCounts {
  passed: number;
  failed: number;
}

export function parseTestOutput(result: CommandResult): TestCounts {
  const text = `${result.stdout}\n${result.stderr}`;
  const passMatch = text.match(/#\s*pass\s+(\d+)/i);
  const failMatch = text.match(/#\s*fail\s+(\d+)/i);

  if (passMatch || failMatch) {
    return {
      passed: passMatch ? Number(passMatch[1]) : 0,
      failed: failMatch ? Number(failMatch[1]) : 0,
    };
  }

  // Fallback: use the exit code as a single pass/fail signal.
  return result.exitCode === 0
    ? { passed: 1, failed: 0 }
    : { passed: 0, failed: 1 };
}
